---
name: alireza-business-growth-skills
description: 'Router/index for the 4 business & growth skills bundled in this plugin: customer-success-manager (health scoring, churn risk, expansion), sales-engineer (RFP analysis, competitive matrices, PoC planning), revenue-operations (pipeline, forecast accuracy, GTM efficiency), and contract-and-proposal-writer. Use when a growth/revenue request doesn''t obviously match one skill and you need to pick the right one (e.g., ''which accounts are at risk'', ''should we bid on this RFP'').'
metadata:
  source-name: business-growth-skills
  bundle: ops-expanded-2026-09-06
  upstream-version: 2.9.0
  upstream-author: Alireza Rezvani
  upstream-tags: '["business", "customer-success", "sales", "revenue-operations", "growth"]'
  upstream-agents: '["claude-code", "codex-cli", "openclaw"]'
  upstream-metadata: '{}'
license: MIT
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Business & Growth Skills — Router

This plugin bundles **4 skills** (this router is the 5th folder under `business-growth/skills/`). Each skill is self-contained.

## Routing table

Match the request, then load `business-growth/skills/<skill>/SKILL.md`. If multiple rows match, ask one clarifying question first.

| Request signals | Skill | Path |
|---|---|---|
| Customer health scores, churn risk, expansion plays | customer-success-manager | `skills/customer-success-manager/` |
| RFP/RFI coverage, competitive positioning, PoC plans | sales-engineer | `skills/sales-engineer/` |
| Pipeline coverage, forecast accuracy (MAPE), GTM efficiency | revenue-operations | `skills/revenue-operations/` |
| Proposals, contracts, statements of work, DPAs | contract-and-proposal-writer | `skills/contract-and-proposal-writer/` |

## Quick start

```bash
# Example: route an account-health request
cat business-growth/skills/customer-success-manager/SKILL.md
python3 business-growth/skills/customer-success-manager/scripts/health_score_calculator.py --help
```

## Rules

- Route to exactly one skill, then follow that skill's workflow. This router ships no tools of its own.
- Use the skills' Python scorers for metrics, not manual estimates; deal/contract outputs are drafts for human legal/commercial review.
