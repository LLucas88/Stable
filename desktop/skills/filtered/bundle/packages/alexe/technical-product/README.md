# 🔧 Technical Product & Platform Collaboration

[← Back to all domains](../README.md)

Skills for platform product thinking, architecture-aware prioritization, engineering collaboration, and managing the tension between technical debt and feature delivery.

Product decisions don't happen in a vacuum — they hit architecture, scalability limits, and engineering reality. This domain gives your agent the frameworks to involve engineering in discovery, evaluate reliability trade-offs, design developer experiences, and make principled decisions about when to invest in infrastructure vs. features.

---

## 📋 What's inside

This domain covers four interconnected areas:

```text
Platform & DX                        Architecture & debt
┌─────────────────────┐             ┌──────────────────────────┐
│ develop-platform-    │             │ prioritize-architecture-  │
│   product-thinking   │             │   aware                   │
│ design-developer-    │             │ manage-technical-debt-     │
│   experience         │             │   tradeoffs               │
└─────────────────────┘             └──────────────────────────┘
                                              ↕
Engineering collaboration            Reliability & NFRs
┌─────────────────────┐             ┌──────────────────────────┐
│ collaborate-with-    │             │ assess-reliability-        │
│   engineering        │             │   scalability             │
│ run-technical-       │             │ define-non-functional-     │
│   discovery          │             │   requirements            │
└─────────────────────┘             └──────────────────────────┘
```

These areas interact constantly: technical discovery reveals architectural constraints, which affect prioritization, which shapes delivery collaboration. Platform thinking and DX apply when the product itself serves developers.

---

## 🔗 How the skills connect

**Platform & developer experience:**
- `develop-platform-product-thinking` defines ecosystem strategy → feeds `design-developer-experience`
- `design-developer-experience` designs the DX for APIs/SDKs → feeds `plan-product-launch` (gtm) and `write-requirements-prd` (product-planning)

**Architecture & debt:**
- `prioritize-architecture-aware` incorporates technical constraints into prioritization → feeds `plan-delivery-collaboration` (product-planning)
- `manage-technical-debt-tradeoffs` structures the debt vs. features decision → feeds `build-roadmap-prioritization` (product-planning) and `build-business-case` (business-commercial)

**Engineering collaboration:**
- `run-technical-discovery` resolves engineering unknowns → feeds `write-requirements-prd` (product-planning) and `plan-delivery-collaboration` (product-planning)
- `collaborate-with-engineering` designs collaboration patterns → feeds `plan-delivery-collaboration` (product-planning)

**Reliability & NFRs:**
- `define-non-functional-requirements` specifies performance, security, accessibility targets → feeds `write-requirements-prd` (product-planning) and `assess-reliability-scalability`
- `assess-reliability-scalability` evaluates scale implications → feeds `prioritize-architecture-aware`

---

## 🛠️ Skills in this domain

### 1. `develop-platform-product-thinking`

Use this when a product is evolving into a platform with external developers, or an ecosystem strategy needs to be defined.

What it does:
- Defines the platform layer: what it exposes, to whom, and why
- Designs the extension model and ecosystem strategy
- Balances openness with quality and support risks

---

### 2. `design-developer-experience`

Use this when developer adoption is low despite capability, or a developer portal/docs experience needs structuring.

What it does:
- Minimizes time-to-first-value for developers
- Structures documentation, onboarding, and integration paths
- Treats DX as a product, not an afterthought

---

### 3. `prioritize-architecture-aware`

Use this when technical debt is blocking development speed, or engineering requests infrastructure investment that product can't evaluate.

What it does:
- Identifies technical constraints and their product impact (velocity, reliability, UX)
- Incorporates architectural context into prioritization decisions
- Frames technical investment with a product value narrative

---

### 4. `manage-technical-debt-tradeoffs`

Use this when engineering pushes for debt reduction and product needs to evaluate the trade-off, or debt-related risk needs stakeholder communication.

What it does:
- Characterizes the debt: type, age, cause, impact
- Quantifies business impact (not just engineering annoyance)
- Distinguishes structural risk (blocks growth) from cosmetic debt
- Structures the decision: pay now, schedule, accept deliberately

---

### 5. `collaborate-with-engineering`

Use this when product and engineering are misaligned, estimation is unreliable, or engineers feel disconnected from user context.

What it does:
- Assesses current collaboration health
- Designs patterns for discovery, scoping, estimation, and trade-off decisions
- Ensures engineers understand user problems, not just requirements

---

### 6. `run-technical-discovery`

Use this when an initiative has significant technical uncertainty, or engineering can't provide reliable estimates without exploration.

What it does:
- Structures a time-boxed discovery process
- Surfaces feasibility constraints and architectural options
- Produces output in a form product can use (not just internal eng notes)

---

### 7. `assess-reliability-scalability`

Use this when a feature decision has reliability/scalability implications, or the product is approaching a scale inflection point.

What it does:
- Evaluates reliability and scalability trade-offs of product decisions
- Defines SLA and reliability requirements
- Frames reliability as a product feature, not just engineering concern

---

### 8. `define-non-functional-requirements`

Use this when a feature has functional requirements but no NFRs, or engineering has questions about performance/security targets.

What it does:
- Defines performance, security, privacy, scalability, accessibility, and compliance targets
- Makes requirements specific ("99.5% uptime" not "high availability")
- Ensures NFRs are defined before development, not bolted on after

---

## 🧭 How to use this domain

### Typical paths:

**Building a platform product:**
1. `develop-platform-product-thinking` → strategy
2. `design-developer-experience` → DX design

**Technical investment decisions:**
1. `prioritize-architecture-aware` → understand constraints
2. `manage-technical-debt-tradeoffs` → make the trade-off
3. Feed into `build-roadmap-prioritization` (product-planning)

**Starting a new initiative with unknowns:**
1. `run-technical-discovery` → resolve unknowns
2. `define-non-functional-requirements` → set targets
3. `assess-reliability-scalability` → evaluate implications

**Enter in the middle:**
- Engineering says "we need to refactor" → start with `manage-technical-debt-tradeoffs`
- Scaling concerns → start with `assess-reliability-scalability`
- Product-eng friction → start with `collaborate-with-engineering`
- New API product → start with `develop-platform-product-thinking`

---

## ⚠️ What this domain protects against

- **Product decisions that ignore technical reality.** Prioritizing without understanding architectural constraints creates delivery failures. `prioritize-architecture-aware` surfaces them.
- **"Tech debt" without business framing.** Debt that can't articulate product impact loses every prioritization. `manage-technical-debt-tradeoffs` quantifies the business cost.
- **Engineers building the wrong thing.** Engineers disconnected from user problems build technically correct wrong things. `collaborate-with-engineering` designs involvement from discovery.
- **NFRs as afterthought.** "Bank-level security" and "99.99% uptime" are not requirements. `define-non-functional-requirements` makes them specific before development.
- **Open-ended discovery.** "We need more research" without time boxing delays delivery indefinitely. `run-technical-discovery` is always time-boxed.

---

## 🚀 Where to start

If you're new to this domain:
1. Read this README
2. Pick the skill that matches your current challenge
3. Read its SKILL.md
4. Check the examples — they show behavior with rich, light, and poor context
