# Up-Sell Analysis — Methodology Notes

Deeper coverage of the design and statistical choices in the up-sell-analysis skill.
Read this when a campaign has an unusual data shape, the user pushes back on a
recommendation, or a sample size feels marginal.

## 1. Why a randomized holdout is the only causal design

The question "did the campaign cause the lift?" requires a counterfactual: what
would the treated customers' metric have been if they had not been treated? You
cannot observe that counterfactual for the same customers, so you approximate it
with a comparable group of customers who were not treated.

The approximation is only valid if the holdout is **randomly assigned from the same
eligible population** at the same point in time. Random assignment makes the
treated and holdout groups exchangeable in expectation — their pre-period
characteristics, secular trends, and exposure to outside factors (market moves,
seasonality, other campaigns) are the same on average.

Anything else — "we didn't email Region X this time", "the holdout is last year's
non-responders" — introduces selection bias. The two groups differ in ways
correlated with the outcome, and the measured difference reflects both the
campaign effect and the selection. You can sometimes adjust for known confounders
with regression or matching, but you can never adjust for unknown ones. Random
assignment is the only design that handles unknown confounders by construction.

## 2. When pre/post is acceptable, and when it actively misleads

Pre/post (no control) gives you the observed change in the treated group's
metric. It conflates the campaign effect with everything else that happened over
the window:

- Market moves (especially for balance/AUM metrics).
- Seasonality (Q4 deposit growth, tax-refund season).
- Concurrent campaigns or product launches.
- Secular trends in the customer base (e.g., tenure growth → more product
  attachment over time, regardless of campaign).

Pre/post is **acceptable** as:

- A first-pass directional read for internal teams who understand the limitations.
- A sanity check that the campaign didn't break something (negative lift is at
  least a real warning sign).
- Context for engagement teams who care about creative performance.

Pre/post is **misleading** when:

- The window includes a known market move or seasonal effect.
- The result is presented to executives as "the campaign drove $X" without the
  caveat that we don't know how much of $X would have happened anyway.
- The metric naturally trends (balances tend to grow over time at compounding
  rates, so a 1% lift over 30 days may be roughly the baseline drift).

A useful rule of thumb: if the pre/post lift is smaller than the typical month-
over-month change in the metric for an untreated comparable cohort, the result is
not meaningful even directionally.

## 3. Skewed metrics and outlier handling

Balances, AUM, deposits, and sales totals are usually heavy-tailed. A handful of
customers move the mean enormously. Practical guidance:

- **Always report the median alongside the mean.** If they disagree sharply, the
  mean is being driven by a few customers.
- **Prefer Mann-Whitney U** to Welch's t when the distribution is heavy-tailed.
  It tests whether the rank distribution of deltas differs between groups, which
  is more robust to outliers than testing the mean.
- **Consider a winsorized mean** (e.g., trimming the top and bottom 1%) for the
  headline number, with the untrimmed mean reported in a footnote. Be explicit
  that you trimmed.
- **A log transform** (`log(1 + metric)`) can stabilize variance for strictly
  positive metrics but changes the interpretation — a difference of means on
  log-balances is roughly a percent difference, not a dollar difference. Use
  with care and translate back when reporting to stakeholders.
- **Whales matter for the business case** even if they hurt the statistical test.
  If most of the absolute lift is concentrated in 5 customers, surface that —
  the campaign's value depends on whether you can reliably reproduce that
  concentration or whether it was lucky.

## 4. Sample-size intuition

For a normally distributed metric with standard deviation σ, the rough sample
size per arm needed to detect a mean difference of δ with 80% power at α=0.05 is:

    n ≈ 16 · (σ / δ)²

So if you want to detect a $100 lift on a metric with σ = $500, you need roughly
16 · 25 = 400 customers per arm. Real balance and AUM metrics often have σ that
is large relative to plausible per-customer lifts, which is why many up-sell
campaigns are underpowered to detect realistic effects even when they're working.

When the campaign is going to be underpowered, say so up front. The action item
is to either (a) increase the holdout size and the treated size, (b) target the
campaign to a segment where the metric is less variable, or (c) measure a less
noisy proxy (e.g., "did the customer make any deposit in the next 30 days" is a
binary metric and is far less variable than dollar amount).

## 5. Multiple testing in segment breakdowns

If you test 20 segments at α=0.05, you expect ~1 to look "significant" by chance
alone. Mitigations:

- **Pre-specify segments** before looking at the data. The skill defaults to a
  small set of pre-specified cuts (tier, tenure band, region, product). Anything
  beyond that is exploratory.
- **Bonferroni or Holm correction** divides α by the number of tests. Crude but
  defensible. If you test 10 segments, use α=0.005 per test.
- **Report effect sizes and CIs, not just p-values.** A segment with a large
  point estimate and a wide CI is more interesting than a small-effect
  "significant" segment from a fishing expedition.
- **State the number of tests run** in the report so readers can mentally
  discount the surprise.

## 6. Engagement-vs-value cross-tabs

A clicker-vs-non-clicker comparison within the treated group looks like a causal
analysis but isn't. Clickers self-selected on interest, and interest correlates
with the metric anyway (engaged customers grow faster). The right interpretation
is:

- Clickers have higher deltas → the creative engaged people who were already
  growing. Useful for content/creative teams; not evidence the campaign caused
  the lift.
- Clickers have lower deltas than non-clickers → red flag. Investigate (bad
  creative, wrong audience, anti-selection of the clickers).

To get a causal read on clicking, you would need to randomize *what* people see
inside the campaign, not just whether they were targeted. That's an experiment
question and belongs in the experimentation plugin.

## 7. Holdout sizing for next campaign

If the user is planning a follow-up campaign and asks how big the holdout should
be, a 10–20% holdout from the eligible population is a reasonable default. The
right answer depends on the same n ≈ 16 · (σ/δ)² calculation in §4 — but
practically, the constraint is usually how much business you're willing to forgo
to learn. A 10% holdout on a 100,000-customer campaign is 10,000 untreated
customers, which is plenty of statistical power for any reasonable effect size.
For small campaigns (<5,000 eligible), a 20% holdout is closer to the floor for
detecting realistic effects.
