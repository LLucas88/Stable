## Input
We have a mobile app with a free trial. Conversions are low and we're not sure why. We want to build a metrics framework for the activation and conversion funnel but don't know where to start. We track events in Mixpanel but coverage is patchy.

## Expected output
Primary metric:
Trial-to-paid conversion rate
Definition: percentage of trial users who convert to a paid plan before or at trial expiration
Note: "low conversions" needs a baseline to assess severity — first step is establishing the current rate

Secondary metrics (likely candidates, to confirm against your funnel):
1. Activation rate — share of trial users who complete the core activation event (what this is needs to be defined for your product)
2. Feature engagement depth — number of key features used during trial (proxy for perceived value)
3. Time-to-activation — how quickly users reach first value moment

Guardrail metrics:
- Trial churn rate (users who abandon before trial ends without converting)
- Support contact rate during trial (rising support volume can indicate friction)

Metric-to-goal mapping:
Incomplete — the business goal beyond "more conversions" isn't specified. Define whether the priority is increasing conversion rate, increasing absolute paid user count, or reducing time-to-conversion.

Instrumentation requirements:
Patchy Mixpanel coverage means instrumentation gaps need to be audited before metric design is finalized. Key questions: Is trial start tracked? Is activation event instrumented? Is there a conversion event?

Vanity metrics to avoid:
- App installs
- Trial starts in isolation (without linking to conversion)

Gaps in current data coverage:
- Activation event not defined — this is a prerequisite before funnel metrics can be measured
- "Patchy coverage" suggests funnel steps may have missing or inconsistent events

Missing information:
- What is the activation event in this product?
- What does the trial include and what's gated behind payment?
- What is the current trial-to-paid conversion rate?

Confidence level:
Provisional
