# Email Lifecycle Flow Patterns

Best practices for lifecycle email flows, benchmark conversion rates, and
optimization guidance.

## Common Lifecycle Flows

### Welcome Series

**Purpose:** Introduce new subscribers to the brand, set expectations, and
drive first conversion.

| Step | Timing | Content | Benchmark CTDR |
| :--- | :----- | :------ | :------------- |
| 1 | Immediate | Welcome + value proposition | 8-15% |
| 2 | Day 1-2 | Brand story or onboarding guide | 5-8% |
| 3 | Day 3-5 | Social proof / testimonials | 3-6% |
| 4 | Day 5-7 | First offer or CTA | 4-8% |

**Best Practices:**
- Send the first email within minutes of signup (not hours).
- Welcome series should be 3-5 emails over 7-14 days.
- Include a clear CTA in every email; do not make them purely informational.
- Personalize based on signup source or initial interest signals.

**Benchmark Conversion Rate:** 3-5% end-to-end (signup to first purchase).

### Onboarding Flow

**Purpose:** Guide new customers through product setup and key activation
milestones.

| Step | Trigger | Content | Benchmark CTDR |
| :--- | :------ | :------ | :------------- |
| 1 | Account created | Getting started guide | 6-10% |
| 2 | Day 1 (if no activation) | Feature highlight + how-to | 4-7% |
| 3 | Activation milestone | Congratulations + next steps | 5-8% |
| 4 | Day 7 (if partially activated) | Advanced features or support offer | 3-5% |

**Best Practices:**
- Trigger emails based on behavioral milestones, not just time delays.
- Reduce friction: deep-link to the exact action you want the user to take.
- Segment by activation status — do not send setup reminders to activated users.

**Benchmark Conversion Rate:** 5-10% (activation of key feature).

### Re-engagement Flow

**Purpose:** Win back subscribers who have stopped engaging before they churn.

| Step | Trigger | Content | Benchmark CTDR |
| :--- | :------ | :------ | :------------- |
| 1 | 60 days inactive (click) | "We miss you" + value reminder | 2-4% |
| 2 | 75 days inactive | Exclusive offer or incentive | 1.5-3% |
| 3 | 85 days inactive | Last chance + preference center | 1-2% |
| 4 | 90 days inactive | Sunset notice (will be removed) | 0.5-1.5% |

**Best Practices:**
- Define "inactive" by click recency, not open recency (post-iOS 15).
- Default inactive threshold: 90 days without click. Make this configurable.
- Suppress from regular sends during re-engagement flow to avoid fatigue.
- If no engagement after full flow, suppress the subscriber to protect list
  health and deliverability.

**Benchmark Conversion Rate:** 1-2% re-activation rate.

### Post-Purchase Flow

**Purpose:** Drive repeat purchases, collect reviews, and increase lifetime
value.

| Step | Trigger | Content | Benchmark CTDR |
| :--- | :------ | :------ | :------------- |
| 1 | Purchase confirmed | Order confirmation + cross-sell | 4-8% |
| 2 | Delivery confirmed | Usage tips + review request | 3-5% |
| 3 | Day 14 post-purchase | Related products or reorder reminder | 2-4% |
| 4 | Day 30 post-purchase | Loyalty program or referral offer | 2-3% |

**Best Practices:**
- Transactional emails (order confirmation) have high engagement — use them
  strategically for cross-sell (but maintain CAN-SPAM compliance).
- Timing of review request should align with expected product usage.
- Reorder reminders should be timed to product consumption cycle.

**Benchmark Conversion Rate:** 2-5% repeat purchase rate.

### Win-Back Flow

**Purpose:** Re-acquire lapsed customers who have not purchased in an extended
period.

| Step | Trigger | Content | Benchmark CTDR |
| :--- | :------ | :------ | :------------- |
| 1 | 90 days since last purchase | "We miss you" + what's new | 1-3% |
| 2 | 105 days since last purchase | Exclusive return offer | 1-2% |
| 3 | 120 days since last purchase | Final incentive + social proof | 0.5-1.5% |

**Best Practices:**
- Differentiate from re-engagement flow: win-back targets lapsed purchasers,
  re-engagement targets lapsed engagers.
- Offer escalation: start with content value, then introduce incentives.
- Consider high-value vs. low-value customer segments for offer sizing.

**Benchmark Conversion Rate:** 0.5-1% win-back purchase rate.

## Flow Optimization Principles

### Time-Between-Sends

- **Too frequent:** Increases unsubscribes and complaint rates, harms
  deliverability.
- **Too infrequent:** Loses momentum and reduces flow effectiveness.
- **Optimal cadence:** Typically 2-3 days between sends in active flows,
  7-14 days in nurture flows.
- Test cadence systematically via the experimentation skill.

### Sequence Length

- **Diminishing returns:** Each additional email in a sequence typically shows
  lower engagement than the previous one.
- **Decision point:** If step N shows CTDR below 0.5%, consider ending the
  sequence at step N-1.
- **Exception:** Re-engagement and win-back flows benefit from a final
  "sunset" email even if engagement is very low, as it provides a clean exit.

### Trigger vs. Time-Based

- **Behavioral triggers** (e.g., "completed onboarding step 1") consistently
  outperform purely time-based delays.
- **Hybrid approach:** Use time delays as fallbacks when behavioral triggers
  have not fired within a reasonable window.
- **Example:** "Send feature tutorial 1 day after signup OR immediately after
  first login, whichever comes first."

### Exit Conditions

Every flow should define clear exit conditions:

- **Goal achieved:** Subscriber completed the target action (purchased,
  activated, re-engaged).
- **Hard exit:** Subscriber unsubscribed, bounced, or complained.
- **Suppression:** Subscriber entered a higher-priority flow (e.g., entered
  purchase flow while in welcome series).
- **Timeout:** Subscriber completed the full sequence without converting —
  move to appropriate next flow or suppress.

## Financial Services Flow Considerations

- Welcome series for financial products must include required regulatory
  disclosures in every email.
- Transactional emails (account statements, trade confirmations) are subject
  to SEC archival rules and are separate from marketing flows.
- Offer-based win-back emails must comply with fair lending regulations and
  cannot discriminate based on protected characteristics.
- All flow emails must include proper opt-out mechanisms per CAN-SPAM and
  applicable state regulations.

## Measurement Framework

### Flow-Level Metrics

| Metric | Definition |
| :----- | :--------- |
| Flow Completion Rate | Percentage of entrants who reach the final step |
| Flow Conversion Rate | Percentage of entrants who achieve the flow goal |
| Step Drop-off Rate | Percentage of recipients who disengage at each step |
| Time to Conversion | Average time from flow entry to goal completion |
| Revenue per Flow Entrant | Total attributed revenue / flow entrants |

### Diagnostic Signals

- **High step 1 CTDR, low step 2 CTDR:** Content relevance drops after
  initial interest — revisit step 2 content.
- **Steady CTDR but low conversion:** Clicks are not leading to action —
  review landing page experience.
- **High unsubscribes at specific step:** That email is alienating subscribers
  — review content, frequency, or offer.
- **Flow conversion below benchmark:** Consider A/B testing via the
  experimentation skill.
