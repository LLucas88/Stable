# 抖音爆款脚本(信息流/直播/带货)

针对抖音平台特性写的爆款短视频脚本生成器——3 秒钩子 + 痛点共鸣 + 解决方案 + 行动召唤四段式。区分信息流广告、直播间话术、带货脚本三种用途。

## 这是什么

`douyin-script-zh` 是一个针对**中国本地场景**原创设计的 OpenClaw / SkillHub Agent Skill。
从问题定义、框架设计、示例都是为中国用户从零写的，不是任何已有项目的翻译或 fork。

## 触发场景

详见 `SKILL.md` 的 description 字段，AI 会自动判断何时调用。常见关键词：

- `抖音脚本`
- `短视频脚本`
- `信息流`
- `直播带货`
- `爆款`
- `钩子`
- `DOU+`
- `投流`

## 安装

### SkillHub（推荐）

通过 SkillHub Web 界面安装：https://skillhub.cloud.tencent.com/skills/douyin-script-zh

### OpenClaw / Claude Code

```bash
mkdir -p ~/.claude/skills
cp -R douyin-script-zh ~/.claude/skills/douyin-script-zh
```

### Cursor

把整个文件夹放到项目的 `.cursor/skills/douyin-script-zh/` 下，重启 Cursor 即可。

## 用法

直接用自然语言描述需求，AI 会自动加载本 skill。例如：

```
帮我用 抖音爆款脚本(信息流/直播/带货) 来 ...
```

## License

MIT © 2026 ikun

## 反馈

- 觉得有用：在 SkillHub 给个 star
- 报 bug / 建议：SkillHub 评论区留言
