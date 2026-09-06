## Input
We need alerts for our SaaS product. Key metrics we care about are MAU, churn rate, and MRR. We've been discovering problems too late — usually days after they start. Our analytics are in Amplitude.

## Expected output
Alert inventory (draft — thresholds require baseline data to finalize):

| Metric | Alert type | Proposed logic | Status |
|---|---|---|---|
| MAU | Rate-of-change | Alert if month-to-date active user count is tracking >10% below same period last month | Needs baseline variance data |
| Churn rate | Threshold | Alert if weekly churn rate exceeds X% | X cannot be set without knowing normal churn range |
| MRR | Rate-of-change | Alert if MRR drops more than Y% in a 7-day window | Y cannot be set without knowing normal MRR variance |

Alert logic and frequency rules:
MAU is a lagging monthly metric and shouldn't be tracked with daily alerts — false positives will be frequent. Better approach: alert on leading indicators (DAU decline, login rate decline) that predict MAU before the end of the month.

Churn rate and MRR alerts are feasible but require knowing what "normal" looks like. Without variance data, any threshold will either fire too often (alert fatigue) or miss real problems.

Escalation paths:
Not defined — who gets alerted and through what channel needs to be specified.

Missing information that affects alert design:
- What is the normal range for churn rate and MRR over the past 90 days?
- What tooling is available for alerting? (Amplitude can do alerts natively, but with limitations)
- Who is on the receiving end of alerts and what's the response protocol?
- Are there leading indicators available that predict MRR and churn before they worsen?

False positive mitigation approach:
MAU as a daily alert is likely to produce false positives — monthly metrics don't respond to daily monitoring well. Consider switching to weekly cohort-activation alerts as a leading indicator.

Alert maintenance plan:
Cannot be designed without baseline data and escalation paths.

Recommended next steps:
- Pull 90-day rolling data for churn and MRR to understand normal variance before setting thresholds
- Identify 2-3 leading indicators that move before churn materializes (e.g., login frequency drop, feature engagement decline)
- Define who owns each alert response

Confidence level:
Context-informed
