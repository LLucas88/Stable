## Input
I need a dashboard for the growth team — three PMs and a data analyst. We review it weekly on Mondays before planning. The team owns acquisition, activation, and early retention for our B2C productivity app. Key decisions the dashboard drives: which acquisition channels to fund, whether activation is on track for the week's targets, and when to escalate retention issues to the product team. We use Amplitude and Looker. Current dashboard has 24 metrics on it and nobody reads it. OKR for Q3: increase 30-day retention from 18% to 24%.

## Expected output
Dashboard purpose and audience:
Weekly growth health review for the growth team (3 PMs, 1 analyst). Supports Monday planning decisions on channel spend, activation triage, and retention escalation.

Metric selection with rationale:

Top section — weekly headline (read in 30 seconds):
1. New users acquired this week vs. target — tells team immediately if top-of-funnel is healthy
2. Activation rate this week (% of signups who complete first core action) — the primary weekly output metric for acquisition quality
3. 30-day retention for the most recent mature cohort — the Q3 OKR metric; weekly view of the trend

Mid section — acquisition breakdown (dig in if headline is off):
4. New users by channel — enables channel spend decisions
5. CAC by channel (estimated) — prevents optimizing volume at cost of unit economics
6. Landing page-to-signup conversion rate — catches acquisition funnel issues before they hit volume

Bottom section — activation diagnostics (if activation rate is off):
7. Onboarding completion rate — first step to diagnosing activation drop
8. Time-to-first core action (median, days) — early indicator of activation friction trend

Information hierarchy design:
Layer 1 (always visible): metrics 1, 2, 3 — answers "is growth on track this week?"
Layer 2 (drill on alert): metrics 4, 5, 6 — answers "which channel is causing it?"
Layer 3 (diagnostic): metrics 7, 8 — answers "is this an onboarding problem?"

Alert thresholds:
- New user volume: alert if >15% below weekly target
- Activation rate: alert if below 18% (current baseline, target 24%)
- 30-day retention: alert if cohort shows below 16% (meaningful regression from current 18%)
- CAC by channel: alert if any channel exceeds 2x the blended average

Layout sketch:
```
[Week: Jul 14-20]  [vs. target] [vs. last week]
NEW USERS: 4,210  +3%   ACTIVATION: 21.4%  -0.8pp   D30 RETENTION (Jun cohort): 19.2%  +1.2pp

--- Channel breakdown ---
Google Ads: 1,840 | Organic: 1,120 | Referral: 780 | Other: 470
CAC: $28 | $0 | $8 | —

--- Activation diagnostics ---
Onboarding completion: 64%  | Median time to core action: 2.1 days
```

Metrics to exclude and why:
- Total registered users (cumulative vanity number — gives no week-over-week signal)
- App store ratings (lags reality, not actionable in weekly cadence)
- Total sessions (volume without intent signal — doesn't tell you anything about user quality)
- 16 other metrics currently on the dashboard — if a metric doesn't inform a Monday decision, it's noise
