## Input
Control conversion: 3.2%
Test conversion: 3.6%
p-value: 0.03
95% CI for uplift: 0.1% to 0.7%
Support tickets: slightly higher in test

## Expected output
Primary metric:
The test variant outperformed control on conversion rate.

Observed effect:
Conversion increased from 3.2% to 3.6%, a 0.4 percentage point absolute uplift and a 12.5% relative uplift.

Statistical summary:
The reported p-value and confidence interval are consistent with a statistically meaningful improvement under the stated assumptions.

Guardrail summary:
Support tickets increased slightly in the test variant, which may indicate added confusion or operational load.

Result classification:
Positive with caution

Practical interpretation:
The change likely improved conversion, but the side effect on support should be reviewed before a full rollout decision.

Missing context that limits confidence:
- Experiment quality audit
- Implementation cost
- Business value of the uplift