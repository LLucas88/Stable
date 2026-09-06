# 📋 Product Planning & Execution

[← Back to all domains](../README.md)

Skills for setting goals, building roadmaps, writing requirements, and coordinating delivery across product, engineering, and design.

Planning is where strategy meets reality. Most planning failures aren't about picking the wrong features — they're about goals disconnected from strategy, requirements too vague for engineering, and delivery plans that ignore dependencies. This domain gives your agent the rigor to connect each step: from strategy-aligned goals through prioritized roadmaps to development-ready stories.

---

## 📋 What's inside

This domain covers the full planning-to-delivery arc:

```text
company strategy
    ↓
goal setting (OKRs / KPIs)
    ↓
strategy alignment check
    ↓
roadmap prioritization
    ↓
requirements / PRD
    ↓
user stories
    ↓
delivery planning
    ↓
retrospective → next cycle
```

Skills connect linearly but you can enter at any stage. The retrospective feeds learning back into the next planning cycle.

---

## 🔗 How the skills connect

**The planning pipeline:**
- `set-goals-okrs-kpis` defines measurable goals → feeds `align-goals-to-strategy`
- `align-goals-to-strategy` validates that goals match company priorities → feeds back to `set-goals-okrs-kpis` if gaps exist
- `build-roadmap-prioritization` ranks initiatives against aligned goals → feeds `write-requirements-prd`
- `apply-prioritization-framework` provides the scoring methodology → feeds `build-roadmap-prioritization`

**The definition pipeline:**
- `write-requirements-prd` defines what to build and why → feeds `write-user-stories`
- `write-user-stories` breaks requirements into development-ready increments → feeds `plan-delivery-collaboration`

**The execution loop:**
- `plan-delivery-collaboration` structures milestones and dependencies → feeds delivery
- `run-retrospective` captures learning after delivery → feeds `build-roadmap-prioritization` and `design-operating-cadence` (product-ops)

**Cross-domain connections:**
- Goals connect to `design-product-metrics` (data-analytics) and `define-success-metrics` (experimentation)
- Requirements feed `plan-delivery-collaboration` and `design-experiment-plan` (experimentation)
- Retrospective feeds `design-operating-cadence` (product-ops)

---

## 🛠️ Skills in this domain

### 1. `set-goals-okrs-kpis`

Use this when a team is starting a planning cycle, existing OKRs are vague or unmeasurable, or there's confusion between outputs (features shipped) and outcomes (impact).

What it does:
- Defines 1–3 Objectives: qualitative, inspiring, directional
- For each Objective: 2–4 Key Results that are specific, measurable, and time-bound
- Separates leading indicators from lagging outcomes
- Flags activity-based KRs disguised as outcomes

---

### 2. `align-goals-to-strategy`

Use this when OKRs feel disconnected from company strategy, or strategic priorities have shifted and goals haven't been updated.

What it does:
- Maps each team goal to a company-level strategic priority
- Identifies goals with weak or no strategic mapping
- Identifies strategy areas not reflected in any team goal
- Surfaces goal conflicts with adjacent teams

---

### 3. `build-roadmap-prioritization`

Use this when a team has a long backlog and can't decide what to do next, or a roadmap exists but lacks strategic coherence.

What it does:
- Collects all initiatives to be considered
- Maps each initiative to a goal or OKR
- Applies prioritization framework (RICE, ICE, opportunity-impact, or goal-mapping)
- Identifies quick wins vs. strategic bets and makes deprioritization visible

---

### 4. `apply-prioritization-framework`

Use this when team members disagree on priority and need a shared framework, or the current priority list needs re-evaluation after new data.

What it does:
- Selects the right framework for the context (RICE, MoSCoW, ICE, Opportunity Scoring)
- Defines scoring criteria and scales before scoring (prevents post-hoc rationalization)
- Scores each item and produces a ranked list
- Flags when scores create false precision

---

### 5. `write-requirements-prd`

Use this when an initiative is prioritized and ready for detailed definition, or engineering needs clear requirements before scoping.

What it does:
- Defines the problem being solved and for whom
- States the goal or success metric
- Writes user stories with acceptance criteria
- Defines explicit out-of-scope to prevent scope creep

---

### 6. `write-user-stories`

Use this when a feature needs to be broken into development-ready increments, or stories are too vague or written from a system perspective.

What it does:
- Identifies all user-facing interactions in the feature
- Writes stories as: "As a [specific user], I want to [action] so that [outcome]"
- Keeps each story to a single shippable increment of value
- Writes acceptance criteria in Given/When/Then or checklist format

---

### 7. `plan-delivery-collaboration`

Use this when a team is moving from planning to execution and needs to structure milestones, dependencies, and cross-functional coordination.

What it does:
- Breaks the initiative into delivery phases or milestones
- Identifies cross-functional dependencies (design handoff, data instrumentation, QA)
- Maps sequencing constraints and capacity
- Builds checkpoints into the plan, not just at the end

---

### 8. `run-retrospective`

Use this after a sprint, quarter, launch, or experiment — whenever a team needs structured reflection, not just a venting session.

What it does:
- Defines the scope: what period or event is being reviewed
- Gathers data before the session: metrics, events, feedback
- Selects a retro format appropriate to the context
- Closes with owned action items and reviews prior retro actions

---

## 🧭 How to use this domain

### Option 1: Full planning cycle

Use this at the start of a quarter or major initiative.

Typical path:
1. `set-goals-okrs-kpis`
2. `align-goals-to-strategy`
3. `build-roadmap-prioritization`
4. `write-requirements-prd`
5. `write-user-stories`
6. `plan-delivery-collaboration`

### Option 2: Enter in the middle

- Goals exist, need to prioritize → start with `build-roadmap-prioritization`
- Initiative is prioritized, need requirements → start with `write-requirements-prd`
- PRD exists, need dev-ready stories → start with `write-user-stories`
- Stories ready, need delivery structure → start with `plan-delivery-collaboration`
- Cycle just ended → start with `run-retrospective`

---

## ⚠️ What this domain protects against

Common planning failure modes:

- **Goals disconnected from strategy.** OKRs that sound good but don't connect to what the company actually needs. `align-goals-to-strategy` catches this before the quarter starts.
- **Prioritization by gut feel.** "This feels important" replaces structured evaluation. `apply-prioritization-framework` forces explicit criteria and shared scoring.
- **Hidden deprioritization.** Things quietly fall off the roadmap without anyone acknowledging the trade-off. `build-roadmap-prioritization` makes deprioritization visible.
- **Vague requirements.** "Should feel easy" is not an acceptance criterion. `write-user-stories` demands testable criteria in Given/When/Then format.
- **Retros without action.** Venting sessions that produce no change. `run-retrospective` closes with owned actions and reviews prior commitments.

---

## 🚀 Where to start

If you're new to this domain:
1. Read this README
2. Pick the skill that matches your current stage
3. Read its SKILL.md
4. Check the examples — they show behavior with rich, light, and poor context
