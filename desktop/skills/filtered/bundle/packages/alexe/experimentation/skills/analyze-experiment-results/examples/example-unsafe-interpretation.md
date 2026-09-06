## Input
The p-value is below 0.05, so we should ship it.

## Expected output
Correction:
A p-value below the threshold is not enough by itself to justify rollout.

What still needs review:
- Effect size
- Confidence interval if available
- Guardrail metrics
- Experiment quality
- Business relevance of the uplift

Practical interpretation:
The result may be promising, but rollout should not be recommended from p-value alone.

Result classification:
Unsafe interpretation of incomplete evidence