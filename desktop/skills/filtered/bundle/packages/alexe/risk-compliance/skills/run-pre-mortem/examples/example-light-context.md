## Input
We're launching a new paid tier next month. It's the first time we've offered a premium plan. We have about 40,000 free users. Team is small — 2 engineers, 1 PM. We're a bit nervous about it.

## Expected output
Pre-mortem framing statement:
It is 3 months after the paid tier launch. Conversion to paid is 0.4% (we expected 3%). Three of our best free users publicly complained about the paywall on social media. The payment flow has a 40% cart abandonment rate. One enterprise prospect didn't convert because we didn't have invoicing.

What went wrong?

Failure mode list by category:

Technical failures:
1. Payment flow issues: payment integration bugs or poor UX in the payment flow caused abandonment. A 40% cart abandonment rate is typical when checkout is confusing, slow, or breaks on specific browsers.
2. Pricing page errors: pricing displayed incorrectly in certain currencies or regions.

Execution failures:
3. Value proposition not clear enough at the paywall: free users don't understand what they're paying for. "Premium features" is too vague — they need to see the specific features and why they matter.
4. Launch timing: launching in a slow month (e.g., August, December) reduces the pool of active free users seeing the paid tier.
5. No migration path for power free users: the most active free users are most likely to feel the paywall as a punishment rather than a natural upgrade. These are also the most vocal users — their negative reaction can suppress conversion from other users.

Organizational failures:
6. No pricing research: price was set without testing willingness to pay. If $19/month is too high for the audience, conversion will underperform regardless of how good the feature is.
7. Two-engineer team underestimated edge cases: billing edge cases (refunds, failed payments, coupon codes, plan changes) often require more engineering work than the initial payment integration.

External failures:
8. Competitor offers similar features for free: free users may switch rather than pay, especially if the switch is easy.

Top 3-5 failure modes:
1. Value proposition not clear: the paywall experience is the most controllable and highest-leverage factor for conversion. If free users don't immediately understand what they gain, they won't convert.
2. Payment flow UX: a first-time payment flow for a small team is often the most underbuilt part of the launch. Test the full payment flow on multiple browsers and mobile before launch.
3. Pricing not validated: with 40k free users, there's an opportunity to run a pricing survey or offer the paid tier to a small group at different price points before full launch.

Mitigations:
1. Test the complete payment flow end-to-end (including edge cases: invalid card, declined payment, coupon codes) before launch
2. A/B test two versions of the paywall value proposition copy with a small segment before full rollout
3. Survey 50 active free users on their willingness to pay before confirming the price point
4. For vocal free users: have a communication plan ready for users who react negatively to the paywall, including a limited-time early adopter offer

Early warning signals:
- Cart abandonment rate above 25% in the first 48 hours
- No conversions in the first 72 hours (suggests fundamental issue with paywall or payment flow)
- Social media mentions with negative sentiment about the paywall within the first week

Confidence level:
Context-informed
