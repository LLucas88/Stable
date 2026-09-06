# Reference: Estimate Sample Size

## Why this reference exists

This skill is calculation-aware.

Its job is not to produce decorative numbers.
Its job is to estimate the sample required for a defensible experiment and translate that into a realistic duration estimate when enough inputs are available.

This reference defines:
- required inputs
- calculation assumptions
- context collection logic
- invalid-use conditions
- output interpretation rules

---

## Core principle

Do not estimate sample size from vague intent alone.

Sample size estimation becomes meaningful only when the experiment has:
- a primary metric
- a baseline value
- a minimum detectable effect or minimum meaningful effect
- a significance/confidence level
- a desired power

If duration is requested, the skill also needs:
- eligible traffic, not total product traffic

---

## Context model for this skill

For this skill, context does not mainly mean product storytelling.
It means computational completeness.

### Context-complete
All mandatory inputs are available.

In this state the skill may:
- estimate sample size per variant
- estimate total sample size
- estimate test duration
- comment on feasibility

### Context-partial
Some mandatory inputs are missing.

In this state the skill should:
- estimate only what is defensible
- explicitly list missing assumptions
- avoid fake precision
- stop at setup guidance if calculation would be misleading

### Context-insufficient
The user wants a sample estimate but key inputs are missing.

In this state the skill should:
- not pretend to calculate a meaningful answer
- switch to checklist mode
- explain what inputs are required before estimation

---

## Mandatory inputs

Minimum required inputs for basic sample size estimation:
- metric type
- baseline metric value
- minimum detectable effect or minimum meaningful effect
- significance level or confidence level
- statistical power

Additional required input if duration is requested:
- eligible traffic per period

---

## Why eligible traffic matters

Duration must be estimated from the traffic that can actually enter the test.

Do not use:
- total site traffic
- total app traffic
- total account base

Use:
- the number of users who actually reach the tested step
- the segment that is truly eligible for assignment

If only part of the total audience can enter the experiment, duration must be based on that subset.

---

## Core variables for simple rate experiments

For simple conversion-style experiments, define:

- `p1` = baseline conversion rate
- `p2` = target conversion rate implied by the desired effect
- `n` = required sample size per group

Example logic:
- baseline conversion = 3.2%
- desired absolute uplift = 0.3 percentage points
- target conversion = 3.5%

---

## Calculation logic by metric type

### 1. Conversion / rate metrics
This is the cleanest case.

**Explicit formula (use this exactly):**

```
n_per_group = (z_α/2 + z_β)² × (p1×(1−p1) + p2×(1−p2)) / (p2 − p1)²
```

Standard z-values:
- 95% confidence (two-sided): z_α/2 = 1.96
- 80% power: z_β = 0.84
- 90% power: z_β = 1.28

So for the common 95% / 80% case: (1.96 + 0.84)² = **7.84**

**Do not multiply by 2.** The formula already accounts for both groups via the `p1×(1−p1) + p2×(1−p2)` term. Adding an extra ×2 is a common error that doubles the required sample size.

Example (baseline 3.2%, MDE +0.3pp → target 3.5%, 95%/80%):
- Numerator: 7.84 × (0.032×0.968 + 0.035×0.965) = 7.84 × (0.030976 + 0.033775) = 7.84 × 0.064751 ≈ 0.5077
- Denominator: (0.035 − 0.032)² = 0.000009
- n per group ≈ 0.5077 / 0.000009 ≈ **56,400**
- Total ≈ 112,800

Total sample size = n_per_group × 2 (one for each variant).

Typical outputs:
- sample size per group
- total sample size
- estimated duration if eligible traffic is known

### 2. Continuous metrics
Examples:
- average revenue per user
- time spent
- average session length

**Explicit formula:**

```
n_per_group = (z_α/2 + z_β)² × 2σ² / δ²
```

Where σ = standard deviation of the metric and δ = minimum detectable difference.

For 95%/80%: n_per_group = 7.84 × 2σ² / δ²

These require dispersion assumptions.
If standard deviation or variance is missing, the estimate is weaker.

In such cases the skill should:
- say the estimate is rough
- ask for standard deviation or historical variance if available
- avoid pretending the answer is exact

### 3. Revenue-per-user / right-skewed metrics

Revenue and monetisation metrics (ARPU, LTV, revenue per session) are often right-skewed: a small number of high-value users pulls the mean and inflates variance.

**Step 1 — Calculate coefficient of variation (CV):**

```
CV = σ / μ    (standard deviation divided by mean)
```

- CV < 1: mild skew — standard continuous formula is acceptable with a caveat
- CV ≥ 1: high skew — standard formula underestimates required n; apply extra caution
- CV ≥ 2: severe skew — strongly recommend log-transformation approach or outlier capping

**Step 2a — Standard formula (acceptable for CV < 1, rough for CV ≥ 1):**

Same as continuous metric formula:
```
n_per_group = (z_α/2 + z_β)² × 2σ² / δ²
```

For CV ≥ 1 this UNDERESTIMATES required sample size. Always state this explicitly.

**Step 2b — Log-normal formula (recommended when CV ≥ 1):**

```
σ_log = sqrt( ln(1 + CV²) )
δ_log = ln(1 + δ_abs / μ_baseline)      ← relative effect on log scale
n_per_group = (z_α/2 + z_β)² × 2 × σ_log² / δ_log²
```

Example (mean $20, SD $60, CV=3.0, MDE +$3, 95%/80%):
- σ_log = sqrt(ln(1+9)) = sqrt(2.303) ≈ 1.517
- δ_log = ln(1 + 3/20) = ln(1.15) ≈ 0.1398
- n = 7.84 × 2 × 2.302 / 0.0195 ≈ 1,848/group

**Always recommend:** cap outliers at the 99th percentile before running the experiment.
Outlier capping reduces effective variance and makes the test feasible without losing material signal.

**Mandatory caveat for all skewed-metric estimates:** state that the estimate is sensitive to variance assumptions and that actual SD should be validated before committing to the timeline.

### 4. Retention rate with cohort dilution

Retention is a binomial metric (user retained: yes/no), but it has a complication: not all users enrolled at the start of the experiment will still be attributable at the measurement deadline. This is called **cohort dilution**.

**Step 1 — Calculate effective sample size using standard binomial formula:**

```
n_effective_per_group = (z_α/2 + z_β)² × (r1×(1−r1) + r2×(1−r2)) / (r2 − r1)²
```

Where r1 = baseline retention rate, r2 = target retention rate.

**Step 2 — Apply dilution adjustment to get enrolled sample:**

```
dilution_rate = fraction of enrolled users who become unmeasurable before the retention window closes
n_enrolled_per_group = n_effective_per_group / (1 − dilution_rate)
```

Common dilution causes: account deletions, app uninstalls, attribution loss, users who never return.
If dilution rate is unknown, flag this as an assumption and suggest 10–20% as a conservative default.

**Step 3 — Duration uses enrolled (not effective) sample:**

```
total_enrolled = n_enrolled_per_group × 2
duration = total_enrolled / eligible_new_users_per_period
```

Note: for retention experiments, "eligible traffic" means **new users entering the cohort per period**, not total active users.

Example (r1=42%, r2=45%, dilution=15%, 95%/80%, 5k new users/week):
- n_effective = 7.84 × (0.2436 + 0.2475) / 0.0009 = 7.84 × 545.7 ≈ 4,278/group
- n_enrolled = 4,278 / 0.85 ≈ 5,033/group
- total = 10,066 → duration = 10,066 / 5,000 ≈ **2.0 weeks**

### 5. Multi-variant tests (3+ arms)

Running multiple treatment arms against one control increases the risk of false positives. Use **Bonferroni correction** to maintain the desired family-wise error rate.

**K = number of treatment arms** (control arm is not counted).

**Bonferroni correction:**
```
α_per_comparison = α_family / K
z_adj = z at (1 − α_per_comparison / 2)    ← two-tailed adjusted z-value
```

Standard adjusted z-values for α_family = 0.05 (95% confidence), 80% power:

| Arms total | K (comparisons) | α_per | z_adj | (z_adj + 0.84)² |
|-----------|----------------|-------|-------|-----------------|
| 2 (standard) | 1 | 0.050 | 1.96 | 7.84 |
| 3 | 2 | 0.025 | 2.24 | 9.49 |
| 4 | 3 | 0.017 | 2.39 | 10.43 |
| 5 | 4 | 0.013 | 2.50 | 11.16 |

**Formula per arm (same metric formula, but use z_adj instead of 1.96):**

Conversion:
```
n_per_arm = (z_adj + z_β)² × (p1×(1−p1) + p2×(1−p2)) / (p2 − p1)²
```

**Total sample = n_per_arm × (K + 1)**  (all arms including control)

**Duration:**
```
duration = n_per_arm × (K + 1) / eligible_traffic_per_period
```

Example (3-arm test: control 12%, both treatments target 13.5%, 95% family-wise/80% power, 6k/week):
- K=2, z_adj=2.24, combined (2.24+0.84)² = 9.49
- n_per_arm = 9.49 × (0.12×0.88 + 0.135×0.865) / (0.015)²
- = 9.49 × 0.2224 / 0.000225 ≈ **9,379/arm**
- Total = 9,379 × 3 = 28,137 → duration = 28,137 / 6,000 ≈ **4.7 weeks**

Compare to naïve 2-variant approach (no correction): 7.84 × 0.2224 / 0.000225 ≈ 7,750/arm — Bonferroni adds ~21% more per arm plus a third arm, making multi-variant tests significantly more expensive.

---

## Duration estimation logic

Use the following idea:

`estimated duration = total required eligible sample / eligible traffic per period`

This estimate must be treated as directional, not guaranteed.

Always check for:
- weekly traffic cycles
- seasonality
- acquisition source mix changes
- launch windows
- campaign periods
- delayed exposure or delayed conversion

If the test must run across unstable periods, say so explicitly.

---

## How to handle missing MDE

Do not guess a fake MDE and move on as if everything is fine.

If MDE is missing:
- explain why it matters
- say sample size cannot be estimated meaningfully without it
- optionally offer scenario-based ranges only if clearly labeled as scenarios

Acceptable fallback:
- “If the team wants to detect a 3% relative uplift, sample size would be X. If the team wants to detect a 7% relative uplift, sample size would be Y.”

Not acceptable:
- silently choosing an arbitrary MDE as if it were fact

---

## How to handle missing SD for continuous or skewed metrics

Standard deviation is a required input for continuous and skewed metrics. Without it, no defensible sample size can be calculated.

If SD is missing:
- state clearly that SD is required before calculation is possible
- do NOT pick an arbitrary SD and proceed as if it were fact
- offer guidance on how to obtain SD: historical data, pilot test, prior experiments, industry benchmarks
- if the user insists on an estimate, provide labeled scenarios tied to assumed SD values with an explicit warning that accuracy depends on the assumption

Good pattern:
- "For continuous metrics, sample size depends on the standard deviation. Without historical SD data, I cannot give a reliable estimate. If SD is approximately X, the sample size would be Y. If SD is approximately 2X, it would be Z."

---

## How to handle missing eligible traffic when duration is requested

If eligible traffic is missing but a duration estimate is requested:
- calculate sample size if all other inputs are present
- state that duration cannot be estimated without traffic data
- do NOT invent a plausible-sounding traffic number
- ask for eligible users per week/month (not total users)

Good pattern:
- “Based on your inputs, you need approximately X users per group (Y total). To estimate how long the test will run, I need to know how many eligible users you have per week.”

---

## How to handle missing significance or power

If the user does not specify them, the skill may use conventional defaults, but it must say so explicitly.

It should not hide defaults.

Good pattern:
- “Using a conventional 95% confidence level and 80% power, the estimated sample size is ...”

Bad pattern:
- returning a number with no explanation of assumptions

---

## Feasibility rules

The skill should comment on feasibility, not just arithmetic.

Useful feasibility checks:
- Is the required sample so large that the test would take too long?
- Is the expected duration too long for the business cadence?
- Is the minimum detectable effect unrealistically small relative to available traffic?
- Is the eligible segment too narrow for a practical experiment?

If feasibility is poor, the skill should say so directly.

---

## Invalid-use conditions

Treat the estimate as incomplete, unreliable, or not ready if:
- baseline is missing
- MDE is missing
- significance/confidence is missing and no explicit default is stated
- power is missing and no explicit default is stated
- eligible traffic is unknown while duration is requested
- the metric is continuous but no variance assumption is available
- the audience used for duration is not actually eligible traffic

---

## Output expectations

A good output should include:
- sample size per group
- total sample size
- estimated duration if possible
- all inputs used
- all assumptions used
- missing inputs if any
- feasibility note
- caveats that materially affect trust

---

## Behavioral rule under incomplete context

If the setup is incomplete, the skill should be useful without hallucinating precision.

That means:
- checklist mode is acceptable
- scenario mode is acceptable when explicitly labeled
- fake precision is not acceptable

---

## Relationship to the experimentation workflow

This skill should usually come after:
- hypothesis framing
- metric definition
- minimum meaningful effect definition

It should not be treated as the place where business importance is invented from scratch.

That work belongs upstream.
