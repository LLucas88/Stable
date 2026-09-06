#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""起点章节量化质检脚本（纯本地，无外部依赖、无网络、不调用任何 API）。

用法：
    python scripts/check_chapter.py <章节文件.md>
    python scripts/check_chapter.py --all novels/<书名>/        # 批量检查目录下"第XX章"文件

「去 AI 味」检测为多维启发式（非关键词黑名单）：
  - 修饰词密度 / 连接词密度（AI 偏好堆修饰与过渡词）
  - 成语密度（AI 爱用四字格成排）
  - 句长方差系数（AI 句式过度工整、缺乏短句破句）
  - 排比密度（连续同首句式）
  - 对话标记多样性（AI 说话动词单调）
  合成 0-100 的「AI 味指数」，越高越像机器生成。该指数为弱启发式，
  仅供人工参考，不能替代真实判别。
"""
import argparse
import math
import os
import re

CJK = re.compile(r'[\u4e00-\u9fff]')
QUOTE = re.compile(r'[“"‘\'](.*?)[”"’\']|「(.*?)」|『(.*?)』')
HOOK_KW = ['没想到', '竟', '竟然', '突然', '究竟', '为何', '谁料', '不料',
           '原来', '秘密', '真相', '危机', '杀机', '逆转', '背叛']
CLIMAX_KW = ['打脸', '逆袭', '突破', '碾压', '震惊', '爆发', '爽', '反杀',
             '翻盘', '震撼', '惊艳', '吊打', '完胜']
CONFLICT_KW = ['冲突', '危机', '对峙', '杀', '战', '争', '逼', '威胁',
               '阴谋', '背叛', '羞辱', '挑衅']

# —— 去 AI 味多维检测器词表（启发式，非穷举）——
# 1) 修饰/描写类高危词（AI 爱堆砌）
AI_MODIFIERS = ['璀璨', '瑰丽', '绚烂', '宛如', '仿佛', '不禁', '悄然', '缓缓',
                '微微', '那一瞬间', '令人', '尤为', '格外', '显得', '透着',
                '萦绕', '弥漫', '宛若', '犹如', '煞是', '分外', '愈发', '愈发的',
                '隐隐', '莫名', '一种说不清', '难以言喻', '油然而生']
# 2) AI 腔连接词 / 过渡词
AI_CONNECTIVES = ['然而', '因此', '于是', '与此同时', '值得一提的是', '不可否认',
                  '综上所述', '显而易见', '毋庸置疑', '众所周知', '毫不意外',
                  '不得不说', '从某种意义', '换句话说', '诚然', '固然', '换言之',
                  '究其根本', '归根结底', '某种意义上', '不可否认的是',
                  '毫不夸张地说', '细想之下']
# 3) 常见四字成语（AI 叙事偏好密集使用；仅取高频子集作信号）
IDIOMS = [
    '莫名其妙', '不可思议', '出人意料', '始料未及', '毋庸置疑', '显而易见',
    '众所周知', '顺理成章', '水到渠成', '理所当然', '意料之中', '猝不及防',
    '措手不及', '惊心动魄', '扣人心弦', '荡气回肠', '惊涛骇浪', '风平浪静',
    '波澜不惊', '暗流涌动', '山雨欲来', '风雨欲来', '一触即发', '剑拔弩张',
    '一鸣惊人', '脱颖而出', '鹤立鸡群', '独树一帜', '别具一格', '超凡脱俗',
    '出类拔萃', '卓尔不群', '深不可测', '高深莫测', '深藏不露', '大智若愚',
    '运筹帷幄', '决胜千里', '胸有成竹', '成竹在胸', '稳操胜券', '胜券在握',
    '截然不同', '天壤之别', '云泥之别', '判若云泥', '相形见绌', '黯然失色',
    '光彩夺目', '熠熠生辉', '熠熠生辉', '金碧辉煌', '美不胜收', '赏心悦目',
    '心旷神怡', '神清气爽', '沁人心脾', '回味无穷', '历历在目', '栩栩如生',
    '跃然纸上', '呼之欲出', '入木三分', '淋漓尽致', '丝丝入扣', '环环相扣',
    '千丝万缕', '错综复杂', '扑朔迷离', '错综复杂', '盘根错节', '迷雾重重',
    '真相大白', '水落石出', '拨云见日', '豁然开朗', '恍然大悟', '茅塞顿开',
    '柳暗花明', '峰回路转', '绝处逢生', '转危为安', '化险为夷', '逢凶化吉',
    '势如破竹', '所向披靡', '锐不可当', '势不可挡', '摧枯拉朽', '排山倒海',
    '雷霆万钧', '排山倒海', '震古烁今', '惊天动地', '石破天惊', '举世瞩目',
    '万众瞩目', '声名鹊起', '声名远扬', '如雷贯耳', '家喻户晓', '无人不知',
    '不速之客', '不请自来', '不期而遇', '狭路相逢', '冤家路窄', '针锋相对',
    '唇枪舌剑', '剑拔弩张', '明争暗斗', '勾心斗角', '尔虞我诈', '老谋深算',
    '处心积虑', '殚精竭虑', '煞费苦心', '苦心孤诣', '用心良苦', '良苦用心',
    '顺水推舟', '趁热打铁', '乘胜追击', '一鼓作气', '一气呵成', '行云流水',
    '浑然天成', '天衣无缝', '完美无缺', '无懈可击', '滴水不漏', '严丝合缝',
    '不谋而合', '不约而同', '异口同声', '众志成城', '同心协力', '齐心协力',
]
# 4) 对话标记动词（用于检测单调性）
DIALOG_TAG = re.compile(
    r'[他她我你它男女][\u4e00-\u9fff]{0,3}?'
    r'(说|道|笑|冷笑|哼|骂|喝|问|答|喊|叫|低语|喃喃|沉声|回|应)'
)

MIN_WORDS, MAX_WORDS = 2000, 4000
MIN_DIALOG, MAX_DIALOG = 10.0, 45.0
MAX_AI_INDEX = 40.0          # AI 味指数门槛起点（越低越像人写）


def count_words(text):
    return len(CJK.findall(text))


def per_k(count, words):
    return round(count / words * 1000, 2) if words else 0.0


def dialog_ratio(text):
    total = count_words(text)
    if total == 0:
        return 0.0
    qchars = 0
    for m in QUOTE.finditer(text):
        seg = m.group(1) or m.group(2) or m.group(3) or ''
        qchars += len(CJK.findall(seg))
    return round(qchars / total * 100, 1)


def last_para(text):
    paras = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
    return paras[-1] if paras else ''


def hook_detect(text):
    lp = last_para(text)
    if re.search(r'[？！…]', lp):
        return True
    if any(k in lp for k in HOOK_KW):
        return True
    return False


def climax_count(text):
    return sum(len(re.findall(re.escape(k), text)) for k in CLIMAX_KW)


def emotion_turn(text):
    return any(k in text for k in CONFLICT_KW)


def sentences(text):
    """按句末标点切分，返回每句的中文字数列表。"""
    parts = re.split(r'[。！？；…]+', text)
    return [len(CJK.findall(p)) for p in parts if CJK.findall(p)]


def dialog_tag_stats(text):
    verbs = [m.group(1) for m in DIALOG_TAG.finditer(text)]
    if not verbs:
        return 0, 0
    return len(verbs), len(set(verbs))


def ai_flavor_index(text):
    """返回 (AI味指数0-100, 各维度明细dict)。"""
    words = count_words(text)
    if words == 0:
        return 0.0, {}

    mod = per_k(sum(len(re.findall(re.escape(w), text)) for w in AI_MODIFIERS), words)
    conn = per_k(sum(len(re.findall(re.escape(w), text)) for w in AI_CONNECTIVES), words)
    idiom = per_k(sum(len(re.findall(re.escape(w), text)) for w in IDIOMS), words)

    lens = sentences(text)
    n_sent = len(lens)
    mean_len = sum(lens) / n_sent if n_sent else 0.0
    if n_sent >= 2:
        var = sum((x - mean_len) ** 2 for x in lens) / n_sent
        cv = math.sqrt(var) / mean_len if mean_len else 0.0
    else:
        cv = 0.0

    # 排比：连续两句首两字相同
    heads = [''.join(CJK.findall(s)[:2]) for s in re.split(r'[。！？；…]+', text) if CJK.findall(s)]
    para = sum(1 for a, b in zip(heads, heads[1:]) if len(a) == 2 and a == b)
    para_per_k = per_k(para, words)

    d_total, d_distinct = dialog_tag_stats(text)

    # —— 合成指数（各维度封顶加权，总和封顶 100）——
    idx = 0.0
    idx += min(mod / 12.0, 1.0) * 18
    idx += min(conn / 10.0, 1.0) * 15
    idx += min(idiom / 18.0, 1.0) * 17
    if n_sent >= 5 and mean_len > 26:
        rhythm = max(0.0, (0.5 - cv) / 0.5)   # cv 越低（越工整）分越高
        idx += rhythm * 18
    idx += min(para_per_k / 4.0, 1.0) * 16
    if d_total >= 4 and d_distinct <= 2:
        idx += 14
    idx = round(min(idx, 100.0), 1)

    detail = {
        '修饰词密度': f'{mod}/千字',
        '连接词密度': f'{conn}/千字',
        '成语密度': f'{idiom}/千字',
        '句均长': f'{round(mean_len,1)}字',
        '句长方差CV': f'{round(cv,2)}',
        '排比密度': f'{para_per_k}/千字',
        '对话标记': f'{d_total}次/{d_distinct}种',
    }
    return idx, detail


def analyze(path):
    with open(path, encoding='utf-8') as f:
        text = f.read()
    if text.startswith('---'):
        text = re.sub(r'^---.*?---', '', text, count=1, flags=re.S)

    words = count_words(text)
    ratio = dialog_ratio(text)
    hook = hook_detect(text)
    clim = climax_count(text)
    turn = emotion_turn(text)
    ai_idx, ai_detail = ai_flavor_index(text)

    checks = [
        ('字数 2000–4000', MIN_WORDS <= words <= MAX_WORDS, f'{words}字'),
        ('章末钩子', hook, '有' if hook else '缺'),
        ('爆点≥1', clim >= 1, f'{clim}处'),
        ('情绪拐点', turn, '有' if turn else '缺'),
        (f'AI味指数<{MAX_AI_INDEX}', ai_idx < MAX_AI_INDEX, f'{ai_idx}'),
        (f'对话占比{MIN_DIALOG}–{MAX_DIALOG}%',
         MIN_DIALOG <= ratio <= MAX_DIALOG, f'{ratio}%'),
    ]
    passed = all(ok for _, ok, _ in checks)
    grade = '低（像人写）' if ai_idx < 40 else ('中' if ai_idx < 60 else '高（像机器）')

    print(f'\n=== {os.path.basename(path)} ===')
    print(f'正文字数 : {words}')
    print(f'对话占比 : {ratio}%')
    print(f'章末钩子 : {"有" if hook else "缺 ❌"}')
    print(f'爆点计数 : {clim} 处')
    print(f'情绪拐点 : {"有" if turn else "缺 ❌"}')
    print(f'AI味指数 : {ai_idx}  →  {grade}')
    print('--- 去 AI 味体检 ---')
    for k, v in ai_detail.items():
        print(f'  · {k}: {v}')
    print('--- 交付门槛 ---')
    for name, ok, val in checks:
        print(f'  [{"✅" if ok else "❌"}] {name} ({val})')
    print(f'结论 : {"达标可交付 ✅" if passed else "需修改复测 ❌"}')
    return passed


def main():
    ap = argparse.ArgumentParser(description='起点章节量化质检（含去 AI 味多维检测）')
    ap.add_argument('path', help='章节文件或目录')
    ap.add_argument('--all', action='store_true', help='批量检查目录下所有"第XX章"md 文件')
    args = ap.parse_args()

    if args.all or os.path.isdir(args.path):
        d = args.path
        files = sorted(
            f for f in os.listdir(d)
            if f.endswith('.md') and re.match(r'第\d+章', f)
        )
        if not files:
            print('未找到"第XX章"章节文件。')
            return
        ok = 0
        for f in files:
            if analyze(os.path.join(d, f)):
                ok += 1
        print(f'\n批量结果：{ok}/{len(files)} 达标')
    else:
        analyze(args.path)


if __name__ == '__main__':
    main()
