## Input
We want to test reducing checkout from 4 steps to 2 for first-time web buyers.
Primary metric is checkout completion rate.
Guardrails are payment error rate and support contact rate.
Minimum meaningful effect is +5% relative.
Sample size and duration are already estimated.

## Expected output
Objective:
Increase checkout completion for first-time web buyers

Hypothesis:
If we reduce checkout from 4 steps to 2 for first-time web buyers,
we expect checkout completion rate to increase,
because lower friction should reduce abandonment before payment.

Control:
Current 4-step checkout

Test:
New 2-step checkout

Target audience:
First-time web buyers

Primary metric:
Checkout completion rate

Guardrails:
- Payment error rate
- Support contact rate

Thresholds:
- Success if uplift meets or exceeds the minimum meaningful effect
- Failure if no meaningful uplift or guardrails worsen materially

Sample size and duration:
Already estimated and ready to include in the launch plan

Stopping logic:
Run until the predefined sample size is reached unless a severe guardrail issue requires manual shutdown.

Decision rules:
- Roll out if success threshold is met and guardrails remain healthy
- Rerun or iterate if results are mixed
- Reject if negative or operationally harmful

Missing fields that block launch readiness:
None critical