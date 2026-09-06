# Causal Claims Guide

Use this guide whenever an analysis says or implies "caused", "drove", "lift",
"impact", "incremental", or "because".

## Claim Ladder

| Claim | Allowed Language | Evidence Required |
|-------|------------------|-------------------|
| Descriptive | "X changed" | Reliable measurement over the relevant window. |
| Diagnostic | "X is concentrated in Y" | Decomposition by segment, funnel, cohort, or driver. |
| Correlational | "X is associated with Y" | Relationship survives basic confound and quality checks. |
| Causal directional | "X likely contributed to Y" | Plausible mechanism plus timing plus confound review. |
| Causal quantified | "X caused N lift" | Experiment, holdout, natural experiment, or credible quasi-experimental design. |

## Red Flags

- Before/after analysis with no control group.
- Segment comparison where segment membership is behaviorally selected.
- Post-hoc slicing after looking at the outcome.
- Seasonality or campaign timing not modeled.
- Instrumentation change near the metric movement.
- Exposure defined using post-outcome behavior.
- Survivorship filters that remove failures.

## Downgrade Language

- "Caused" -> "coincided with" or "is consistent with".
- "Drove lift" -> "was associated with higher observed".
- "Incremental" -> "observed difference" unless there is a control or causal design.
- "Users prefer" -> "users in this sample did" unless sampling is representative.

## Good Analyst Move

Say exactly what design would earn the stronger claim: A/B test, holdout, matched
cohort, difference-in-differences, interrupted time series, synthetic control, or
instrumentation audit.
