## Input
We're launching an AI writing assistant inside our project management SaaS. The feature: when a user is creating a task description, they can tap "Improve with AI" to get a rewritten, cleaner version of what they typed. The user sees the AI suggestion and can accept, edit, or dismiss it.

Target users: team leads and project managers who create a lot of tasks and have complained their descriptions are unclear to engineers. We have 12,000 MAU.

Business goal: improve team communication quality and reduce back-and-forth on task clarification, contributing to retention (our hypothesis: better task quality → fewer miscommunications → better team outcomes → lower churn).

Model: GPT-4o via API. Going to production in 3 weeks.

## Expected output
Model quality metrics:

| Metric | Definition | Measurement approach | Target |
|--------|-----------|---------------------|--------|
| Acceptance rate | % of AI suggestions accepted or accepted-then-edited (not dismissed) | Track button events: accept / edit / dismiss | >50% within 30 days of launch |
| Unedited acceptance rate | % accepted without modification | Track accept vs. accept-then-edit separately | Informational only (not a target) |
| User-rated quality | Optional thumbs up/down on AI suggestion | In-UI feedback button (shown after accept/dismiss) | >70% positive in first 30 days |

Why acceptance rate as the primary quality signal: A user who dismisses the AI suggestion has made a judgment that it's worse than what they wrote. Acceptance rate is an implicit quality vote from real users on real inputs — more reliable than offline evaluation.

---

User experience metrics:

| Metric | Definition | Target |
|--------|-----------|--------|
| Feature adoption rate | % of eligible users (task creators) who try the feature at least once | 30% in first 30 days |
| Feature retention | % of users who adopted and used it again in the following 2 weeks | >40% |
| Task creation time | Does using the feature increase or decrease time to complete a task creation? | No more than 20% increase |
| Dismissal pattern | % of users who try and never use again after dismissing 2+ times | Informational — threshold for "feature isn't working for this user" |

---

Business impact metrics:

| Metric | Definition | Measurement approach |
|--------|-----------|---------------------|
| Task clarification comments | Comments on tasks asking for more info — proxy for description quality | Count comment threads starting with "what do you mean" / "can you clarify" — requires NLP tagging |
| D90 retention for feature users vs. non-users | Do users who adopt this feature retain at higher rates? | Cohort comparison at 90 days post-launch |
| CSAT / NPS trend | Does team communication satisfaction change after launch? | Quarterly NPS; may not be attributable to this feature specifically |

Note: task clarification as a metric requires NLP tagging on comments — this is a 2–3 sprint engineering investment. Use as a Q2 metric, not a launch metric.

---

Safety and risk metrics:

| Risk | Metric | Threshold for action |
|------|--------|---------------------|
| AI rewrites task inaccurately (changes meaning) | User edits AI output after accepting (tracks changes significantly different from AI output) | If >20% of accepted outputs are substantially rewritten by user, investigate |
| AI generates inappropriate content | Moderation flags on AI output | Any flag triggers review within 24h |
| User complaint about AI quality | Direct complaint in in-app feedback | Review all negative feedback weekly in first 60 days |
| Feature causes confusion / frustration | Increase in support tickets tagged "AI feature" | >5 tickets/week triggers product review |

---

Baseline and target values:
- Feature adoption: no prior baseline (new feature); target 30% in 30 days
- Acceptance rate: no prior baseline; target >50% based on comparable AI suggestion features in the market
- Task clarification comments: current baseline ~18% of tasks receive a clarifying comment (to be confirmed with data team before launch)

Primary metric (captures overall feature success):
**Acceptance rate** — it is the clearest signal that the AI output is useful. A dismissed suggestion means the user decided it wasn't worth accepting; a consistently dismissed feature means the AI isn't meeting the quality bar.

Review cadence and metric owners:
- Weekly: PM reviews acceptance rate, adoption rate, dismissal patterns (Week 1–8 post-launch)
- Monthly: PM + engineering review quality feedback and any safety flags
- Quarterly: business impact metrics (retention cohort, NPS)
- Metric owner: PM for quality/UX metrics; Data analyst for business impact cohort analysis
