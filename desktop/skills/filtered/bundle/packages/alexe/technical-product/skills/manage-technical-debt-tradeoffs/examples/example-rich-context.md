## Input
Engineering wants to refactor our payment processing module. It was written 3 years ago and has grown through patches rather than design. Here's the context:

Current cost of debt:
- Every payment-related feature takes 3-4x longer than equivalent features in other areas. Last quarter: adding PayPal support took 6 weeks, estimated at 2. Adding Apple Pay took 4 weeks, estimated at 1.5.
- Two payment-related incidents in the last 6 months: one caused by an untested edge case in the patched code (2 hours downtime), one caused by a side effect of a small change (4 hours degraded checkout)
- Two engineers say they avoid touching the module "unless forced to." One called it "the most feared file in the codebase."

Investment estimate:
Engineering estimates a full refactor at 8-10 engineer-weeks. They can do it in parallel over 2 sprints with 2 engineers (so 4 sprints = 2 months) while keeping feature velocity for the other 2 engineers.

Business context:
- Q3 roadmap includes: add cryptocurrency payment option (strategic bet, CEO-sponsored), add 3 new regional payment methods for expansion into 2 new markets, improve checkout conversion rate experiment.
- All three roadmap items touch the payment module.
- We process ~$4M in transactions/month. Payment downtime is direct revenue loss.

## Expected output
Debt characterization:
Type: accumulated patching debt — the module was extended repeatedly without architectural revision. This is not cosmetic debt; it's structural debt in a business-critical system.
Cause: time pressure during feature additions over 3 years; no refactor windows built into planning.
Age: 3 years, actively compounding since each new feature adds to the brittle surface.

Current cost of debt:

Velocity: payment features take 3-4x longer than equivalent work elsewhere. Based on last quarter, the delta is approximately 6-7 additional engineer-weeks per payment feature vs. estimates. With 3 payment features on the Q3 roadmap, the carry cost is roughly 15-20 extra engineer-weeks this year.

Reliability: 6 hours of payment downtime in 6 months. At $4M/month in transaction volume, that's approximately $8,300/hour at peak. The two incidents together likely cost $25-50k in lost revenue depending on timing.

Morale and risk: two engineers avoid the module. When the engineers most familiar with the risk avoid the code, the next incident is more likely, not less.

Investment estimate:
8-10 engineer-weeks over 2 months (2 engineers in parallel, rest of squad continues feature work).

Payback analysis:
If the refactor eliminates the 3-4x velocity penalty on payment work, and Q3 has 3 payment features:
- Estimated velocity savings on Q3 features alone: ~15-20 engineer-weeks
- Investment: 8-10 engineer-weeks
- Payback window: Q3 alone recovers the investment if the refactor succeeds

This is an unusually fast payback — debt that blocks the exact roadmap items being planned this quarter is high-priority by definition.

Risk of deferral:
- Q3 roadmap is payment-heavy. Building crypto payments and 3 regional payment methods in the current module will add more debt to an already fragile system.
- Each new payment feature added to the current structure increases the probability of another incident.
- Deferring means paying the 3-4x velocity penalty on all Q3 payment features — approximately 15-20 additional engineer-weeks for features that would take 5-6 weeks in a refactored module.
- The module is already avoided by the engineers who understand it best. This is a compounding risk.

Recommendation: address now (before Q3 payment features begin)
Rationale: the refactor pays back within Q3 given the density of payment work planned. Deferring does not save time — it spends more time building on a fragile foundation and increases incident risk during a period of heavy payment feature work.

Sequencing: complete the refactor before starting the cryptocurrency payment or regional payment features. The checkout conversion experiment can proceed in parallel if it doesn't touch the payment processing module (confirm with engineering).

Stakeholder communication framing:
"We have a choice: spend 8-10 weeks refactoring the payment module now, or spend 15-20 extra weeks on Q3 payment features because each one takes 3-4x longer in the current code — plus accept the ongoing risk of payment incidents at $4M/month in volume. The refactor pays back in this quarter alone."

Do not frame it as: "engineering wants to clean up old code." Frame it as: "we're choosing between paying now or paying more later, with incident risk attached."
