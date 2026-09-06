# Reference: Analyze Experiment Results

## Why this reference exists

This skill is not just about reading deltas.
It must interpret experiment outcomes without collapsing everything into a single number.

This reference defines:
- what a good experiment readout must contain
- how to separate statistical and practical meaning
- how to behave under partial or unsafe context
- what not to claim

---

## Core principle

A result analysis must distinguish between:

- observed effect
- statistical significance
- uncertainty
- practical significance
- guardrail impact
- procedural trustworthiness

A single number is not enough.

---

## Context model for this skill

This skill depends on two different kinds of context.

### 1. Calculation context
Needed to support numerical interpretation.

Strong calculation context includes:
- clear control and test values
- primary metric definition
- sample sizes or statistical summary
- p-value and/or confidence interval if available

Weak calculation context means:
- only raw deltas are available
- no sample sizes
- no uncertainty estimate
- no clear metric definition

### 2. Business interpretation context
Needed to support product recommendations.

Strong business interpretation context includes:
- business relevance of the metric
- guardrail expectations
- cost or rollout implications
- segment relevance

Weak business interpretation context means:
- the numbers can be described
- but action recommendations must stay cautious

---

## Minimum context for a strong readout

To produce a strong readout, try to have:
- a clearly defined primary metric
- comparable control and test results
- sample sizes or valid statistical summary
- guardrail metrics if the change is risky
- basic understanding of whether the result is used for decision-making

If these are missing, the skill should downgrade the strength of interpretation.

---

## What the skill should always separate

### Observed effect
What numerically changed between A and B.

Examples:
- absolute difference
- relative uplift
- raw ratio movement

### Statistical significance
Whether the observed difference is unlikely under the null hypothesis, based on the chosen procedure.

### Uncertainty
How wide the plausible range of the true effect is.

Usually represented by:
- confidence intervals
- or at least a caution that uncertainty is unknown

### Practical significance
Whether the effect is actually worth shipping.

A tiny uplift may be statistically significant and still not matter much.

### Guardrail impact
Whether the change harmed something else while improving the primary metric.

---

## P-value interpretation rules

The skill should explain p-value in the correct direction.

Good interpretation:
- p-value is evaluated relative to the null hypothesis
- lower p-value means the observed data would be less likely if there were truly no effect
- this is evidence, not absolute proof

Bad interpretation:
- p-value is the probability that the hypothesis is true
- p-value below threshold means automatic rollout

If the procedure quality is unknown or compromised, the skill must avoid over-trusting p-value.

---

## Confidence interval interpretation rules

Confidence intervals help show uncertainty around the effect.

Good usage:
- narrow interval = more precise estimate
- wide interval = more uncertainty
- interval crossing the null value weakens the strength of the result

Bad usage:
- treating the interval as a guaranteed bound on the truth in a simplistic way
- ignoring the interval and relying only on the p-value

---

## Metric-type caution

### Rate metrics
Usually the most straightforward for product experiments.

### Continuous metrics
Need more caution around variance and distribution.

### Revenue-like metrics
Often noisy and skewed.
Require special caution in interpretation.

The skill should not speak with the same confidence across all metric types if the assumptions differ.

---

## Guardrail rules

Never ignore side effects just because the primary metric improved.

A result should be downgraded when:
- support load increases
- refund rate worsens
- error rate rises
- retention worsens
- operational burden becomes materially higher

The output should make these trade-offs visible.

---

## Result classification model

Useful categories:
- Positive
- Positive with caution
- Negative
- Neutral
- Inconclusive
- Descriptive only

“Descriptive only” is useful when the calculation context is too weak for stronger claims.

---

## Unsafe interpretation patterns

The skill should explicitly resist these patterns:

### “p < 0.05, so ship it”
Wrong.
Need effect size, uncertainty, guardrails, and procedure quality.

### “The test uplifted by 0.2%, so it worked”
Maybe, maybe not.
Need uncertainty and practical value.

### “Test is not significant, so it failed”
Too simplistic.
It may be underpowered, noisy, or directionally interesting but not decision-ready.

### “Metric went up after release, therefore the change caused it”
Wrong unless experiment design and causal logic support that conclusion.

---

## Output expectations

A strong readout should include:
- primary metric comparison
- effect size
- p-value and/or confidence interval if available
- guardrail status
- result classification
- practical interpretation
- caveats
- missing context limiting confidence

---

## What to do under partial context

### If sample sizes are missing
Describe the observed movement, but do not claim statistical strength.

### If guardrails are missing
Do not give a strong positive recommendation.

### If p-value is present but procedure quality is unknown
State that numerical interpretation may be weakened by procedural uncertainty.

### If business context is missing
Describe the result, but avoid strong rollout language.

---

## Relationship to quality validation

This skill should not act as if it replaces procedural audit.

If procedure quality is questionable, the readout should say:
- numerical signal may exist
- but confidence in decision-making depends on experiment quality

That bridge to quality validation is critical.

---

## Behavioral rule under unsafe context

If the user tries to jump from one statistical signal to a shipping decision, the skill should slow that down.

It should:
- correct the interpretation
- list what else needs review
- avoid overstating certainty

Usefulness is not the same as decisiveness.
