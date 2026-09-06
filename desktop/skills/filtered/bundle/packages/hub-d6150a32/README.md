# AI 海报式 PPT（朋友圈/小红书可发）

生成 1-12 张海报式幻灯片，专为朋友圈/小红书/视频号封面设计。竖图 9:16 + 方图 1:1 + 横图 16:9 三种比例可选。

## 这是什么

`ai-poster-deck` 是一个针对**中国本地场景**原创设计的 OpenClaw / SkillHub Agent Skill。

不是任何已有项目的 fork 或翻译——从问题定义、框架设计、示例都是为中国用户从零写的。

## 触发场景

详见 `SKILL.md` 的 description 字段，AI 会自动判断何时调用。常见关键词：

- `海报`
- `朋友圈封面`
- `小红书封面`
- `九宫格`
- `AI 配图`
- `竖屏 PPT`

## 安装

### SkillHub（推荐）

```bash
# 通过 SkillHub Web 界面下载
# https://skillhub.cloud.tencent.com/skills/ai-poster-deck
```

### OpenClaw / Claude Code

```bash
mkdir -p ~/.claude/skills
cp -R ai-poster-deck ~/.claude/skills/ai-poster-deck
```

### Cursor

把整个文件夹放到项目的 `.cursor/skills/ai-poster-deck/` 下，重启 Cursor 即可。

## 用法

直接用自然语言描述需求，AI 会自动加载本 skill。例如：

```
帮我用 AI 海报式 PPT（朋友圈/小红书可发） 来 ...
```

## License

MIT © 2026 ikun

## 反馈

- 觉得有用：在 SkillHub 给个 star
- 报 bug / 建议：在 SkillHub 评论区留言
