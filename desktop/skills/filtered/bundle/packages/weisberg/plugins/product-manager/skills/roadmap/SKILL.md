---
name: weisberg-roadmap
description: Use this skill when the user wants a product roadmap, initiative sequencing, Now/Next/Later plan, quarterly roadmap, release theme map, product strategy-to-roadmap translation, or executive roadmap narrative. Trigger on phrases like "build a roadmap", "roadmap these initiatives", "what should be now next later", "sequence this backlog", "quarterly product roadmap", "theme-based roadmap", or "plan the next two quarters". Do NOT trigger for drafting or reviewing a single PRD (use prd-writer or prd-review), converting a PRD into an agentic PLAN.md (use prd-to-plan), or scoring/ranking a set of options without a time horizon (use prioritization).
metadata:
  source-name: roadmap
  bundle: ops-expanded-2026-09-06
  upstream-allowed-tools: '["Read", "Write", "Edit", "Grep", "Glob", "Bash", "AskUserQuestion"]'
  upstream-mutating: 'True'
  upstream-version: 1.0.0
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Product Roadmap

## Contract

Create a decision-ready product roadmap that connects strategy, customer
problems, evidence, capacity, dependencies, risks, and tradeoffs. The roadmap is
a sequencing artifact, not a promise ledger or a disguised project plan.

Hard gates:

- Do not sequence work without a planning horizon and objective. Ask once or
  return `NEEDS_CONTEXT`.
- Do not attach exact dates unless they are provided or verified from source
  evidence. Use `Now / Next / Later`, quarters, or confidence bands when dates
  are uncertain.
- Do not include initiatives that lack a customer/problem statement. Put them in
  `Needs discovery`, not on the committed roadmap.
- Do not present capacity as known when staffing, team count, or engineering
  availability is missing. Use relative capacity and mark assumptions.

Evidence requirements:

- Inspect supplied PRDs, briefs, backlog exports, research, analytics, support
  themes, sales/GTM input, dependency docs, existing roadmaps, OKRs, and decision
  logs before sequencing.
- Every roadmap item must show its evidence source or an explicit assumption.
- Every sequencing choice must name the main reason: customer value,
  strategic fit, dependency, capacity, risk reduction, learning value, or
  deadline.
- If evidence is thin, deliver a discovery roadmap and mark the status
  `DONE_WITH_CONCERNS`, not `DONE`.

Artifact paths and naming:

- Write artifacts to the first existing parent, creating the final directory if
  needed: `workspace/product/roadmaps/` then `product/roadmaps/`.
- Filename: `YYYYMMDD-HHMMSS-roadmap-<slug>.md`.
- If the user requests a roadmap table only, return inline and set
  `Artifact: none - returned inline`.

## Workflow

1. **Classify mode.**
   - `quick`: Now/Next/Later for a small set of initiatives.
   - `standard`: quarterly or theme-based roadmap for one product area.
   - `deep`: multi-product, multi-team, regulated, or executive roadmap.
   - `refresh`: update an existing roadmap after new evidence or capacity change.
2. **Define frame.** Identify audience, horizon, objective, product area,
   constraints, capacity model, decision owner, and the roadmap format. Ask once
   if horizon or objective is missing.
3. **Inventory evidence and candidates.** Gather initiatives from PRDs, backlog,
   research, analytics, customer/support themes, stakeholder asks, and existing
   commitments. Deduplicate and preserve source links/paths.
4. **Set sequencing principles.** State the 3-5 rules that will govern tradeoffs,
   such as customer pain, revenue exposure, platform dependency, regulatory
   deadline, strategic bet, learning velocity, or engineering leverage.
5. **Cluster into themes.** Group initiatives by customer problem or strategic
   theme. Split work that is too broad to evaluate and move unclear work to
   discovery.
6. **Sequence the roadmap.** Place initiatives into Now/Next/Later, quarters, or
   releases. For each item, include confidence, dependency, capacity assumption,
   and decision gate.
7. **Validate the shape.** Check for overloaded periods, hidden dependencies,
   roadmap items with no evidence, deadline claims without source, and missing
   non-goals. Repair or flag issues before handback.
8. **Write and summarize.** Save the artifact when durable output is requested or
   the roadmap is substantial. Re-read written files and return the status block.

## Output Format

Use this artifact structure:

```markdown
# Product Roadmap: <scope>

**Audience:** <exec/team/customer-facing/internal>
**Horizon:** <Now/Next/Later | quarters | releases>
**Objective:** <objective>
**Format:** Now/Next/Later | Quarterly | Theme-based | Release-based
**Confidence:** High | Medium | Low

## Evidence Used
## Roadmap Principles
## Roadmap Narrative
## Themes
## Roadmap Table
| Initiative | Theme | Customer problem | Evidence | Timeframe | Confidence | Dependencies | Gate |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Needs Discovery
## Capacity And Assumptions
## Dependencies
## Risks And Tradeoffs
## Decisions Needed
## Change Log
```

Close every run with:

```text
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Artifact: <path or "none - returned inline">
Roadmap format: <format>
Horizon: <horizon>
Initiatives sequenced: <count>
Evidence used: <source list>
Residual risk: <none or concise list>
Next skill: prioritization | prd-writer | prd-review | prd-to-plan | none
```

Status meanings:

- `DONE`: roadmap produced with objective, horizon, evidence, capacity
  assumptions, dependencies, and decision gates.
- `DONE_WITH_CONCERNS`: roadmap is usable but evidence, capacity, dates, or
  ownership are incomplete.
- `BLOCKED`: candidate list or source roadmap/backlog cannot be accessed.
- `NEEDS_CONTEXT`: objective, horizon, or audience remains unclear after one
  clarification pass.

## Anti-Patterns

- Treating a roadmap as a list of stakeholder requests.
- Using dates as confidence theater when the evidence only supports sequencing.
- Hiding capacity assumptions.
- Roadmapping features with no customer problem or strategic link.
- Confusing prioritization score with roadmap placement.
- Presenting roadmap commitments without dependencies and decision gates.
- Creating a roadmap that cannot explain what was deliberately not chosen.
