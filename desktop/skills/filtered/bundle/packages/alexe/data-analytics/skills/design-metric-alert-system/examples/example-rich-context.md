## Input
We need to set up alerts for our e-commerce marketplace. Critical metrics: GMV (daily), order success rate, and checkout conversion rate. Secondary: new seller listing rate, and buyer support ticket volume. We're on Datadog for infrastructure and have Amplitude for product analytics — alerts can fire to Slack. Normal ranges based on last 90 days: GMV varies ±18% day-over-day on weekdays, ±35% on weekends. Order success rate is typically 97.1–98.3%. Checkout conversion is 2.8–3.4%. We have a 2-person on-call rotation covering business hours. Team is small — we can handle maybe 2-3 meaningful alerts per week before alert fatigue sets in.

## Expected output
Alert inventory:

| Metric | Alert type | Warning threshold | Critical threshold |
|---|---|---|---|
| Daily GMV | Rate-of-change | >25% drop weekday, >45% drop weekend vs. prior week same day | >40% drop weekday, >60% drop weekend |
| Order success rate | Threshold | Below 96.5% (hourly rolling) | Below 95.0% (any 30-min window) |
| Checkout conversion rate | Anomaly + threshold | >0.5pp drop sustained over 2 hours | >1.0pp drop sustained over 1 hour |
| Buyer support ticket volume | Rate-of-change | >50% spike vs. 7-day average | >100% spike (possible incident indicator) |
| New seller listing rate | Threshold | Not a critical alert — review weekly in dashboard |

Alert logic and frequency rules:
- GMV: compare to same day last week (not prior day) to normalize for weekly patterns. Don't alert on weekday-Monday drops if prior day was Sunday — expected.
- Order success rate: calculate on rolling 30-minute windows, not instantaneous, to avoid transient noise. Minimum 50 orders in window before alert fires.
- Checkout conversion: require sustained drop for at least 60 minutes before firing. Single-spike dips under 30 minutes are likely instrumentation lag or a small burst of bot traffic.
- Support ticket volume: aggregate by hour, compare to 7-day rolling average for the same hour. Spikes in off-hours are meaningful because volume is normally low.
- New seller listing rate: weekend drops of 40-60% are normal. Remove from alert system entirely — weekly dashboard review is sufficient.

Escalation paths:
Warning level: Slack alert to #product-alerts channel. On-call PM acknowledges within 30 minutes during business hours.
Critical level: Slack alert to #product-alerts + direct message to on-call PM + engineering lead. Escalate to engineering if order success rate is below 95% for more than 15 minutes (payment infrastructure issue likely).

Response protocol per alert type:
- GMV drop: check order success rate first (ruling out payment failure). If order success rate is normal, check Amplitude for acquisition funnel drop. If checkout conversion dropped, that's the likely cause.
- Order success rate: immediate Datadog check on payment provider uptime. If payment provider is healthy, check for recent deploy.
- Checkout conversion drop: check for recent FE deploy. Check Amplitude funnel by device type (mobile vs. desktop splits often indicate mobile-specific regressions).
- Support ticket spike: check ticket categories before escalating — could be a single viral user complaint, not a product issue.

False positive mitigation approach:
- GMV alerts use 7-day comparison, not prior-day, to avoid weekend-to-weekday false positives
- Order success rate requires minimum order count in the window before firing
- Checkout conversion requires sustained drop, not instantaneous

Alert maintenance plan:
- Review alert thresholds at the start of each quarter — seasonal baselines shift (holiday periods will need temporary adjustments)
- After any major product change (checkout redesign, payment provider switch), put alerts in observation mode for 48 hours before relying on them
- Log every alert firing and its resolution — after 4 weeks, identify any pattern of false positives and adjust thresholds
