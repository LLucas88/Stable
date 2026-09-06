# Reference: Map Acquisition Funnel

## Why this reference exists

This skill has an analytical component.

Funnel mapping involves conversion math, volume calculations, and channel comparisons. The value is not in listing funnel stages. It's in correctly identifying where the biggest volume is being lost and which improvement is worth prioritizing.

This reference defines:
- funnel conversion formulas
- CAC by channel formulas
- leakage analysis logic
- benchmarks
- mandatory inputs for meaningful analysis
- invalid-use conditions

---

## Core principle

Prioritize by volume lost, not by conversion rate.

A 30% conversion gap at a 500-user step loses 150 users. A 5% conversion gap at a 10,000-user step loses 500 users. The second is 3x more impactful even though the percentage gap is smaller.

Always calculate absolute drop-off, not just relative conversion rates.

---

## Funnel conversion math

### Step-to-step conversion rate

```
conversion_rate(N to N+1) = users_at_step_N+1 / users_at_step_N
```

Example:
- Signups: 800
- Completed onboarding: 320
- Conversion = 320 / 800 = 0.40 = 40%

### Overall funnel conversion

```
overall_conversion = users_at_final_step / users_at_top_of_funnel
```

Example:
- Landing page visits: 10,000
- Activated users: 160
- Overall conversion = 160 / 10,000 = 1.6%

### Volume at each step (from top-of-funnel)

```
volume_step_N = volume_step_1 × CR(1→2) × CR(2→3) × ... × CR(N-1→N)
```

Example (3-step funnel):
- Step 1 (visits): 10,000
- CR(1→2) = 8%, CR(2→3) = 40%, CR(3→4) = 50%
- Step 2 volume: 10,000 × 0.08 = 800
- Step 3 volume: 800 × 0.40 = 320
- Step 4 volume: 320 × 0.50 = 160

### Absolute drop-off per step

```
drop_off_step_N = users_at_step_N - users_at_step_N+1
```

The step with the highest absolute drop-off is the highest-priority target for improvement, all else equal.

---

## CAC by channel

### Channel CAC

```
CAC_channel = spend_on_channel / new_customers_acquired_via_channel
```

Include in spend: ad budget, agency fees, tool costs attributable to the channel, content and SEO investment for organic channels if tracked.

### Blended CAC

```
CAC_blended = total_acquisition_spend / total_new_customers
```

Blended CAC is a starting point, not the full picture. It can mask a situation where paid channels are loss-making while organic pulls the average down.

### Contribution margin check

```
CM = LTV - CAC
```

Where `LTV = (ARPU × Gross Margin) / Churn Rate`

If CM is negative, the channel is loss-making on a gross profit basis. A positive LTV:CAC ratio (above 1x) means CM is positive.

Minimum viable threshold: LTV:CAC above 3x is the commonly cited floor for sustainable growth investment.

---

## Funnel leakage analysis

### Step 1: calculate absolute drop-off at every step

Do not stop at conversion rates. Calculate how many users are lost at each step.

Example:

| Step | Volume | Drop-off to next |
|---|---|---|
| Landing page | 10,000 | 9,200 |
| Signup | 800 | 480 |
| Onboarding complete | 320 | 160 |
| Activated | 160 | (final step) |

### Step 2: identify the conversion gap vs. benchmark

For each step, compare conversion rate to the relevant benchmark (see section below). The step furthest below benchmark signals a product or channel problem.

### Step 3: prioritize

Fix the step with the highest absolute volume lost, not just the lowest conversion rate.

Exception: if the step with the highest drop-off has a conversion rate already near or above benchmark, the problem may be volume-driven (too many low-intent users entering the funnel), not a product fix.

---

## Benchmarks

These are industry reference ranges, not guarantees. They apply only when funnel definitions match.

| Step | Benchmark range |
|---|---|
| Landing page to signup (paid traffic) | 2–8% |
| Landing page to signup (organic traffic) | 5–15% |
| Signup to activation (within 7 days, B2C) | 20–50% |
| Signup to activation (within 7 days, B2B SaaS) | 15–35% |
| Activation to first payment (freemium) | 10–30% |
| Activation to first payment (trial-to-paid) | 30–60% |
| Free to paid conversion (freemium steady state) | 2–8% |

A conversion rate 2x below benchmark does not mean 2x improvement is possible. Check whether the product segment, user intent, and funnel definition match the benchmark source before drawing conclusions.

---

## Mandatory inputs for meaningful funnel analysis

Without these, the output is directional at best:

1. Volume at each funnel step (not just conversion percentages). A "40% conversion" means nothing without knowing whether that's 40 of 100 users or 4,000 of 10,000.
2. Time window: weekly, monthly, or cohort-based. Mixing time windows invalidates comparisons.
3. Channel attribution methodology: last touch, first touch, or multi-touch. Comparing channels that use different attribution models produces false differences.

---

## Invalid-use conditions

The analysis is incomplete or misleading if:

- Channel funnels are compared using different attribution models without disclosure
- Session-based funnel steps are mixed with user-based steps. Example: "visits → signups" is session-level at the top, but "signups → activation" is user-level. Volume at the boundary step must be reconciled.
- Conclusions are drawn from less than 2 weeks of data. Conversion rates on short windows are noise-dominated for most funnels.
- Benchmarks from a different product category or funnel definition are applied without qualification
- Percentages are reported without absolute volumes

---

## Channel funnel comparison

When multiple channels feed the same funnel, compare:
1. Volume contribution per channel (how many users does each channel bring?)
2. Conversion rate at each step per channel
3. End-to-end activation rate per channel

A channel with a low end-to-end activation rate and high volume may be dragging the overall metric down. A channel with a high activation rate and low volume may be underinvested.

Example comparison:

| Channel | Signups | Activation rate | Activated users | CAC |
|---|---|---|---|---|
| Paid search | 400 | 12% | 48 | $55 |
| Organic | 800 | 26% | 208 | $0 |
| Referral | 120 | 35% | 42 | $8 |

In this table, organic delivers the most activations despite a moderate activation rate, because of volume. Referral has the best activation rate but limited volume. Paid search delivers the fewest activations per signup and the highest CAC; a candidate for optimization or reallocation.

---

## Relationship to adjacent skills

This skill is typically followed by:
- optimize-conversion-growth-loops (funnel map identifies where to optimize)
- design-onboarding-flow (activation gap points to onboarding improvement)
- strategize-channel-campaigns (channel funnel differences inform budget allocation)
- model-ltv-cac (CAC by channel feeds LTV:CAC ratio per channel)
