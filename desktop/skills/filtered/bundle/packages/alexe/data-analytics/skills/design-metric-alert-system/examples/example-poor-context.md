## Input
We need metric alerts. What should we set up?

## Expected output
An alerting system can't be designed without knowing what metrics exist and what normal looks like.

What is known:
- The team wants metric alerting

What must be confirmed before starting:
- Which metrics are worth alerting on? (not all metrics need alerts — only those where timely response matters)
- What are the normal ranges for each metric? (thresholds require understanding of baseline variance)
- What tooling is available for alerting? (Datadog, Amplitude, Grafana, custom)
- Who receives alerts and what's the response protocol?
- What's the team's capacity to respond? (too many alerts = all alerts ignored)

Without baselines and ownership, any threshold design will be arbitrary and likely cause alert fatigue.

Suggested next inputs:
- List of critical metrics to monitor
- Normal range or baseline for each (last 30-90 days)
- Alerting tooling available
- Alert recipients and response process

Confidence level:
Provisional
