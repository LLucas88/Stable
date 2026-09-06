# 💰 Business & Commercial

[← Back to all domains](../README.md)

Skills for building business cases, analyzing unit economics, modeling LTV/CAC, running forecasts, and aligning product decisions with revenue strategy.

Product intuition gets you to the idea. Business rigor gets you the budget. This domain gives your agent the financial frameworks to justify investments honestly, model what growth actually costs, and stress-test assumptions before presenting them to leadership — with ranges and uncertainty, not false precision.

---

## 📋 What's inside

This domain covers three interconnected areas:

```text
Business case & ROI                  Unit economics
┌──────────────────────┐            ┌──────────────────────┐
│ build-business-case   │           │ analyze-unit-economics │
│ frame-roi-analysis    │           │ model-ltv-cac          │
└──────────────────────┘            │ evaluate-pricing-model │
          ↕                          └──────────────────────┘
┌──────────────────────┐                     ↕
│ Forecasting & strategy             │
│ run-forecasting-scenarios          │
│ run-sensitivity-analysis           │
│ align-revenue-strategy             │
└──────────────────────┘
```

Business cases draw on unit economics for grounding. Forecasts stress-test the assumptions. Revenue alignment ensures product decisions serve commercial goals without sacrificing long-term product health.

---

## 🔗 How the skills connect

**Business case cluster:**
- `frame-roi-analysis` builds a return-on-investment frame → feeds `build-business-case`
- `build-business-case` produces the full investment case with costs, returns, risks → feeds `align-revenue-strategy`

**Unit economics cluster:**
- `analyze-unit-economics` calculates CAC, LTV, payback, and gross margin → feeds `model-ltv-cac`
- `model-ltv-cac` models the LTV:CAC ratio in depth → feeds `build-business-case`
- `evaluate-pricing-model` assesses whether pricing aligns with value → feeds `design-packaging-tiers` (gtm)

**Forecasting cluster:**
- `run-forecasting-scenarios` builds base/upside/downside projections → feeds `build-business-case`
- `run-sensitivity-analysis` identifies which assumptions drive the most variance → feeds `run-forecasting-scenarios` and `plan-risk-mitigation` (risk-compliance)
- `align-revenue-strategy` ensures product roadmap serves commercial goals → feeds `build-portfolio-roadmap-strategy` (product-strategy)

**Cross-domain connections:**
- Unit economics feed `strategize-channel-campaigns` (marketing-growth) via CAC by channel
- Pricing feeds `design-packaging-tiers` and `support-pricing-packaging` (gtm)
- Business case feeds `build-roadmap-prioritization` (product-planning)
- Revenue alignment feeds `prioritize-strategic-bets` (product-strategy)

---

## 🛠️ Skills in this domain

### 1. `build-business-case`

Use this when a product initiative requires significant investment and leadership approval, or multiple options need structured comparison.

What it does:
- Defines investment (what is being built, at what cost)
- Estimates financial impact: revenue upside, cost reduction, efficiency gain
- Calculates ROI or payback period where data supports it
- Compares to alternatives including "do nothing"

---

### 2. `frame-roi-analysis`

Use this when leadership asks "what's the ROI?" or multiple investments need to be compared on expected return.

What it does:
- Defines investment and expected return
- Quantifies return using available data or conservative estimates
- Builds range: conservative / base / optimistic
- Identifies key assumptions and flags biggest uncertainties

---

### 3. `analyze-unit-economics`

Use this when the team needs to evaluate business model health, or a pricing/growth decision requires unit economics grounding.

What it does:
- Calculates CAC, LTV, LTV:CAC ratio, payback period, gross margin
- Assesses health against benchmarks
- Analyzes drivers of CAC and LTV
- Identifies biggest unit economics risk or improvement opportunity

---

### 4. `model-ltv-cac`

Use this when the team doesn't know if growth is economically sustainable, or a pricing/acquisition change needs impact assessment.

What it does:
- Calculates LTV and CAC with full methodology
- Calculates LTV:CAC ratio and payback period
- Breaks down CAC by channel if data allows
- Models ratio at different scale or with proposed changes

---

### 5. `evaluate-pricing-model`

Use this when pricing is suspected to limit growth, or a pricing model change is being considered.

What it does:
- Assesses whether the value metric aligns with value received
- Evaluates expansion revenue potential
- Compares to competitive pricing
- Evaluates alternative models: per-seat, usage-based, outcome-based, hybrid

---

### 6. `run-forecasting-scenarios`

Use this when planning under uncertainty, or leadership needs upside/base/downside views.

What it does:
- Defines metric being forecasted and time horizon
- Builds 3 scenarios varying key assumptions
- Identifies which assumptions have most leverage on the outcome
- Recommends which scenario to plan for and why

---

### 7. `run-sensitivity-analysis`

Use this after a forecast or business case is built, to understand which assumptions drive the most risk.

What it does:
- Varies each assumption one at a time, holding others constant
- Ranks assumptions by outcome impact
- Identifies worst realistic case
- Recommends which assumptions to validate urgently

---

### 8. `align-revenue-strategy`

Use this when a product initiative may conflict with revenue goals, or the revenue model is changing.

What it does:
- Maps initiatives to revenue impact: direct / indirect / none
- Identifies commercial goals the roadmap supports or misses
- Flags conflicts with pricing or revenue model
- Recommends adjustments to align product with commercial priorities

---

## 🧭 How to use this domain

### Typical paths:

**Building an investment case:**
1. `analyze-unit-economics` → understand the model health
2. `frame-roi-analysis` → frame the return
3. `build-business-case` → full investment case
4. `run-sensitivity-analysis` → stress-test the assumptions

**Evaluating pricing:**
1. `model-ltv-cac` → understand current unit economics
2. `evaluate-pricing-model` → assess pricing alignment

**Planning under uncertainty:**
1. `run-forecasting-scenarios` → build range projections
2. `run-sensitivity-analysis` → find the biggest risk levers

**Enter in the middle:**
- Need a quick business case → start with `build-business-case`
- Don't know if growth is sustainable → start with `model-ltv-cac`
- Need to stress-test a forecast → start with `run-sensitivity-analysis`
- Roadmap feels disconnected from revenue → start with `align-revenue-strategy`

---

## ⚠️ What this domain protects against

- **False precision in forecasts.** Presenting a single number as certain. `run-forecasting-scenarios` builds ranges; `run-sensitivity-analysis` identifies which assumptions matter most.
- **Ignoring "do nothing."** Every business case should compare against status quo. `build-business-case` requires it.
- **Inflated LTV.** Optimistic churn assumptions create fantasy economics. `model-ltv-cac` uses actual cohort data.
- **Blended CAC hiding problems.** Channel-blended CAC masks unprofitable channels. `analyze-unit-economics` breaks it out.
- **Revenue alignment as afterthought.** Product roadmap disconnected from how the business makes money. `align-revenue-strategy` catches it.

---

## 🚀 Where to start

If you're new to this domain:
1. Read this README
2. Pick the skill that matches your current need
3. Read its SKILL.md
4. Check the examples — they show behavior with rich, light, and poor context
