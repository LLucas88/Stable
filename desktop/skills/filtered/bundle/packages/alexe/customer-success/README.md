# 🤝 Customer Success & Feedback Systems

[← Back to all domains](../README.md)

Skills for analyzing churn, building health scores, running Voice of Customer programs, triaging feedback, and designing retention playbooks.

Customer success isn't a department — it's a feedback loop. When customers churn, it's a product signal. When they expand, it's validation. This domain gives your agent the systems to detect risk early, route feedback to the right teams, and turn reactive account management into proactive intervention.

---

## 📋 What's inside

This domain covers three interconnected areas:

```text
Churn & health                       Feedback systems
┌─────────────────────┐             ┌─────────────────────┐
│ analyze-churn-       │            │ run-voc-program       │
│   retention          │            │ design-customer-      │
│ build-customer-      │            │   feedback-survey     │
│   health-score       │            │ synthesize-feedback-  │
│ monitor-adoption-    │            │   themes              │
│   health             │            │ triage-feedback-loop  │
└─────────────────────┘             └─────────────────────┘
          ↕
┌─────────────────────┐
│ design-retention-    │
│   playbook           │
└─────────────────────┘
```

The churn/health cluster identifies who's at risk and why. The feedback cluster collects and routes customer voice to product decisions. The retention playbook connects signals to actions.

---

## 🔗 How the skills connect

**Churn & health cluster:**
- `analyze-churn-retention` diagnoses why customers leave → feeds `build-customer-health-score`
- `build-customer-health-score` builds a predictive model → feeds `monitor-adoption-health`
- `monitor-adoption-health` surfaces at-risk accounts in real time → feeds `design-retention-playbook`
- `design-retention-playbook` defines what to do when signals fire → feeds back to `monitor-adoption-health`

**Feedback systems cluster:**
- `run-voc-program` designs systematic feedback collection → feeds `design-customer-feedback-survey`
- `design-customer-feedback-survey` creates targeted surveys → feeds `synthesize-feedback-themes`
- `synthesize-feedback-themes` turns raw feedback into structured themes → feeds `triage-feedback-loop`
- `triage-feedback-loop` routes insights to the right teams → feeds product decisions

**Cross-cluster connections:**
- Churn root causes from `analyze-churn-retention` feed `identify-problem-opportunity` (product-discovery) and `formulate-experiment-hypothesis` (experimentation)
- Feedback themes from `synthesize-feedback-themes` feed `build-roadmap-prioritization` (product-planning)
- Health signals feed `plan-lifecycle-engagement` (marketing-growth)
- Survey scores feed `detect-performance-signals` (data-analytics)

---

## 🛠️ Skills in this domain

### 1. `analyze-churn-retention`

Use this when churn is elevated or increasing and the team doesn't know why, or a retention problem needs systematic diagnosis.

What it does:
- Establishes churn baseline and trend
- Segments churn by cohort, segment, product area, tenure
- Identifies primary root causes: product gaps, onboarding failures, competitive loss, support issues
- Designs targeted interventions per root cause

---

### 2. `build-customer-health-score`

Use this when CS manages accounts without a consistent view of health, or churn is detected too late for intervention.

What it does:
- Identifies signals most correlated with retention and churn
- Groups by category: usage depth, engagement breadth, relationship strength, product outcomes
- Defines scoring tiers: healthy / at-risk / critical
- Validates against historical churn if data exists

---

### 3. `monitor-adoption-health`

Use this when the team doesn't know which accounts are healthy vs. at-risk, or expansion opportunities aren't surfaced systematically.

What it does:
- Defines what "healthy adoption" looks like (key behaviors and milestones)
- Defines at-risk signals and expansion signals
- Designs monitoring cadence and alerting thresholds
- Designs intervention workflow for at-risk accounts

---

### 4. `design-retention-playbook`

Use this when churn is discovered too late, or CS handles at-risk accounts inconsistently.

What it does:
- Maps churn root causes to intervention types
- Designs a play per cause: trigger signal, action, escalation path, success criteria
- Designs expansion plays for healthy accounts
- Defines how playbook effectiveness will be measured

---

### 5. `run-voc-program`

Use this when customer feedback is scattered and not systematically collected, or insights don't reach product teams.

What it does:
- Audits current feedback channels and coverage
- Designs VoC structure: channels, frequency, audience
- Defines how insights are collected, tagged, and aggregated
- Designs routing from VoC insights to product decisions

---

### 6. `design-customer-feedback-survey`

Use this when measuring satisfaction at scale, or existing surveys produce low response rates or uninformative data.

What it does:
- Defines the one primary question the survey must answer
- Selects survey type: NPS, CSAT, CES, feature satisfaction, or custom
- Designs 5 questions or fewer, unbiased and answerable
- Defines distribution strategy and analysis plan

---

### 7. `synthesize-feedback-themes`

Use this when a large volume of feedback exists but hasn't been organized into patterns, or a planning cycle needs customer voice input.

What it does:
- Collects from all sources: support tickets, surveys, reviews, interviews
- Codes feedback by theme: functional issues, emotional signals, feature requests, competitive mentions
- Quantifies themes and segments by customer type
- Separates what customers say from what they need

---

### 8. `triage-feedback-loop`

Use this when feedback arrives from multiple channels without clear routing, or high-signal feedback gets lost in noise.

What it does:
- Maps all incoming sources and their volume
- Defines tagging taxonomy and triage criteria
- Designs routing rules: which feedback → which team
- Defines escalation for urgent or high-impact feedback

---

## 🧭 How to use this domain

### Typical paths:

**Building proactive retention:**
1. `analyze-churn-retention` → understand why customers leave
2. `build-customer-health-score` → predict who's at risk
3. `monitor-adoption-health` → surface signals in real time
4. `design-retention-playbook` → define what to do about it

**Building a feedback system:**
1. `run-voc-program` → design systematic collection
2. `design-customer-feedback-survey` → create targeted surveys
3. `synthesize-feedback-themes` → find the patterns
4. `triage-feedback-loop` → route insights to action

**Enter in the middle:**
- Churn spiked → start with `analyze-churn-retention`
- Need a health score → start with `build-customer-health-score`
- Feedback is scattered → start with `triage-feedback-loop`
- Planning cycle needs customer voice → start with `synthesize-feedback-themes`

---

## ⚠️ What this domain protects against

- **Reactive account management.** Finding out about churn from the cancellation email. `monitor-adoption-health` surfaces risk signals early.
- **Health scores without actions.** A number nobody acts on is decoration. `design-retention-playbook` connects every score tier to a play.
- **Loudest customer = most important.** Vocal minority bias skews priorities. `synthesize-feedback-themes` quantifies themes and segments by customer type.
- **Feature requests taken literally.** "Add a dashboard" might mean "I can't find my data." `synthesize-feedback-themes` interprets the need, not the request.
- **Feedback collected, never used.** Collecting without acting damages trust. `triage-feedback-loop` routes insights to people who can act.

---

## 🚀 Where to start

If you're new to this domain:
1. Read this README
2. Pick the skill that matches your biggest gap
3. Read its SKILL.md
4. Check the examples — they show behavior with rich, light, and poor context
