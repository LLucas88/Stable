# 🎨 UX Research & Design Collaboration

[← Back to all domains](../README.md)

Skills for planning research, running usability studies, assessing experience quality, and managing the handoff between product, design, and engineering.

Good UX research turns opinions into evidence. Bad UX research confirms what the team already believes. This domain gives your agent structured methods for every stage — from scoping the right question to handing off actionable findings to the people who will build the fix.

---

## 📋 What's inside

This domain covers the full research-to-handoff arc:

```text
research question
    ↓
research plan
    ↓
study design
    ↓
usability testing
    ↓
findings analysis
    ↓
journey mapping ←→ experience quality assessment
    ↓
design brief
    ↓
design handoff
```

Skills can be used independently or chained. The testing → analysis → handoff path is the most common sequence, but journey mapping and experience assessment can be used standalone.

---

## 🔗 How the skills connect

**The core testing pipeline:**
- `plan-ux-research` defines what to research → feeds `design-research-study`
- `design-research-study` structures the study protocol → feeds `run-usability-testing`
- `run-usability-testing` produces session observations → feeds `analyze-usability-findings`
- `analyze-usability-findings` produces prioritized issues → feeds `manage-design-handoff`

**The experience assessment track (can run independently):**
- `map-user-journey` surfaces gaps and friction across the full experience
- `assess-experience-quality` evaluates a specific flow against quality criteria
- Both feed `manage-design-handoff` and can trigger `run-usability-testing` to validate hypotheses

**The design collaboration bridge:**
- `write-design-brief` opens the design process — clear problem, constraints, success criteria
- `manage-design-handoff` closes it — assets, norms, feedback loops, sign-off

**Cross-domain connections:**
- Findings feed `formulate-experiment-hypothesis` (experimentation) and `identify-problem-opportunity` (product-discovery)
- Design brief connects to `write-requirements-prd` (product-planning)
- Handoff connects to `plan-delivery-collaboration` (product-planning)

---

## 🛠️ Skills in this domain

### 1. `plan-ux-research`

Use this when a team needs to run user research but hasn't structured the plan — goals are unclear, methods haven't been chosen, or the scope is too broad.

What it does:
- Clarifies the research question and what decision it will inform
- Selects appropriate methods (interviews, surveys, usability testing, diary study, contextual inquiry)
- Defines participant criteria and sample size
- Sets timeline and analysis approach

---

### 2. `design-research-study`

Use this when the research question requires more structure than an informal interview — repeatable protocols, clear data capture, and success criteria.

What it does:
- Defines study goals and specific research questions
- Structures methods with clear protocols
- Designs data capture and analysis approach
- Develops a pilot plan to catch protocol flaws before wasting participant time

---

### 3. `run-usability-testing`

Use this when a design or flow is ready for testing, or post-launch feedback suggests usability problems that need diagnosis.

What it does:
- Defines goal-based tasks and success criteria (not UI instructions)
- Selects method: moderated/unmoderated, remote/in-person
- Designs test script and facilitation guide
- Synthesizes findings by severity, mapped to specific interface elements

---

### 4. `analyze-usability-findings`

Use this when testing sessions are done and raw observations need to be turned into a prioritized, actionable report.

What it does:
- Groups observations by task or product area
- Identifies recurring issues vs. one-off observations across sessions
- Classifies by severity (critical / major / minor) with evidence
- Generates design recommendations prioritized by severity and feasibility

---

### 5. `map-user-journey`

Use this when the team lacks a shared view of the end-to-end experience, or pain points are suspected but their location in the journey is unclear.

What it does:
- Breaks the journey into 4–7 stages with steps, touchpoints, and emotions
- Identifies highest-friction moments and opportunity areas
- Flags stages that cross team or department boundaries
- Produces a map grounded in research, not internal assumptions

---

### 6. `assess-experience-quality`

Use this when a specific flow has high drop-off, consistent friction feedback, or hasn't been assessed since launch.

What it does:
- Maps the flow step by step
- Applies quality criteria: discoverability, clarity, efficiency, error recovery, trust
- Identifies friction points with severity classification
- Distinguishes quick wins from structural issues

---

### 7. `write-design-brief`

Use this when a product problem is being handed to design for exploration and designers need clear context without a prescribed solution.

What it does:
- States the problem from the user's perspective
- Describes target user, context, and known constraints
- Lists explicit non-goals
- Defines UX-measurable success criteria

---

### 8. `manage-design-handoff`

Use this when engineering is building things that don't match design intent, or handoff norms don't exist yet.

What it does:
- Defines what "complete" handoff looks like with readiness criteria
- Identifies required documentation, assets, and review process
- Establishes iteration and feedback loop protocols
- Identifies common handoff failure modes and mitigations

---

## 🧭 How to use this domain

### Option 1: Full research cycle

Use this when starting a new research initiative from scratch.

Typical path:
1. `plan-ux-research`
2. `design-research-study`
3. `run-usability-testing`
4. `analyze-usability-findings`
5. `write-design-brief` or `manage-design-handoff`

### Option 2: Experience audit

Use this when you need to assess an existing product area.

Typical path:
1. `map-user-journey` (broad view)
2. `assess-experience-quality` (deep dive on specific flows)
3. `run-usability-testing` (validate suspected issues)
4. `analyze-usability-findings`

### Option 3: Enter in the middle

- Testing sessions are done → start with `analyze-usability-findings`
- Design is starting without context → start with `write-design-brief`
- Handoff keeps causing rework → start with `manage-design-handoff`
- Drop-off in a specific flow → start with `assess-experience-quality`
- No shared view of user experience → start with `map-user-journey`

---

## ⚠️ What this domain protects against

Common UX research failure modes:

- **Method before question.** "Let's do a survey" when the question requires observation. `plan-ux-research` forces method selection to follow from the research question.
- **Leading usability tasks.** "Click the Book button" tests UI recognition, not task completion. `run-usability-testing` designs goal-based tasks ("book a trip").
- **Overgeneralizing from one session.** A single participant's struggle might be participant-specific. `analyze-usability-findings` separates patterns from one-offs.
- **Journey maps from assumptions.** Internal-only journey maps embed existing blind spots. `map-user-journey` requires research grounding.
- **Design handoff as file dump.** Throwing Figma links over the wall creates rework. `manage-design-handoff` establishes norms, readiness criteria, and feedback loops.

---

## 🚀 Where to start

If you're new to this domain:
1. Read this README
2. Pick the skill that matches your current stage
3. Read its SKILL.md
4. Check the examples — they show behavior with rich, light, and poor context
