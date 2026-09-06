# 私域运营战术库（企微+社群+朋友圈）

中国私域运营完整战术手册——加粉、SOP、社群分层、朋友圈节奏、复购触发、流失召回。含合规警告（个微多开、爬虫等)。

## 这是什么

`private-domain-playbook` 是一个针对**中国本地场景**原创设计的 OpenClaw / SkillHub Agent Skill。

不是任何已有项目的 fork 或翻译——从问题定义、框架设计、示例都是为中国用户从零写的。

## 触发场景

详见 `SKILL.md` 的 description 字段，AI 会自动判断何时调用。常见关键词：

- `私域`
- `企业微信`
- `社群运营`
- `朋友圈 SOP`
- `用户分层`
- `复购`

## 安装

### SkillHub（推荐）

```bash
# 通过 SkillHub Web 界面下载
# https://skillhub.cloud.tencent.com/skills/private-domain-playbook
```

### OpenClaw / Claude Code

```bash
mkdir -p ~/.claude/skills
cp -R private-domain-playbook ~/.claude/skills/private-domain-playbook
```

### Cursor

把整个文件夹放到项目的 `.cursor/skills/private-domain-playbook/` 下，重启 Cursor 即可。

## 用法

直接用自然语言描述需求，AI 会自动加载本 skill。例如：

```
帮我用 私域运营战术库（企微+社群+朋友圈） 来 ...
```

## License

MIT © 2026 ikun

## 反馈

- 觉得有用：在 SkillHub 给个 star
- 报 bug / 建议：在 SkillHub 评论区留言
