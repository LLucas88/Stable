## Input
We added a tooltip on the onboarding step 2 last week. Our funnel shows step 2 completion went from 54% to 61%. That's clearly the tooltip working. We should add tooltips to every other step.

## Expected output

Observed change:
Step 2 completion rate increased from 54% to 61%, a +7 percentage point absolute improvement (+13% relative) in the week after the tooltip was added.

What the funnel data can and cannot tell you:

The funnel data confirms the metric moved in the right direction after the tooltip was shipped. It does not confirm the tooltip caused the improvement.

This matters for the decision to add tooltips to every other step.

Why the causal claim is not established:

**No control group.** The improvement was observed by comparing the period before and after the change. Any other event during the same week (traffic source shift, seasonal effect, a different product change, a support article going live) could explain the movement or contribute to it.

**Single week of data is insufficient.** One week is within normal week-to-week variance for most funnels. A 7 percentage point change could reflect the tooltip, could reflect noise, or could reflect a temporary traffic quality shift. Without a baseline variance estimate, there's no way to assess if +7pp is a real signal or within expected fluctuation.

**No segment breakdown.** If step 2 completion went up only for a specific acquisition source that grew in volume, the tooltip may not be the driver at all.

What would establish causality:

An A/B test with randomized assignment. Users in the control group see step 2 without the tooltip; users in the treatment group see it with. If step 2 completion is significantly higher in treatment after reaching the required sample size, the tooltip is responsible.

What is safe to conclude from the funnel data:

The metric moved in a positive direction. This is a promising signal that warrants a controlled test, not a rollout decision.

Recommended next step:
Run a properly powered A/B experiment on step 2 before scaling the tooltip to other steps. Use the current baseline (54%) and observed effect (+7pp) to set the MDE and size the experiment. If the experiment confirms the effect, the case for extending to other steps is defensible.
