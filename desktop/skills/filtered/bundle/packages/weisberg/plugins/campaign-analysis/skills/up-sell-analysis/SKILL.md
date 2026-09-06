---
name: weisberg-up-sell-analysis
description: Use when the user wants to measure the impact of a marketing campaign on existing clients, account owners, or current customers — phrases like "up-sell analysis", "did the campaign move balances", "expansion campaign results", "wallet share lift", "AUM lift", "deposit growth from campaign", "existing customer campaign", "customer growth campaign", "upgrade campaign", "in-book campaign", or any review of a campaign targeted at people who are already customers (so there is no acquisition or conversion-rate question). Also trigger on "how much did balances/sales/revenue go up for treated clients" and "compare treated vs holdout for existing customers". Handles both holdout-controlled designs (statistical testing on the difference) and uncontrolled pre/post designs (descriptive lift only, clearly flagged as non-causal).
metadata:
  source-name: up-sell-analysis
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Up-Sell Campaign Analysis

**Skill ID:** up-sell-analysis
**Plugin:** campaign-analysis
**Category:** Existing-customer campaign measurement
**Feeds into:** reporting, executive summaries

---

## Contract

Existing-customer campaigns (up-sell, cross-sell, expansion, re-engagement,
balance-growth, upgrade) are measured differently than acquisition campaigns.
The audience is already a customer, so there is no conversion-rate metric in the
acquisition sense. What matters is whether the **value metric moved** — sales,
revenue, account balance, AUM, deposits, products held, share of wallet — among
treated customers, and whether that movement is **larger than it would have been
without the campaign**.

This skill produces a clean read on:

1. **Reach** — how many existing clients received the treatment (email, call, in-app message, direct mail, ad audience).
2. **Engagement** — click-through rate (and open rate / response rate where available).
3. **Value lift** — change in the target metric over the campaign window.
4. **Causal lift** (only if there is a holdout) — treated vs. holdout difference, with a confidence interval and a significance test.

If there is no holdout, the skill reports descriptive lift only and is **explicit
that the result is not causal** — outside factors (market moves, seasonality, other
campaigns) could explain the change. Do not let a descriptive read be presented as
proof the campaign caused the lift.

---

## When to ask before running

Before doing analysis, confirm the inputs. Most of the time this is fast — the user
either has a treated list and a metric file, or they don't. Use AskUserQuestion if
anything below is genuinely ambiguous; otherwise just proceed and call out
assumptions in the final report.

Required:

- **Treated population.** A list (CSV / table) of customer IDs who received the campaign treatment, with the treatment date (or the campaign start/end window if applied as a block).
- **Value metric.** Per-customer metric values at two points in time: before the campaign and after the campaign. The metric must be the same definition for both points. Examples: account balance on day 0 vs. day 30, trailing-30-day sales pre vs. trailing-30-day sales post, AUM at start vs. AUM at end.
- **Engagement data** (if measuring an email/digital channel): sends, opens, clicks per customer.

Optional but important:

- **Holdout group.** A randomly held-out set of customers who were eligible but not treated. If present, statistical testing applies. If absent, say so and switch to pre/post descriptive mode.
- **Segment dimensions.** Tier, tenure, region, product, advisor, channel — used to break the headline number down.
- **Cost.** If provided, compute ROI = (lift × treated count − cost) / cost.

If the user has a holdout but it wasn't randomized, treat it as a **comparison
group**, not a control group. Flag the design concern in the report — observational
comparisons can be biased by who was targeted in the first place.

---

## Workflow

Follow these steps in order. Each one builds on the previous one.

### Step 1: Validate inputs

Load the treated list and the metric file. Check:

- Each customer has both a pre-period and a post-period metric value. Drop or flag customers missing either side, and report the drop count.
- Treatment dates fall within the campaign window. If a customer was "treated" outside the window, exclude and report.
- Holdout (if present) does not overlap with the treated list. Any overlap is a data error — surface it loudly and stop until resolved.
- Metric values are numeric and on a comparable scale across customers. If the metric is highly skewed (a few whales), note it — you'll need to report median alongside mean and consider trimming or a log transform for the test.

### Step 2: Compute engagement metrics

For the treated population:

- **Treated count** = number of customers in the treated list (after validation).
- **Delivery rate** = delivered / sent (if bounces are tracked).
- **Open rate** = opens / delivered.
- **Click-through rate (CTR)** = clicks / delivered (or clicks / opens, depending on what the user expects — default to clicks / delivered and label it clearly).

There is **no conversion rate** for an up-sell campaign in the acquisition sense.
If the user asks for one, redirect: the equivalent question is "did clickers grow
their balances more than non-clickers?" — that's a clicker-vs-non-clicker
descriptive comparison, not a conversion rate, and it suffers from selection bias
(engaged customers were already going to grow more).

### Step 3: Compute value lift

For each customer, compute `delta = post_metric − pre_metric`. Then:

- **Mean delta (treated)** and **median delta (treated)**.
- **Total absolute lift** = sum of deltas in the treated group.
- **Percent lift** = mean delta / mean pre_metric, reported with the absolute number alongside it.

Report all three. Mean is sensitive to outliers; median is robust. Stakeholders
usually want to hear the percent, but the absolute dollar (or balance) number is
what actually matters for the business case.

### Step 4: Branch on design

**If there is a holdout group:**

Compute the same per-customer delta for the holdout. Then:

- **Incremental lift per customer** = mean delta (treated) − mean delta (holdout).
- **Total incremental lift** = incremental lift per customer × treated count.
- Run a two-sample test on the deltas: Welch's t-test by default. If the metric is heavily skewed (e.g., balances with whales), also run Mann-Whitney U and report both — if they disagree, trust Mann-Whitney and flag the skew. For binary outcomes (e.g., "purchased the up-sell product yes/no"), use a two-proportion z-test or Fisher's exact for small N.
- Report a 95% confidence interval on the incremental lift per customer (bootstrap CI is fine and avoids distributional assumptions).
- Report the p-value and whether the result is significant at α=0.05. Do not over-claim — a p-value of 0.04 on a small sample with a noisy metric is suggestive, not conclusive.

**If there is no holdout group:**

Report descriptive lift only. State plainly that without a control group you cannot
attribute the change to the campaign — market movement, seasonality, other
concurrent campaigns, or natural growth could all be responsible. Suggest that the
next campaign carve out a randomized holdout (typically 10–20% of the eligible
population) so future analyses are causal.

You can still provide context:

- Compare the treated group's delta to the same metric's movement over the same window for **all customers** or for a **same-tenure cohort** (this is a quasi-comparison, not a control — call it that).
- Compare to the prior period (e.g., the 30 days before the campaign window) for the same treated customers — a "would they have grown anyway?" sanity check.

### Step 5: Segment breakdown

If segment dimensions are available, repeat Step 3 (and Step 4 if holdout exists)
within each segment. Highlight segments where lift is meaningfully larger or
smaller than average. Don't go on a fishing expedition — if you test 20 segments
you'll find a "significant" one by chance. Limit to a handful of pre-specified cuts
unless the user explicitly asks for full exploration, and adjust expectations
accordingly when many cuts are made.

### Step 6: Engagement-vs-value cross-tab

Compare deltas among **clickers** vs. **non-clickers vs. unopened** (treated only).
This is descriptive — clickers are self-selected and likely to have grown anyway —
but it's a useful signal for content/creative teams. Always label it as descriptive,
not causal.

### Step 7: Produce the report

The output report should answer the four headline questions in this exact order:

1. **Who did we reach?** Treated count, delivery, open rate, CTR.
2. **Did the metric move?** Mean and median delta among treated, percent lift, total absolute lift.
3. **Was the campaign responsible?** Holdout comparison with CI and p-value if available; otherwise an honest "we cannot attribute causally without a holdout" plus contextual benchmarks.
4. **Where did it work best?** Segment breakdown, top and bottom segments.

Then: any caveats (skew, sample size, design issues), and a recommendation for the
next campaign (especially: carve out a holdout next time if there wasn't one).

---

## Report template

ALWAYS use this exact top-level structure so reports are consistent across
campaigns:

```markdown
# Up-Sell Campaign Analysis — <campaign name>

**Campaign window:** <start> to <end>
**Treated population:** <N> existing customers
**Design:** <Randomized holdout | Non-randomized comparison | Pre/post only>

## 1. Reach and engagement
- Sent: <N>
- Delivered: <N> (<rate>%)
- Opens: <N> (<rate>%)
- Clicks: <N> (CTR <rate>%)

## 2. Value lift (treated)
- Metric: <metric name>
- Mean delta: <value>
- Median delta: <value>
- Percent lift vs. pre-period mean: <%>
- Total absolute lift: <currency>

## 3. Causal read
<If holdout:>
- Incremental lift per customer: <value> (95% CI: <low>, <high>)
- Total incremental lift: <value>
- Test: <Welch's t | Mann-Whitney | two-proportion z>, p = <value>
- Conclusion: <significant / not significant at α=0.05>, and what that means in plain language.

<If no holdout:>
- No randomized holdout. The observed lift is descriptive and not attributable to the campaign.
- Context comparison: <treated delta> vs. <all-customer or cohort delta> over the same window.

## 4. Segment breakdown
| Segment | Treated N | Mean delta | Incremental (if holdout) | Notes |

## 5. Engagement vs. value (descriptive)
| Group | N | Mean delta |
| Clickers | | |
| Openers (no click) | | |
| Unopened | | |

## 6. Caveats and recommendations
- <Skew, sample size, design issues>
- <What to change for next campaign>
```

---

## Inputs and outputs

**Inputs** (the skill reads these from a path the user provides, or asks for them):

- `treated.csv` — columns: `customer_id`, `treatment_date`, optionally `segment_*`, `sent`, `delivered`, `opened`, `clicked`.
- `holdout.csv` (optional) — columns: `customer_id`, optionally `segment_*`.
- `metric.csv` — columns: `customer_id`, `metric_pre`, `metric_post`, optionally `metric_name`.

**Outputs** written to `workspace/analysis/up-sell/<campaign>/`:

- `summary.json` — machine-readable headline numbers (reach, engagement, lift, CI, p-values, segments).
- `report.md` — the report described above.
- `segments.csv` — segment-level breakdown (written only if `segment_*` columns exist on the treated/holdout inputs).
- `engagement_vs_value.csv` — clicker/opener/unopened breakdown. Produced only when the treated file contains `opened`/`clicked` flags per customer; if the engagement data is aggregate-only, this file is skipped and the report's engagement-vs-value table notes the gap.

---

## Using the helper script

A reference implementation lives at
`${CLAUDE_PLUGIN_ROOT}/skills/up-sell-analysis/scripts/analyze_upsell.py`
(relative to the repo root). It handles both the holdout and no-holdout
branches, computes engagement metrics, runs the appropriate test, bootstraps
a CI, and writes `summary.json`. Use it when the input shape matches the
expected schema above. If the user's data is materially different (e.g., the
metric is a panel of daily balances rather than pre/post), adapt the logic in
a notebook or script rather than forcing the data into the expected shape.

```
python "${CLAUDE_PLUGIN_ROOT}/skills/up-sell-analysis/scripts/analyze_upsell.py" \
  --treated path/to/treated.csv \
  --holdout path/to/holdout.csv \
  --metric  path/to/metric.csv \
  --out     workspace/analysis/up-sell/<campaign>/
```

Omit `--holdout` for the pre/post-only mode. The script prints the headline read
and writes the full output set to `--out`.

---

## Methodology notes

See `references/methodology.md` for deeper coverage of:

- Why a randomized holdout is the only design that gives causal lift.
- When pre/post is acceptable as a directional read and when it actively misleads.
- Handling of skewed metrics (balances, AUM) and outlier treatment.
- Sample-size intuition: roughly how many customers per arm are needed to detect a given relative lift on a noisy metric.
- Multiple-testing pitfalls in segment breakdowns.

---

## Output Format

The primary artifact is `report.md` written to
`workspace/analysis/up-sell/<campaign>/` (alongside `summary.json` and, when the
inputs support them, `segments.csv` and `engagement_vs_value.csv`). After writing
it, close with a status line and a completion keyword:

```text
UP-SELL ANALYSIS
Campaign: <name>
Design: <Randomized holdout | Non-randomized comparison | Pre/post only>
Report: workspace/analysis/up-sell/<campaign>/report.md
Headline: <incremental lift/customer + 95% CI + p, or descriptive lift only>
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
```

Completion status:

- **DONE** — a randomized holdout was present, inputs validated cleanly, and the
  report carries a causal read (incremental lift, 95% CI, significance test) with
  no design caveats beyond ordinary sampling error.
- **DONE_WITH_CONCERNS** — the report was written but the result is qualified.
  This is the natural status for a **no-holdout pre/post run** (descriptive lift
  only, not causal), a **non-randomized comparison group**, heavy metric skew,
  small samples with wide CIs, or post-hoc segment cuts. Name the specific
  holdout/design caveat in the status and in the report's caveats section.
- **BLOCKED** — a trustworthy read cannot be produced: treated/holdout overlap
  (a data error that halts analysis), missing pre- or post-period values for most
  customers, or a metric that is not comparable across the two time points. State
  the blocker and the input needed to clear it.
- **NEEDS_CONTEXT** — required inputs are missing or ambiguous (no treated list,
  no metric file, undefined campaign window) and could not be resolved. Ask for
  the specific file or definition before proceeding.

## Anti-Patterns

- Reporting a percent lift without the absolute number, or vice versa.
- Treating a non-randomized comparison group as a control. Call it a comparison group and flag the bias.
- Letting clicker-vs-non-clicker lift be interpreted as the campaign's incremental effect — it isn't, because engaged customers were already going to grow more.
- Running tests on every segment and reporting whichever cuts are "significant" without correction or pre-specification.
- Including customers whose pre-period metric is zero or missing in a percent-lift calculation — they distort the mean. Report on the subset with valid pre-values and disclose the exclusion count.
- Confusing "no significant difference" with "no effect" when the sample is small. A wide CI that crosses zero means we can't tell, not that the campaign did nothing.

---

## Financial services note

If the workspace is tagged as financial services and the report includes
performance claims (e.g., "balances grew X%"), the report is customer-facing and
must be routed through the `compliance-review` skill (in the marketing-analytics
plugin) before distribution. Performance presentation rules (SEC Marketing Rule
206(4)-1, FINRA Rule 2210) apply to internal-sounding reports the moment they
leave the building. Internal-only readouts are fine without compliance review,
but say so on the cover.
