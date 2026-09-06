## Input
We want to build a customer health score for our SaaS. We have login data, support tickets, and NPS scores. We want to identify at-risk accounts.

## Expected output
Signal inventory with predictive rationale (provisional — pending validation data):

| Signal | Data Available | Likely Predictive Rationale |
|--------|--------------|---------------------------|
| Login frequency | Yes | Absence of logins is the most common early churn signal across SaaS products |
| Support ticket volume / recency | Yes | Unresolved or high-frequency support contact often precedes churn |
| NPS score | Yes | Low NPS correlates with churn risk; lagging indicator — useful for calibration |

Signal categories and weighting logic (draft):

Without historical churn data to validate, weights are based on general SaaS patterns. These must be validated against your actual churn history.

Suggested starting weights:
- Login frequency / recency: 50% (usage is the primary retention signal in most SaaS products)
- Support health: 30% (unresolved friction drives churn if it persists)
- NPS: 20% (sentiment signal, but less predictive than behavioral signals)

Health tier definitions (provisional):
- Healthy: 70–100 — normal usage, no open issues
- At-risk: 40–69 — declining usage or open support issue >7 days or NPS 6 or below
- Critical: 0–39 — no login in 14+ days, or high-volume escalated support, or NPS promoter detractor

Update cadence: weekly recommended for At-risk / Critical accounts

---

What's missing before this score can be trusted:
- Historical churn data: which accounts churned in the last 12 months? Do any of the current signals predict them? Without this, the model is a hypothesis, not a validated tool.
- What "healthy usage" looks like in your product: login data is a proxy — what is the core value action you're trying to track? (Feature used, task completed, something else?)
- Account segmentation: does "at-risk" mean the same thing for a 5-seat SMB account and a 100-seat enterprise account?

Validation approach:
Before relying on this score, apply it retroactively to the last 6–12 months of churned accounts. If fewer than 70% of churned accounts would have scored At-risk or Critical in the 30 days before churn, the signal weights need revision.

Limitations:
- Without behavioral depth signals (which features, not just logins), this score will miss product-gap-driven churn
- NPS is quarterly or less frequent in most implementations — significant time gaps reduce its real-time predictive value
