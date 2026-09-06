# 🤖 AI Product Management

[← Back to all domains](../README.md)

Skills for ideating AI features, assessing model capabilities, designing human-in-the-loop workflows, and evaluating AI quality and governance.

"Let's add AI" is not a product strategy. This domain gives your agent the structure to start from user value, evaluate what AI can actually do, design appropriate human oversight, and measure success across quality, UX, business impact, and safety. No technology-first thinking — outcomes first, then capabilities.

---

## 📋 What's inside

This domain covers the full AI product lifecycle:

```text
user problem / opportunity
    ↓
AI feature ideation
    ↓
AI value framing
    ↓
model capability assessment
    ↓
model tradeoff decision
    ↓
human-in-the-loop design
    ↓
AI success metrics
    ↓
prototype evaluation
    ↓
quality monitoring
```

The flow moves from "should we use AI?" through "how should we build it?" to "is it working?" — but skills work independently at any stage.

---

## 🔗 How the skills connect

**The ideation & validation pipeline:**
- `ideate-ai-features` generates and evaluates AI feature ideas → feeds `frame-ai-product-value`
- `frame-ai-product-value` grounds the idea in user outcomes and business value → feeds `assess-model-capabilities`
- `assess-model-capabilities` evaluates whether the model can actually do the job → feeds `make-model-tradeoff-decision`
- `make-model-tradeoff-decision` selects the model/approach → feeds `design-human-in-loop-workflow`

**The design & evaluation pipeline:**
- `design-human-in-loop-workflow` structures AI-human interaction and oversight → feeds `define-ai-success-metrics`
- `define-ai-success-metrics` defines metrics across quality, UX, business, and safety → feeds `run-ai-prototype-evaluation`
- `run-ai-prototype-evaluation` tests the prototype before committing to build → feeds `evaluate-ai-quality-monitoring`
- `evaluate-ai-quality-monitoring` sets up production quality monitoring → ongoing

**Cross-domain connections:**
- AI ideation draws from `identify-problem-opportunity` (product-discovery)
- Value framing feeds `build-business-case` (business-commercial)
- Success metrics feed `design-experiment-plan` (experimentation) and `build-decision-dashboard` (data-analytics)
- HITL design feeds `write-requirements-prd` (product-planning)
- Quality monitoring connects to `detect-performance-signals` (data-analytics)
- AI governance links to `conduct-ai-audit` and `govern-responsible-ai` (risk-compliance)

---

## 🛠️ Skills in this domain

### 1. `ideate-ai-features`

Use this when the team wants to explore how AI can improve their product, or leadership is asking "where can we use AI?" and needs a structured answer.

What it does:
- Maps the user problem or inefficiency AI could address
- Generates a range of AI feature ideas (breadth first, evaluation second)
- Evaluates on: user value, feasibility, differentiation, risk
- Shortlists top 3 ideas with validation steps

---

### 2. `frame-ai-product-value`

Use this when an AI feature idea needs to be grounded in user outcomes and business impact, not just technical capability.

What it does:
- Identifies the user problem the AI addresses
- Describes what users do today without it (current workaround)
- Articulates the outcome AI delivers for users (not the mechanism)
- Identifies business value and risks (false confidence, user distrust)

---

### 3. `assess-model-capabilities`

Use this when deciding which AI model or approach to use, or when an AI feature is underperforming and the root cause might be model limitations.

What it does:
- Defines the task the model needs to perform precisely
- Assesses capability: well-suited / partial fit / poor fit
- Identifies failure modes and edge cases
- Evaluates trade-offs: accuracy vs. cost vs. latency vs. privacy

---

### 4. `make-model-tradeoff-decision`

Use this when multiple model options are available and a structured choice must be made, balancing capability, cost, latency, and risk.

What it does:
- Defines capability and non-functional requirements (latency, cost, privacy)
- Identifies candidate models or approaches
- Evaluates each against requirements
- Identifies the key trade-offs and recommends with rationale

---

### 5. `design-human-in-loop-workflow`

Use this when an AI feature needs structured human oversight, or AI output quality is inconsistent and review mechanisms are needed.

What it does:
- Maps workflow steps where AI is involved
- For each step: assesses what happens if the AI is wrong and what's at stake
- Determines intervention mode: fully automated / AI-assisted / human-reviewed / human-decided
- Designs review, override, escalation, and feedback mechanisms

---

### 6. `define-ai-success-metrics`

Use this when an AI feature needs success criteria across quality, UX, business impact, and safety — not just "does the model work."

What it does:
- Model quality metrics: accuracy, relevance, hallucination rate
- User experience metrics: adoption, trust signals, task completion
- Business impact metrics: retention, efficiency, revenue, support deflection
- Safety metrics: error rates, harmful output flags, complaint rate

---

### 7. `run-ai-prototype-evaluation`

Use this when an AI prototype needs structured evaluation before committing to full development.

What it does:
- Defines evaluation dimensions: quality, UX, latency, edge cases, failure modes
- Builds a test set: representative cases, edge cases, adversarial cases
- Runs the prototype and evaluates each dimension
- Assesses readiness: build now / iterate prototype / don't build

---

### 8. `evaluate-ai-quality-monitoring`

Use this when an AI feature is going into production and needs quality monitoring, or quality has degraded and needs diagnosis.

What it does:
- Defines quality dimensions and thresholds (acceptable / needs review / unacceptable)
- Designs evaluation: human eval, automated metrics, golden set
- Designs monitoring signals for quality degradation
- Defines alerting, escalation, and the iteration loop

---

## 🧭 How to use this domain

### Option 1: Full AI product lifecycle

Use this when exploring a new AI feature from scratch.

Typical path:
1. `ideate-ai-features`
2. `frame-ai-product-value`
3. `assess-model-capabilities`
4. `make-model-tradeoff-decision`
5. `design-human-in-loop-workflow`
6. `define-ai-success-metrics`
7. `run-ai-prototype-evaluation`
8. `evaluate-ai-quality-monitoring`

### Option 2: Enter in the middle

- AI idea exists, need to validate value → start with `frame-ai-product-value`
- Value is clear, need model choice → start with `assess-model-capabilities`
- Model chosen, need oversight design → start with `design-human-in-loop-workflow`
- Prototype ready → start with `run-ai-prototype-evaluation`
- AI in production, quality drifting → start with `evaluate-ai-quality-monitoring`

---

## ⚠️ What this domain protects against

Common AI product failure modes:

- **Technology-first thinking.** "We can use AI for this" is not a product decision. `frame-ai-product-value` starts from user outcomes.
- **Demo-driven enthusiasm.** Prototypes that work on cherry-picked inputs fail on real data. `run-ai-prototype-evaluation` tests with representative, edge, and adversarial cases.
- **"Human in the loop" theater.** A rubber stamp that doesn't change outcomes is not oversight. `design-human-in-loop-workflow` designs intervention points that actually matter.
- **Measuring model accuracy, ignoring user experience.** A 95% accurate model that users don't trust is a failed feature. `define-ai-success-metrics` measures quality, UX, business, and safety.
- **Quality that degrades silently.** AI output changes as the world changes. `evaluate-ai-quality-monitoring` builds continuous monitoring, not one-time evaluation.

---

## 🚀 Where to start

If you're new to this domain:
1. Read this README
2. Pick the skill that matches your current stage
3. Read its SKILL.md
4. Check the examples — they show behavior with rich, light, and poor context
