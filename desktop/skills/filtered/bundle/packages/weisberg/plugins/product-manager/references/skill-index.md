# Product Manager Plugin — Skill Index

Skills for authoring, reviewing, prioritizing, roadmapping, and executing product work.

## Skills

- **prd-writer** (`name: prd-writer`) — Produces Product Requirements Documents, specs, product briefs, one-pagers, and PR/FAQs. Triggers: write a PRD, draft a spec, product doc, one-pager, PR/FAQ, feature brief. Does not trigger on PRD critique, engineering design docs, RFCs, or ADRs.
- **prd-review** (`name: prd-review`) — Reviews an existing PRD/spec/PRFAQ for approval readiness, evidence gaps, weak metrics, missing non-goals, and required changes. Triggers: review this PRD, critique my product spec, PRD quality bar, is this ready, red-team this PR/FAQ. Does not trigger on drafting a new PRD.
- **prioritization** (`name: prioritization`) — Ranks product opportunities, features, requirements, and roadmap candidates with RICE, impact-effort, confidence, evidence, and tradeoff analysis. Triggers: prioritize these features, rank this backlog, RICE score, impact effort matrix, what should we build first.
- **roadmap** (`name: roadmap`) — Produces product roadmaps and sequencing artifacts with horizon, strategy, evidence, capacity assumptions, dependencies, and gates. Triggers: build a roadmap, Now/Next/Later, quarterly roadmap, sequence these initiatives, theme-based roadmap.
- **prd-to-plan** (`name: prd-to-plan`) — Converts a PRD/spec into a structured `PLAN.md` for agentic execution: phases, tasks, dependencies, validation gates, sub-agent assignments, context bundles. Triggers: turn this PRD into a plan, agentic plan, execution plan, task graph, decompose this spec, scrum-master plan.

## Typical Flow

```
idea/brief --[prd-writer]--> PRD.md --[prd-review]--> approved PRD --[prd-to-plan]--> PLAN.md
backlog/options --[prioritization]--> ranked bets --[roadmap]--> sequenced roadmap
```
