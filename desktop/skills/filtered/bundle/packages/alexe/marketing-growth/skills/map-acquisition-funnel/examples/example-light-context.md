## Input
We run a SaaS tool. People find us through Google and our blog. We're getting signups but activation is low. Here are rough numbers: about 800 signups/month, maybe 20% activate. We don't have great data on the steps in between.

## Expected output
Funnel stage definitions (assumed based on typical SaaS — confirm against your flow):
Awareness (search/blog) → Landing page → Signup → Onboarding → Activation → Retained

Conversion rates per stage (estimated):

| Stage | Estimated conversion | Notes |
|---|---|---|
| Visit → Signup | Unknown | Need visit volume to calculate |
| Signup → Activation | ~20% | Provided, but "activate" needs a definition |
| Post-activation retention | Unknown | |

Absolute drop-off volumes per stage:
- 800 signups/month → ~640 users not activating per month (at 20% activation)
- At the current activation rate, the product is losing 640 potential active users monthly

Channel breakdown:
Not available. Google and blog are listed as sources but without volume or separate conversion rates, channel comparison isn't possible.

Biggest conversion gaps:
80% of signups not activating is the dominant funnel problem. The question is where in the funnel between signup and activation the drop happens — which requires tracking intermediate steps.

Priority improvement areas:
The activation gap (80% of signups not activating) is the clear priority, but diagnosing it requires knowing:
1. What the activation event is (what does "activate" mean exactly?)
2. Which step in onboarding is losing users (is it step 1, or the last step before activation?)
3. Whether the blog vs. Google traffic activates at different rates

Missing information to complete the funnel map:
- Monthly visit volume (to calculate visit → signup rate)
- Activation event definition
- Onboarding step breakdown with drop-off data
- Channel-level activation rates

Recommended next steps:
- Define activation precisely and confirm it's tracked as a discrete event
- Instrument each onboarding step as a separate event to identify where users drop
- Segment signup sources to compare Google vs. blog activation rates

Confidence level:
Context-informed
