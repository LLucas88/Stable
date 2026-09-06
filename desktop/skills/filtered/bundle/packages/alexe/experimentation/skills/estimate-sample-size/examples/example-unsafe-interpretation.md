## Input
Traffic is 100,000 users per week overall, so duration should be short.
Primary metric is checkout conversion.
Baseline is 3.2%.
MDE is 0.3 percentage points.
Confidence 95%.
Power 80%.

## Expected output
Warning:
Total product traffic should not be used if only a subset is eligible for the experiment.

What blocks a reliable duration estimate:
- Eligible traffic reaching the tested checkout step is unknown

What can still be estimated:
- Sample size per group
- Total sample size

What cannot be trusted yet:
- Calendar duration estimate

Recommended next input:
- Number of users per week who actually reach the tested checkout step
