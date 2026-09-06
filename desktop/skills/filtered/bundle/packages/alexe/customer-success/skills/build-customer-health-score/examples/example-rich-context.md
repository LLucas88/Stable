## Input
We're building a health score for our B2B team collaboration SaaS. 600 accounts, $1.1M ARR, mostly SMB (2–25 seats). Annual contracts with monthly invoicing.

CS team: 2 CSMs managing all accounts, reviewing health weekly.

Available data signals:
- Weekly active users / total licensed seats (usage ratio)
- Last login per account (days since last active)
- Features used: core features (task management, file sharing), advanced features (automation, reporting)
- Support tickets: volume, resolution time, whether they escalated
- NPS score (collected quarterly)
- Contract renewal date
- Billing status (on-time, late, disputed)

Historical churn data: we've churned 44 accounts in the last 12 months. Looking at the 30 days before churn: 82% had usage ratio below 20%, 71% hadn't used any advanced feature in 60+ days, 58% had an unresolved support ticket older than 14 days.

## Expected output
Signal inventory with predictive rationale:

| Signal | Data Available | Predictive Rationale |
|--------|--------------|---------------------|
| Weekly usage ratio (WAU/seats) | Yes | Strongest predictor: 82% of churned accounts had <20% ratio in last 30 days |
| Days since last login | Yes | Captures account-level abandonment; precedes usage ratio decline |
| Advanced feature adoption | Yes | 71% of churned accounts had no advanced feature use in 60 days — strong signal |
| Unresolved support ticket >14 days | Yes | 58% correlation with churn; indicates unresolved friction |
| NPS score | Yes (quarterly) | Lagging indicator — useful for qualitative context, not real-time scoring |
| Billing status | Yes | Late/disputed payments correlate with churn risk but may be outcome, not cause |
| Contract renewal date | Yes | Proximity to renewal affects urgency, not health score directly |

Signal categories and weighting logic:

**Usage Depth (40% weight)**
- Weekly usage ratio: 25%
- Advanced feature adoption (90-day window): 15%

Rationale: usage is the strongest predictor of retention. An account with high usage but low NPS is less likely to churn than one with high NPS and low usage.

**Engagement Breadth (25% weight)**
- Days since any user login: 15%
- Number of distinct users active in last 30 days: 10%

**Support Health (20% weight)**
- Open tickets older than 14 days: 15%
- Number of escalations in last 90 days: 5%

**Relationship / Commercial (15% weight)**
- NPS score (most recent): 10%
- Billing status: 5%

---

Scoring model structure:

Score range: 0–100

Each signal is normalized to a 0–100 sub-score, then weighted.

Example signal normalizations:
- Usage ratio: 0% WAU/seats = 0 points; 80%+ WAU/seats = 100 points; linear between
- Days since last login: 0–7 days = 100; 8–14 = 75; 15–30 = 40; 31+ = 0
- Advanced feature: used in last 30 days = 100; 31–60 days = 60; 61–90 days = 20; 90+ days = 0
- Open ticket >14 days: none = 100; 1 open = 50; 2+ open = 0

Health tier definitions:
- Healthy (70–100): low churn risk, potential expansion candidate
- At-risk (40–69): monitor closely, proactive outreach within 2 weeks
- Critical (0–39): immediate CSM intervention, flag for executive sponsor

Update cadence: weekly (automated, every Monday morning)

---

Validation approach:
Apply the scoring model retroactively to the 44 churned accounts. Confirm that ≥75% of churned accounts would have scored Critical or At-risk in the 60 days before churn. If not, revisit signal weights.

---

Surfacing design:
- CSM dashboard: weekly sorted list of At-risk and Critical accounts, score and primary signal driving the score (not just the number — "score dropped because usage ratio fell to 12%")
- Slack alert: when any account drops from Healthy to At-risk or from At-risk to Critical
- CRM: score synced to HubSpot deal record for CSM workflow integration

---

Limitations and blind spots:
- Score reflects logged-in usage, not value delivered — an account can have high usage and low ROI
- Quarterly NPS means the score won't catch sentiment changes in between surveys
- This model assumes SMB usage patterns; enterprise accounts (if added later) may need different benchmarks
- Score does not capture competitive threat or stakeholder change (new buyer who prefers a competitor) — these require CSM qualitative input
