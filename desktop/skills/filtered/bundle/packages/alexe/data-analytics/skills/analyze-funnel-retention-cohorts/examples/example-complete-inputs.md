## Input
Consumer SaaS product, acquisition funnel through to D7 retention.

Funnel data (last 4 weeks, combined):
- Visitors: 10,000
- Signed up: 3,200
- Completed onboarding (3-step flow): 1,840
- Reached first value action (created first project): 920
- Returned D7: 610

All users are from paid search. No major campaigns or promotions running. No product changes in this period.

## Expected output

Funnel analysis with drop-off rates per step:

| Step | Users | Step-to-step drop-off | Cumulative conversion |
|------|-------|-----------------------|-----------------------|
| Visitors | 10,000 | - | 100% |
| Signed up | 3,200 | 68% | 32% |
| Completed onboarding | 1,840 | 42.5% | 18.4% |
| Reached first value action | 920 | 50% | 9.2% |
| Returned D7 | 610 | 33.7% | 6.1% |

Calculations:
```
drop_off(signup) = 1 - (3200 / 10000) = 68%
drop_off(onboarding) = 1 - (1840 / 3200) = 42.5%
drop_off(first value) = 1 - (920 / 1840) = 50%
drop_off(D7) = 1 - (610 / 920) = 33.7%

D7 retention = 610 / 920 = 66.3% (relative to those who reached first value action)
Overall visit-to-D7 = 610 / 10000 = 6.1%
```

Key patterns:

1. Visitor-to-signup drop-off (68%) is the largest absolute volume loss. At 32% signup conversion, this is mid-range for paid search. Worth investigating but not anomalous.

2. Onboarding-to-first-value is the steepest proportional drop: 42.5% of users who completed onboarding did not reach the first value action. This is the most likely friction point. 920 users out of 1,840 did not create a project after finishing onboarding — that's a direct handoff failure.

3. D7 retention among users who reached first value action is 66.3%. By SaaS benchmarks (D7 good range: 40-55%), this is above average. Users who get to first value action are retaining well.

4. The funnel structure suggests a "leaky middle": onboarding completes but does not reliably convert to first action. The drop at that transition is disproportionate.

Hypotheses for the onboarding-to-first-value drop:
- Onboarding ends without a direct prompt to create a project
- "Create first project" requires a decision (naming, template choice) that users aren't ready to make
- Users complete onboarding on mobile but creation flow is harder on mobile
- Users intend to return but don't — missing follow-up trigger

Recommended next steps:
1. Inspect the onboarding exit point: where exactly do users leave after completing onboarding?
2. Check if there's a session gap between onboarding completion and first project creation (same session vs. return visit)
3. Run user interviews or session recordings on users who completed onboarding but didn't create a project within 48 hours
4. Formulate an experiment: add a post-onboarding project creation prompt with a pre-filled template

Data quality caveats:
- Cohort size (10,000 visitors) is adequate for funnel analysis but individual sub-steps should be checked for tracking completeness
- "Completed onboarding" definition should be verified: does it mean all 3 steps viewed, or all 3 steps submitted?
