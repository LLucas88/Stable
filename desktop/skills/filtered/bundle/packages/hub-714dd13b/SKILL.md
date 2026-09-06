---
name: hub-714dd13b-sales-pro
description: 从获客到复购的完整销售闭环。17个Phase覆盖策略定位、获客开发、跟进培育、需求挖掘、方案报价、谈判成交、签约交付、客户维护、复购转介绍、流失挽回、销售管理、直播带货、私域运营、内容营销、定价策略、销售心理学。适用于B2B/B2C全行业，含话术模板、合同工具、邮件自动化系统。
metadata:
  source-name: sales-pro
  bundle: ops-expanded-2026-09-06
  upstream-title: 销售高手技能包
  upstream-version: 2.0.0
  upstream-author: Yuewe Hermes Shop
  upstream-dependencies: '[]'
  upstream-platforms: '["linux", "macos", "windows"]'
  upstream-metadata: '{"hermes": {"tags": ["销售", "获客", "客户管理", "签约", "复购", "转介绍", "CRM", "销售漏斗", "直播带货", "私域", "内容营销", "定价", "销售心理学"], "category": "sales-pro", "related_skills": ["sales-master"]}}'
license: MIT
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# 💼 销售高手技能包

> 好销售不是天赋，是系统。6个技能覆盖销售全流程：获客 → 沟通 → 谈判 → 成交 → 复购 → 管理。

## 什么时候用

- 刚入行不知从哪开始 / 获客难不知去哪找客户
- 加了微信不知怎么推进 / 客户聊了半天不成交
- 不知怎么报价谈判逼单 / 签完单不知怎么维护
- 客户流失不知怎么挽回 / 想系统化管理客户
- 想做直播带货/私域运营/内容营销
- 想学定价策略和销售心理学

**核心一句话：只要涉及"卖东西给客户"的任何环节，先用这个skill包。**

---

## 目录结构

```
sales-pro/
├── SKILL.md                         ← 本文件（总纲入口）
├── DESCRIPTION.md                   ← 技能包介绍
│
├── sales-master/                    ← ⭐ 主Skill（推荐，17 Phase完整版）
│   ├── SKILL.md                     ← 17个Phase主文件（318行）
│   ├── README.md                    ← GitHub展示用
│   ├── references/ (15个)           ← 深度参考文件
│   │   ├── objection-handling.md         ← 8大异议处理
│   │   ├── contract-templates.md         ← 报价单+合同+催款系统
│   │   ├── key-dates-system.md           ← 生日/合同到期/续约提醒
│   │   ├── client-profile-template.md    ← 客户信息卡模板
│   │   ├── email-automation.md           ← 邮件自动化手册
│   │   ├── advanced-scenarios.md         ← 进阶场景（提成/招投标/社群）
│   │   ├── advanced-tactics.md           ← 高阶战术（ABM/Battle Card/Blocker）
│   │   ├── advanced-templates.md         ← 高阶模板（标书/竞品卡/赢输分析）
│   │   ├── customer-success.md           ← 客户成功（流失率/SaaS指标/计算示例）
│   │   ├── sales-management.md           ← 销售管理（配额/SPIF/合规/辅导）
│   │   ├── live-streaming-sales.md       ← 直播带货全流程
│   │   ├── private-traffic-ops.md        ← 私域流量运营
│   │   ├── content-marketing-sales.md    ← 内容营销驱动销售
│   │   ├── pricing-strategy.md           ← 定价策略
│   │   └── sales-psychology.md           ← 销售心理学
│   ├── scripts/ (5个)               ← 邮件自动化工具
│   │   ├── email_automation.py           ← SMTP+SQLite+APScheduler
│   │   ├── email_config.example.yaml     ← 配置模板
│   │   ├── email_test.py                 ← 测试脚本
│   │   ├── reset_test_data.py            ← 重置演示数据
│   │   └── requirements.txt              ← Python依赖
│   └── templates/ (4个)             ← 演示数据
│       ├── demo-clients.md               ← 3个mock客户档案
│       ├── demo-contracts.md             ← 报价单+合同+保单示例
│       ├── demo-scripts.md               ← 6场景话术
│       └── usage-guide.md                ← 使用指南
│
├── cold-outreach/                   ← 子Skill：客户开发与触达
├── sales-scripts/                   ← 子Skill：销售话术与成交
├── negotiation/                     ← 子Skill：谈判与异议处理
├── client-management/               ← 子Skill：客户关系管理与复购
└── crm-tracker/                     ← 子Skill：销售跟进追踪器
```

## 主Skill vs 子Skill

| 选择 | 安装什么 | 适合谁 |
|------|---------|--------|
| ⭐ **完整体验（推荐）** | 只装 `sales-master/` | 想要全套销售系统的用户 |
| 只需某环节 | 装对应子Skill | 只要某个功能的用户 |
| 全部安装 | 整个 `sales-pro/` | 想要最全覆盖的用户 |

> 子Skill是主Skill的"精简独立版"，内容有重叠。`sales-master/`包含所有子Skill的内容+更多。

---

## 17个Phase全景

```
Phase 1     策略定位        → ICP客户画像 · 四种性格 · 差异化定位
Phase 1.5   每日工作规范     → 时间表 · 产品知识 · 出差 · 展会 · 投诉
Phase 2     获客开发        → 渠道矩阵 · 微信获客 · 电话陌拜 · BANT/MEDDIC
Phase 3     跟进培育        → 14天触达节奏 · 跟进话术 · 朋友圈内容
Phase 4     需求挖掘        → SPIN提问 · 3F倾听 · 5Why深挖
Phase 5     方案报价        → 7部分方案结构 · FABE · 3种报价策略
Phase 6     谈判成交        → 8大异议 · 4条让步原则 · 7种逼单法
Phase 7     签约交付        → 合同清单 · 付款节奏 · 催款 · Onboarding
Phase 8     客户维护        → ABCD分级 · 喜好档案 · 关键日期系统 ⭐
Phase 9     复购扩展        → 6种复购策略 · 转介绍系统
Phase 10    流失挽回        → 预警信号 · 4种挽回场景
Phase 11    销售复盘        → 漏斗诊断 · 加权预测 · 周报模板
Phase 12    进阶场景        → 提成方案 · 招投标 · 多客户管理 · 社群转化
Phase 13    高阶战术        → 多决策者 · Battle Card · 赢输分析 · ABM
Phase 14    客户成功        → 流失率 · 健康度 · SaaS指标 · Land&Expand
Phase 15    销售管理        → 配额 · SPIF · 反贿赂 · 行业差异化 · 1对1辅导
Phase 16    数字化获客      → 直播带货 · 短视频销售 · 私域流量 · 内容营销
Phase 17    定价与心理学     → 5大定价法 · 涨价策略 · 7大购买触发器 · 信任建立
```

---

## 快速使用指南

| 用户说 | 用哪个Skill | 输出 |
|--------|------------|------|
| "怎么找客户"/"获客" | sales-master Phase 2 / cold-outreach | 渠道推荐 + 触达话术 |
| "客户说太贵了" | sales-master Phase 6 / negotiation | 5种异议处理回复 |
| "怎么逼单" | sales-master Phase 6 / sales-scripts | 7种逼单方法 |
| "怎么维护客户" | sales-master Phase 8 / client-management | 分级管理 + 维护节奏 |
| "客户生日"/"合同到期" | sales-master Phase 8 | 关键日期提醒系统 |
| "怎么做直播带货" | sales-master Phase 16 | → `references/live-streaming-sales.md` |
| "怎么做私域运营" | sales-master Phase 16 | → `references/private-traffic-ops.md` |
| "怎么定价/涨价" | sales-master Phase 17 | → `references/pricing-strategy.md` |
| "帮我做销售计划" | sales-master Phase 1+11 | 客户画像 + 漏斗 + 目标 |
| "帮我写合同"/"催款" | sales-master Phase 7 | → `references/contract-templates.md` |

---

## 核心亮点

### 1. 话术直接复制使用
每个场景都有填好变量的完整话术，不是"你要共情客户"这种正确的废话，而是：
```
「王总，贵不贵要看跟什么比。
跟竞品比，我们贵10%，但效果好50%。
跟不解决的损失比，这个投入3个月就回来了。」
```

### 2. 客户性格自适应
4种性格类型（🔴支配型/🟡表达型/🟢亲和型/🔵分析型），不同性格用不同话术。

### 3. 邮件自动化系统
自带Python邮件系统：定时发送 / 生日提醒 / 合同到期预警 / 日报周报月报 / 营销群发。

### 4. 数字化销售全覆盖
直播带货（抖音/快手/视频号/小红书）+ 私域运营（企微/社群/朋友圈）+ 内容营销（小红书/知乎/公众号）。

### 5. 定价与心理学
5大定价方法 + 涨价策略 + 7大购买心理触发器 + 信任建立公式。

---

## 使用方式

1. **完整使用**：加载 `sales-master` 主Skill，AI自动匹配17个Phase
2. **模块使用**：加载对应子Skill（如 `negotiation`），只获取该模块内容
3. **直接提问**：遇到任何销售问题直接问，AI自动匹配

```
示例对话：
"我是卖AI客服系统的，客户是中小企业，客单价5-8万/年，怎么找客户？"
"客户说太贵了怎么回？"
"合同快到期了怎么续约？"
"怎么做直播带货？"
"怎么给产品定价？"
```

---

## 适用行业

全行业通用：B2B/B2C/服务业/零售/地产/保险/教育/SaaS/电商/制造业

## 技术栈

| 组件 | 技术 |
|------|------|
| Skill格式 | SKILL.md（YAML frontmatter + Markdown body） |
| 邮件系统 | Python 3 · smtplib · SQLite · APScheduler |
| 配置 | YAML（SMTP + 公司信息 + 销售人员信息） |
| 兼容 | Hermes Agent · Claude Code · ChatGPT · 任何支持SKILL.md的AI工具 |

---

## 版本信息

```
名称：sales-pro（技能包）/ sales-master（主Skill）
版本：2.0.0
分类：sales-pro
许可：MIT
Phase：17个（从策略定位到定价心理学）
参考文件：15个
话术模板：60+套
总文件数：32个 / 409KB
```

**一句话总结：只要涉及"卖东西给客户"的任何环节，先用这个Skill。**
