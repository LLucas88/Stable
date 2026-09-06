# 📊 Data Analytics & Insights

[← Back to all domains](../README.md)

Skills for designing metrics, instrumenting products, analyzing funnels and cohorts, building dashboards, and diagnosing when something goes wrong with your numbers.

Data without a framework is noise. A metric that dropped 12% means nothing until you know whether it's instrumentation, seasonality, or a real product problem. This domain gives your agent the discipline to design metrics that matter, instrument them correctly, and investigate changes with rigor — not guesswork.

---

## 📋 What's inside

This domain covers the full analytics lifecycle:

```text
goals / product area
    ↓
metrics framework design
    ↓
event instrumentation
    ↓
funnel & cohort analysis ←→ cohort deep-dives
    ↓
dashboard design
    ↓
alert system design
    ↓
signal detection
    ↓
metric diagnosis
```

The flow moves from defining what to measure, through building the plumbing, to ongoing monitoring and diagnosis. But skills work independently too — you can jump straight to diagnosis when a metric drops.

---

## 🔗 How the skills connect

**The design & build track:**
- `design-product-metrics` defines primary, secondary, and guardrail metrics → feeds `plan-event-instrumentation`
- `plan-event-instrumentation` defines tracking events → feeds `build-decision-dashboard` and `analyze-funnel-retention-cohorts`
- `build-decision-dashboard` structures ongoing monitoring → feeds `design-metric-alert-system`

**The analysis track:**
- `analyze-funnel-retention-cohorts` identifies where users drop off or churn → feeds `detect-performance-signals`
- `run-cohort-analysis` compares behavior across user groups → feeds `detect-performance-signals` and `analyze-churn-retention` (customer-success)

**The monitoring & diagnosis track:**
- `design-metric-alert-system` triggers when thresholds are breached → feeds `detect-performance-signals`
- `detect-performance-signals` identifies that something changed → feeds `diagnose-metric-movement`
- `diagnose-metric-movement` determines why it changed → feeds `formulate-experiment-hypothesis` (experimentation) or `identify-problem-opportunity` (product-discovery)

**Cross-domain connections:**
- Metrics feed `define-success-metrics` (experimentation) and `set-goals-okrs-kpis` (product-planning)
- Diagnosis outputs feed `formulate-experiment-hypothesis` (experimentation) and `identify-problem-opportunity` (product-discovery)

---

## 🛠️ Skills in this domain

### 1. `design-product-metrics`

Use this when a product area lacks clear metrics, or existing metrics are disconnected from goals and decisions.

What it does:
- Maps the user journey relevant to the product area
- Identifies one primary metric that best reflects product success
- Identifies secondary metrics (leading indicators) and guardrail metrics (must not degrade)
- Flags vanity metrics that feel good but mean nothing

---

### 2. `plan-event-instrumentation`

Use this when a feature is being built and analytics tracking needs to be defined, or existing tracking is inconsistent.

What it does:
- Maps user actions worth tracking in the feature
- Defines event name, trigger condition, and required properties for each
- Enforces consistent naming conventions (object_action format)
- Ensures instrumentation is planned before development, not after

---

### 3. `analyze-funnel-retention-cohorts`

Use this when a funnel has unexplained drop-off, retention is declining, or cohort differences need investigation.

What it does:
- Maps the funnel or retention structure being analyzed
- Identifies drop-off points or retention cliff events
- Compares cohorts by acquisition source, segment, or time period
- Separates meaningful patterns from noise in small cohorts

---

### 4. `run-cohort-analysis`

Use this when retention trends need to go beyond aggregates, or a product change's impact on different user groups needs evaluation.

What it does:
- Defines cohort grouping: time-based, behavior-based, or acquisition source
- Sets up cohort tables with appropriate measurement windows
- Identifies retention curve shape: fast decay, stable plateau, improving trend
- Flags when cohort sample sizes are too small for conclusions

---

### 5. `build-decision-dashboard`

Use this when a team lacks consistent product health monitoring, or existing dashboards aren't used because they're too complex.

What it does:
- Defines the audience and decisions the dashboard supports
- Selects top 5–10 metrics (less is more)
- Designs information hierarchy: summary → detail → diagnostic
- Ensures context is always visible: targets, baselines, and trends

---

### 6. `design-metric-alert-system`

Use this when critical metrics are discovered off-track days too late, or too many false-positive alerts are causing fatigue.

What it does:
- Selects which metrics warrant alerting (not all do)
- Defines alert type per metric: threshold-based, anomaly-based, or rate-of-change
- Sets warning and critical thresholds grounded in normal variance
- Defines alert owner, response protocol, and escalation path

---

### 7. `detect-performance-signals`

Use this when a metric has moved unexpectedly and it's unclear whether the change is real or noise.

What it does:
- Establishes the baseline (what was normal before the change)
- Quantifies the change: magnitude, direction, duration
- Checks for data quality issues before assuming a real product change
- Identifies potential causes: product changes, external events, seasonality

---

### 8. `diagnose-metric-movement`

Use this when a key metric has changed unexpectedly and the cause needs systematic investigation.

What it does:
- Confirms the change is real: checks instrumentation, data pipeline, and tracking
- Segments the change by source, platform, geography
- Identifies timing: when exactly did the change begin?
- Lists all product changes in the relevant window and evaluates each

---

## 🧭 How to use this domain

### Option 1: Build the analytics foundation

Use this when starting a new product area or auditing an under-instrumented one.

Typical path:
1. `design-product-metrics`
2. `plan-event-instrumentation`
3. `build-decision-dashboard`
4. `design-metric-alert-system`

### Option 2: Investigate a problem

Use this when a metric moved and you need to understand why.

Typical path:
1. `detect-performance-signals`
2. `diagnose-metric-movement`
3. Then feed into experimentation or product-discovery

### Option 3: Enter in the middle

- Tracking exists but dashboards don't → start with `build-decision-dashboard`
- Funnel has drop-off → start with `analyze-funnel-retention-cohorts`
- Need to compare user groups → start with `run-cohort-analysis`
- Alert fired → start with `detect-performance-signals`
- Metric dropped and cause is unknown → start with `diagnose-metric-movement`

---

## ⚠️ What this domain protects against

Common analytics failure modes:

- **Measuring everything, deciding nothing.** Dashboards with 50 metrics are ignored. `design-product-metrics` forces one primary metric per area.
- **Instrumentation after shipping.** Analytics debt is expensive. `plan-event-instrumentation` designs tracking before development.
- **Correlation passed off as causation.** A metric moved after a deploy, so the deploy caused it — maybe. `diagnose-metric-movement` requires ruling out instrumentation errors, seasonality, and confounds first.
- **Alert fatigue.** Too many alerts → all alerts ignored. `design-metric-alert-system` sets thresholds grounded in normal variance with clear owners.
- **Vanity metrics.** Total signups, total pageviews — feels good, means nothing. `design-product-metrics` separates metrics that inform decisions from metrics that just exist.

---

## 🚀 Where to start

If you're new to this domain:
1. Read this README
2. Pick the skill that matches your current stage
3. Read its SKILL.md
4. Check the examples — they show behavior with rich, light, and poor context
