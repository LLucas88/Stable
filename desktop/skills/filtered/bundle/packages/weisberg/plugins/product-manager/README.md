# product-manager

A Claude Code plugin for turning product ideas into requirements and then into
roadmaps, prioritization decisions, and executable, agent-ready plans.

## Skills

| Skill | What it does | Triggers on |
|-------|--------------|-------------|
| **prd-writer** | Produces Product Requirements Documents, specs, product briefs, one-pagers, and "Working Backwards" PR/FAQs. | "write a PRD", "draft a spec", "product doc", "one-pager", "PR/FAQ", "feature brief". Does *not* trigger for PRD critique, engineering design docs, RFCs, or ADRs. |
| **prd-review** | Reviews an existing PRD/spec/PRFAQ against the product quality bar, with severity-ranked findings, evidence gaps, and required changes before approval. | "review this PRD", "critique my product spec", "is this PRD ready", "PRD quality bar", "red-team this PR/FAQ". |
| **prioritization** | Ranks and compares product ideas, backlog items, requirements, or roadmap candidates using RICE, impact-effort, confidence, evidence, and tradeoff analysis. | "prioritize these features", "rank this backlog", "RICE score", "impact effort matrix", "what should we build first". |
| **roadmap** | Builds product roadmaps and sequencing artifacts: Now/Next/Later, quarterly, release-based, or theme-based plans with evidence, capacity assumptions, dependencies, and decision gates. | "build a roadmap", "roadmap these initiatives", "now next later", "quarterly roadmap", "sequence this backlog". |
| **prd-to-plan** | Converts a PRD or spec into a structured `PLAN.md` for agentic execution: phases, tasks, dependencies, validation gates, sub-agent assignments, and context bundles. | "turn this PRD into a plan", "agentic plan", "execution plan", "task graph", "decompose this spec", "break this down for Claude Code", "scrum-master plan". |

## How they chain

```
idea / brief --[prd-writer]--> PRD.md --[prd-review]--> approved PRD
      backlog/options --[prioritization]--> ranked bets --[roadmap]--> sequenced roadmap
      approved PRD --[prd-to-plan]--> PLAN.md --> agentic execution
```

`prd-writer` numbers requirements (`R1`, `R2`, …) and surfaces open questions;
`prd-review` checks whether the PRD is ready to approve; `prioritization`
decides which bets deserve attention; `roadmap` sequences those bets across a
horizon; and `prd-to-plan` consumes approved requirement IDs to build a PRD-to-task
crosswalk and turn leftover open questions into Phase 0 discovery tasks. Each skill
can also be used on its own.

`prd-to-plan` keeps its worked templates (the `PLAN.md` skeleton, task
specification template, risk register, and antipattern catalog) in
`skills/prd-to-plan/references/examples.md`.

## Local testing

```bash
claude --plugin-dir ./plugins/product-manager
```

Reload after edits with `/reload-plugins`. Validate the manifest, skill
frontmatter, and structure with `claude plugin validate`.
