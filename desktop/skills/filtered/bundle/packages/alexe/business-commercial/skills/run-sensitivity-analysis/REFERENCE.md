# Reference: Run Sensitivity Analysis

## Why this reference exists

This skill is calculation-aware.

Sensitivity analysis involves varying assumptions in a model and measuring the impact on an outcome. It's a calculation process, but also a judgment process. The value is in correctly identifying which assumptions deserve the most attention, not just in producing a ranked table.

This reference defines:
- required inputs
- calculation method
- interpretation rules
- ranges and realism requirements
- invalid-use conditions

---

## Core principle

The goal of sensitivity analysis is to direct validation effort and attention to the assumptions that matter most.

If an assumption has high sensitivity (small change → large outcome change), it must be validated before the plan can be trusted.
If an assumption has low sensitivity (large change → small outcome change), it can be accepted with less validation.

The output is not just a table. It is a prioritization of what to verify.

---

## Mandatory inputs

- A forecast or business case with explicit numerical assumptions
- The outcome metric to evaluate (revenue, ARR, ROI, payback period, profit)
- For each key assumption: a base case value

Optional but highly useful:
- Realistic ranges for each assumption (pessimistic, base, optimistic)
- A decision threshold (the outcome level that would change the investment decision)

---

## Calculation method

### Step 1: List all key assumptions

Extract every assumption in the model that has a numerical value. Examples:
- Conversion rate: 8%
- Eligible user base: 50,000
- Churn rate: 3.5% monthly
- Average price: $40
- Cost per unit: $12

### Step 2: Define a realistic range per assumption

For each assumption, define:
- Pessimistic: a worse-than-expected but plausible value
- Base: the current estimate
- Optimistic: a better-than-expected but plausible value

Ranges must be realistic. An assumption range of "churn could be 0% to 50%" is not useful.

### Step 3: Vary one assumption at a time

Hold all other assumptions at their base case value.
Substitute the pessimistic and optimistic values for the assumption being tested.
Calculate the outcome for each substitution.

```
Outcome at assumption pessimistic = model run with single assumption at pessimistic, rest at base
Outcome at assumption optimistic = model run with single assumption at optimistic, rest at base
```

### Step 4: Measure the impact

```
Swing = Outcome at optimistic - Outcome at pessimistic
```

Higher swing = higher sensitivity.

Also calculate: what percentage change in the outcome does each assumption's range produce?

### Step 5: Rank by sensitivity

Order assumptions from highest to lowest swing.

### Step 6: Identify the worst realistic case

Set all high-sensitivity assumptions to their pessimistic values simultaneously.
This is not the "worst case". It's the worst realistic case.

Compare this to the decision threshold: does the plan still make sense under the worst realistic combination?

---

## Decision threshold check

A useful sensitivity analysis always asks: "At what assumption value does the decision change?"

Example: "If churn exceeds 6.5%, the payback period exceeds 24 months, at which point the investment is no longer justified."

This is more useful than knowing that churn is the most sensitive variable in the abstract.

---

## Realism requirements for ranges

Unrealistic ranges produce useless sensitivity tables.

Do not:
- Set optimistic = theoretical maximum (0% churn, 100% conversion)
- Set pessimistic = catastrophic failure unless there is a specific reason to believe it could happen

Do:
- Use historical variance from similar initiatives
- Use industry benchmarks for plausible ranges
- Use the team's informed judgment about what "worse than expected" and "better than expected" actually look like for this specific situation

If ranges are uncertain, label them as "estimated" or "judgment-based."

---

## Common errors

### Varying multiple assumptions simultaneously
This is scenario building, not sensitivity analysis. Each assumption must be varied independently to measure its isolated effect.

### Using extreme ranges
If the range for an assumption is "could be 2% or could be 80%," the analysis is not informative. Tighten the range to the realistic operating window.

### Ignoring correlated assumptions
Some assumptions move together: if acquisition volume increases, CAC might also increase (diminishing returns). Sensitivity analysis holds other assumptions constant, which can be misleading for correlated inputs. Flag significant correlations in the output.

### Treating sensitivity ranking as prioritization of what to improve
Sensitivity analysis tells you what to validate and monitor, not necessarily what to optimize first. The most sensitive assumption may be outside the team's control. Focus validation effort on sensitive assumptions that are also actionable.

---

## Invalid-use conditions

The analysis is incomplete or potentially misleading if:
- No forecast or business case exists to analyze
- Assumptions are unstated or implicit
- Ranges are unrealistic (too extreme or too narrow)
- Multiple assumptions are varied simultaneously without labeling it as scenario analysis
- 0% churn or 100% conversion is used as an optimistic case
- The analysis is used to construct a specific outcome rather than to understand the range

---

## Output expectations

A complete output includes:
- Assumption inventory with ranges (pessimistic / base / optimistic)
- Outcome metric per assumption at pessimistic and optimistic values
- Sensitivity ranking (highest to lowest swing)
- Worst realistic case (all high-sensitivity assumptions at pessimistic simultaneously)
- Decision threshold check
- Validation priority recommendations (which assumptions need validation most urgently)

---

## Relationship to adjacent skills

This skill is typically used after:
- run-forecasting-scenarios (to stress-test the scenario assumptions)
- build-business-case (to understand the risk profile of the investment case)

And feeds into:
- plan-risk-mitigation (high-sensitivity assumptions become formal risks)
