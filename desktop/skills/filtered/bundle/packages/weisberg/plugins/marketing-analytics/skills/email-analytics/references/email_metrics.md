# Email Marketing Metrics Reference

Metric definitions, post-iOS-15 measurement guidance, and industry benchmarks
for email marketing analytics.

## Core Metrics

### Delivery Metrics

| Metric | Definition | Formula |
| :----- | :--------- | :------ |
| Delivery Rate | Percentage of sent emails successfully delivered | `delivered / sent * 100` |
| Hard Bounce Rate | Percentage of emails permanently rejected (invalid address) | `hard_bounces / sent * 100` |
| Soft Bounce Rate | Percentage of emails temporarily rejected (full inbox, server issue) | `soft_bounces / sent * 100` |
| Complaint Rate | Percentage of delivered emails marked as spam | `complaints / delivered * 100` |

### Engagement Metrics

| Metric | Definition | Formula |
| :----- | :--------- | :------ |
| Click-to-Delivered Rate (CTDR) | **Primary metric.** Percentage of delivered emails that received a click | `unique_clicks / delivered * 100` |
| Click-to-Open Rate (CTOR) | Clicks as percentage of opens (use with caution post-iOS 15) | `unique_clicks / unique_opens * 100` |
| Open Rate | Percentage of delivered emails opened (unreliable post-iOS 15) | `unique_opens / delivered * 100` |
| Unsubscribe Rate | Percentage of delivered emails resulting in unsubscribe | `unsubscribes / delivered * 100` |

### Revenue Metrics

| Metric | Definition | Formula |
| :----- | :--------- | :------ |
| Revenue Per Email (RPE) | Average revenue generated per delivered email | `attributed_revenue / delivered` |
| Revenue Per Click (RPC) | Average revenue generated per email click | `attributed_revenue / unique_clicks` |
| Conversion Rate | Percentage of clicks resulting in a conversion event | `conversions / unique_clicks * 100` |

### List Health Metrics

| Metric | Definition | Formula |
| :----- | :--------- | :------ |
| List Growth Rate | Net list growth over a period | `(new_subscribers - unsubscribes - bounces) / total_subscribers * 100` |
| Inactive Rate | Percentage of subscribers with no click in lookback period | `inactive_subscribers / total_subscribers * 100` |
| List Hygiene Score | Composite score: low bounces, high engagement, low complaints | Weighted composite (see below) |

#### List Hygiene Score Calculation

```
hygiene_score = (
    0.35 * (1 - hard_bounce_rate / 0.05)   # penalize bounces above 5%
  + 0.30 * min(ctdr / 0.03, 1.0)           # reward CTDR up to 3%
  + 0.20 * (1 - inactive_rate / 0.50)      # penalize high inactive rate
  + 0.15 * (1 - complaint_rate / 0.001)    # penalize complaints above 0.1%
)
# Clamp to [0, 1]
```

## Post-iOS 15 Measurement Guidance

### The Problem

Starting with iOS 15 (September 2021), Apple Mail Privacy Protection (MPP)
pre-fetches email content and images — including tracking pixels — regardless
of whether the recipient actually opens the email. This inflates open rates
for Apple Mail users, making open-based metrics unreliable.

### Impact

- **Open rates are inflated** by 30-75% depending on Apple Mail share of your
  subscriber base.
- **Open-based metrics are unreliable:** open rate, click-to-open rate, and
  any segmentation based on opens.
- **Click data remains accurate:** clicks require active user interaction and
  are not affected by MPP.

### Recommended Approach

1. **Use CTDR as the primary engagement metric.** Click-to-delivered rate is
   not affected by MPP and reflects genuine subscriber engagement.

2. **De-emphasize open rate in reporting.** If open rate must be reported,
   segment by mail client and note the MPP caveat.

3. **Replace open-based segmentation with click-based segmentation.** Define
   "active" subscribers by click recency, not open recency.

4. **Use click-based send-time optimization.** Build send-time heatmaps from
   click timestamps, not open timestamps.

5. **Monitor trends rather than absolutes for open rate.** If tracking open
   rate over time, look for relative changes rather than absolute values.

### Metrics to Retire or De-emphasize

| Metric | Status | Replacement |
| :----- | :----- | :---------- |
| Open Rate | De-emphasize (report with caveat) | CTDR |
| Click-to-Open Rate | De-emphasize | CTDR |
| Open-based segmentation | Retire | Click-based segmentation |
| Open-based send-time optimization | Retire | Click-based send-time optimization |

## Industry Benchmarks

### Cross-Industry Averages

| Metric | Average | Good | Excellent |
| :----- | :------ | :--- | :-------- |
| Delivery Rate | 95-98% | >98% | >99% |
| Hard Bounce Rate | 0.5-1.0% | <0.5% | <0.2% |
| CTDR | 1.5-3.0% | >3.0% | >5.0% |
| Unsubscribe Rate | 0.1-0.3% | <0.1% | <0.05% |
| Complaint Rate | 0.02-0.05% | <0.02% | <0.01% |
| RPE | Varies by industry | — | — |

### Financial Services Benchmarks

| Metric | Average | Good | Excellent |
| :----- | :------ | :--- | :-------- |
| Delivery Rate | 96-98% | >98% | >99% |
| CTDR | 2.0-3.5% | >3.5% | >5.0% |
| Unsubscribe Rate | 0.08-0.2% | <0.08% | <0.04% |
| Conversion Rate (from click) | 3-8% | >8% | >12% |

### Lifecycle Flow Benchmarks

| Flow Type | Average CTDR | Good CTDR | Average Conversion |
| :--------- | :----------- | :-------- | :----------------- |
| Welcome Series | 4-8% | >8% | 3-5% |
| Onboarding | 3-6% | >6% | 5-10% |
| Re-engagement | 1-3% | >3% | 1-2% |
| Cart Abandonment | 3-5% | >5% | 5-10% |
| Post-Purchase | 2-4% | >4% | 2-5% |
| Win-back | 0.5-2% | >2% | 0.5-1% |

## Attribution Windows

Revenue attribution for email must use consistent attribution windows matching
the organization's standard model. Common approaches:

| Model | Window | Use Case |
| :---- | :----- | :------- |
| Last-click, 7-day | 7 days post-click | Conservative, standard |
| Last-click, 30-day | 30 days post-click | Higher-consideration products |
| Linear, 30-day | Split across touches | Multi-touch journeys |
| Time-decay, 14-day | Weighted by recency | Balanced approach |

Always document which attribution model is in use when reporting RPE and
conversion metrics. Inconsistent windows across reports will produce
contradictory results.
