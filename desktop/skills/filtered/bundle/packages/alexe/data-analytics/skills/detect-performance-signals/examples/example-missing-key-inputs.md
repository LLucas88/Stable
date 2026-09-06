## Input
Our metrics are down this week. Is something wrong?

## Expected output

Status:
Cannot assess whether a signal exists. Required inputs are missing.

What's needed before any signal can be evaluated:

**1. Which metric moved?**

"Metrics are down" could mean conversion, retention, revenue, session count, activation rate, or any other tracked value. Each metric has different baselines, normal variance, and investigation paths. Without knowing which metric, no analysis is possible.

**2. How much did it change?**

The magnitude and direction of the change determine whether it's worth investigating. A 2% WoW change on a volatile metric is likely noise. A 20% drop on a stable metric with high event volume is a probable signal. Without numbers, there is no way to distinguish the two.

**3. What is the baseline?**

To assess whether a movement is a real signal or normal variation, there needs to be a reference point: what was the metric at over the last 4-8 weeks? Without baseline values, the z-score cannot be calculated and there is no way to define "normal."

**4. What is the time period?**

When exactly did the change happen? The timing determines which product changes, deploys, or external events fall within the investigation window.

What can be done once these are provided:

With a specific metric, current value, baseline values, and time period:
- Calculate WoW change and z-score
- Determine if the change is within normal variation or a probable signal
- Run through the data quality checklist (tracking, pipeline, segment composition)
- Identify candidate causes based on deploy timeline and external events
- Produce a ranked list of explanations with a recommended investigation path

Recommended next inputs:
1. Metric name and definition (what counts as a conversion, session, etc.)
2. Current week value and prior 4-8 week values
3. Event or transaction volume per period (to assess data reliability)
4. Any deploys, campaigns, or external events in the last 2 weeks
