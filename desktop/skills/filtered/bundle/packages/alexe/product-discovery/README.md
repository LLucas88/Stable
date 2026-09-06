# 🔍 Product Discovery

[← Back to all domains](../README.md)

Skills for turning vague signals into clearly framed problems, gathering user evidence, and converting research into structured product opportunities.

Discovery is where most product decisions go wrong — not because teams pick the wrong solution, but because they solve the wrong problem. This domain gives your agent the same rigor a senior researcher would bring: structured problem framing, bias-aware interviewing, and evidence-grounded insight synthesis.

---

## 📋 What's inside

This domain covers the full discovery arc:

```text
vague signal / complaint / metric drop
    ↓
problem framing
    ↓
research scoping
    ↓
user interviews
    ↓
JTBD mapping        qualitative synthesis
    ↓                       ↓
        insight generation
            ↓
    opportunity framing
            ↓
    persona development
```

Each step is a separate skill so the agent can use them independently or chain them when the full arc is needed.

---

## 🔗 How the skills connect

Discovery skills form a pipeline from raw signals to investable opportunities. Each skill explicitly defines what it expects as input and what it produces for downstream skills.

**The typical chain:**
- `identify-problem-opportunity` produces a framed problem → feeds `scope-discovery-research`
- `scope-discovery-research` produces a research plan → feeds `run-user-interviews`
- `run-user-interviews` produces interview data → feeds `synthesize-qualitative-research` and `apply-jtbd-framework`
- `synthesize-qualitative-research` and `apply-jtbd-framework` produce patterns and jobs → feed `generate-insights`
- `generate-insights` produces insight statements → feeds `frame-insight-opportunity`
- `frame-insight-opportunity` produces opportunity statements → feeds roadmap planning, experiment design, or OKR setting
- `develop-persona-segment` can be built at any point once research data exists, and feeds back into most other skills

**Cross-domain connections:**
- Outputs feed `formulate-experiment-hypothesis` (experimentation), `develop-positioning-messaging` (gtm), `set-goals-okrs-kpis` (product-planning), and `build-portfolio-roadmap-strategy` (product-strategy)

---

## 🛠️ Skills in this domain

### 1. `identify-problem-opportunity`

Use this when there's a vague signal — a complaint, a metric drop, a business goal — but no clear problem statement yet.

What it does:
- Distinguishes symptoms from underlying problems
- Frames problems in user-centric terms, not solution terms
- Identifies affected segments and assesses business impact
- Lists research questions needed to confirm the problem

---

### 2. `scope-discovery-research`

Use this when the team is about to start research without a clear scope, or multiple research questions compete for attention.

What it does:
- Defines research goals and what decision the research will inform
- Identifies 3–5 key questions and what is known vs. unknown
- Selects appropriate methods for each question
- Defines participant criteria, timeline, and risk contingencies

---

### 3. `run-user-interviews`

Use this when the team needs to understand user problems, behaviors, or motivations through direct conversation.

What it does:
- Designs interview guides with open-ended, story-based questions without leading bias
- Structures interviews: warm-up → context → core questions → wrap-up
- Establishes recruiting criteria and saturation targets (5–8 per segment)
- Plans synthesis immediately after interviews

---

### 4. `apply-jtbd-framework`

Use this when feature decisions are driven by requests rather than underlying jobs, or the team is unsure why users choose or leave the product.

What it does:
- Identifies the context and "struggling moment" that triggers the search for a solution
- Maps functional, emotional, and social job dimensions
- Maps competing solutions users consider
- Writes formal job statements

---

### 5. `synthesize-qualitative-research`

Use this when interview notes or research data need to be organized and patterns need to emerge from the noise.

What it does:
- Extracts key themes and patterns from raw data
- Identifies most frequent pain points, jobs, and motivations
- Separates observations from interpretations
- Flags outliers and edge cases separately

---

### 6. `generate-insights`

Use this when research has been conducted but the team isn't sure what it means — observations exist but haven't been turned into insights.

What it does:
- Groups related observations into themes and identifies underlying patterns
- Tests each insight for being non-obvious, specific, and data-supported
- Writes insights as declarative statements with evidence quality ratings
- Identifies contradictory data points

---

### 7. `frame-insight-opportunity`

Use this when research synthesis exists but hasn't been turned into product opportunities that can be prioritized and acted on.

What it does:
- Frames opportunities as "How might we [need] so that [outcome]?"
- Assesses evidence quality and estimates rough impact on product metrics
- Identifies affected segments and flags dependencies or constraints
- Produces opportunity statements ready for roadmap or experiment design

---

### 8. `develop-persona-segment`

Use this when the team doesn't have clear user segments, or personas are based on assumptions rather than research.

What it does:
- Identifies distinct user types from research data
- Defines goals, jobs, pain points, and context of use for each type
- Anchors personas in behaviors and motivations, not demographics
- Limits persona count to 2–4 well-defined segments

---

## 🧭 How to use this domain

### Option 1: Start from the top

Use this when you only have a vague signal or a business metric that's underperforming.

Typical path:
1. `identify-problem-opportunity`
2. `scope-discovery-research`
3. `run-user-interviews`
4. `synthesize-qualitative-research`
5. `generate-insights`
6. `frame-insight-opportunity`

### Option 2: Enter in the middle

Use this when you already have something concrete.

Examples:
- Problem is clear, need research plan → start with `scope-discovery-research`
- Interviews are done, need to make sense of them → start with `synthesize-qualitative-research`
- Raw observations exist → start with `generate-insights`
- Insights exist but aren't actionable → start with `frame-insight-opportunity`
- Need to understand why users hire the product → start with `apply-jtbd-framework`
- Segments are unclear → start with `develop-persona-segment`

---

## ⚠️ What this domain protects against

Common discovery failure modes:

- **Solving the wrong problem.** Teams jump to solutions before the problem is clearly framed. `identify-problem-opportunity` forces the separation.
- **Confirmation bias in research.** Without structure, interviews become validation exercises. `run-user-interviews` designs bias-aware guides with open-ended questions.
- **"Users want X" passed off as insight.** That's an observation or a recommendation. `generate-insights` tests each insight for being non-obvious, specific, and evidence-supported.
- **Persona sprawl.** 10 vague personas help nobody. `develop-persona-segment` limits to 2–4 research-grounded segments.
- **Research that doesn't lead to action.** Interesting findings that never become product decisions. `frame-insight-opportunity` converts insights into structured, prioritizable opportunities.

---

## 🚀 Where to start

If you're new to this domain:
1. Read this README
2. Pick the skill that matches your current stage
3. Read its SKILL.md
4. Check the examples — they show behavior with rich, light, and poor context
