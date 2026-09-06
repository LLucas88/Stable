---
name: weisberg-cross-sell-analysis
description: 'Use when the user wants to measure the impact of a campaign that promotes a NEW product to existing customers — phrases like "cross-sell analysis", "cross-sell campaign results", "product attach rate", "account open rate", "new product adoption from campaign", "second product campaign", "add-a-product campaign", "checking-to-savings campaign", "credit card cross-sell", "did the campaign drive new account opens", "attach campaign", or any review of a campaign whose primary goal is to get current customers to take on a product they don''t already have. Also trigger on "what was our conversion rate on the X campaign to existing customers" and "compare treated vs holdout for new account opens". Cross-sell differs from up-sell: the headline outcome is a binary CONVERSION (did they open the new product?), and value lift is the revenue or balance from the new product, not growth on existing accounts. Handles both holdout-controlled designs (statistical testing on conversion rate AND
  value) and uncontrolled…'
metadata:
  source-name: cross-sell-analysis
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Cross-Sell Campaign Analysis

**Skill ID:** cross-sell-analysis
**Plugin:** campaign-analysis
**Category:** Existing-customer campaign measurement
**Feeds into:** reporting, executive summaries
**Sibling skill:** up-sell-analysis (for campaigns that grow existing accounts rather than open new ones)

---

## Contract

Cross-sell campaigns target current customers and try to get them to take on a
**new product** they don't already hold — checking customer → add a savings
account, credit card holder → add a personal loan, brokerage customer → add a
managed-portfolio account. Unlike up-sell campaigns (which grow an existing
relationship), cross-sell has a clear binary outcome: did the customer open the
new product or not?

That means cross-sell measurement looks more like an acquisition campaign than an
up-sell campaign. The skill produces a clean read on:

1. **Reach** — how many existing customers received the treatment.
2. **Engagement** — open rate, click-through rate.
3. **Conversion rate** (a.k.a. **account open rate** or **product attach rate**) — of treated customers, how many opened the new product within the attribution window.
4. **Value lift** — for those who opened the new product, what was the funded balance, first-period revenue, or other dollarized value.
5. **Causal lift** (only if there is a holdout) — treated conversion rate vs. holdout conversion rate, with a confidence interval and a significance test. Same for value per treated customer.

If there is no holdout, the skill reports the descriptive conversion rate only
and is **explicit that customers may have opened the product without the
campaign** — branch walk-ins, web research, advisor conversations, life events.
Do not let a descriptive conversion read be presented as the campaign's
incremental contribution.

---

## Up-sell vs. cross-sell — pick the right skill

| Question | Cross-sell | Up-sell |
|----------|-----------|---------|
| Primary outcome | Binary: opened new product yes/no | Continuous: change in existing-account metric |
| Headline metric | Conversion rate (account open rate) | Mean/median delta in sales, balance, AUM |
| Conversion rate exists? | Yes — that's the point | No — already a customer |
| Statistical test (causal) | Two-proportion z-test / Fisher's exact on conversion; t/Mann-Whitney on funded balance | Welch's t / Mann-Whitney on delta |
| Example campaign | "Email checking customers about our new high-yield savings" | "Email brokerage customers about funding more into their existing portfolio" |

If the campaign tries to do both (open a new product AND grow existing balances),
run cross-sell-analysis for the new-product outcome and up-sell-analysis for the
existing-account outcome, and combine the two reads in the final readout.

---

## When to ask before running

Confirm inputs. Use AskUserQuestion only when something is genuinely ambiguous;
otherwise proceed and call out assumptions in the report.

Required:

- **Treated population.** A list (CSV / table) of customer IDs who received the campaign treatment, with the treatment date.
- **Target product.** The product being cross-sold. The skill needs a way to detect "did this customer open this product within the attribution window" — usually a product-opens file with `customer_id`, `product_code`, `open_date`.
- **Attribution window.** How long after treatment a new-product open counts as "from the campaign". 30 days is a common default for digital channels; 60–90 days for higher-consideration products (mortgages, advised accounts). Confirm with the user if it's not obvious.
- **Eligibility.** Customers who already held the target product before treatment must be excluded — they cannot "open" something they already have. The skill enforces this and reports the exclusion count.

Optional but important:

- **Holdout group.** A randomly held-out set of eligible customers who were not treated. If present, statistical testing applies.
- **Engagement data**: sends, opens, clicks per customer.
- **Funded balance / first-period revenue** for each new account open — for the value-lift read. If absent, the skill reports conversion rate only and notes that funded-value lift requires this data.
- **Segment dimensions** (tier, tenure, region, channel, advisor, prior product mix).
- **Cost.** If provided, compute ROI = (incremental opens × value per open − cost) / cost.

If the holdout exists but wasn't randomized, treat it as a **comparison group**
and flag the design concern.

---

## Workflow

### Step 1: Validate inputs and enforce eligibility

Load the treated list, holdout list (if present), and the product-opens file.

- **Drop customers who already held the target product before their treatment date.** They can't "open" it. Report the count dropped from each arm.
- **Confirm holdout and treated don't overlap.** Any overlap is a data error — surface it and stop until resolved.
- **Define the conversion event:** customer appears in the product-opens file with `product_code == <target>` and `open_date` within `[treatment_date, treatment_date + attribution_window]`. For holdout customers without an explicit treatment date, use the campaign start date as the anchor.
- **Check for cannibalization.** If the same customer also has an open of a *substitute* product in the window (e.g., they opened a competing internal product instead), note it — cross-sell campaigns can shift behavior rather than create it.

### Step 2: Compute engagement metrics

Same as up-sell:

- Treated count, delivery rate, open rate, CTR.
- Use clicks / delivered as the default CTR definition; label it clearly.

### Step 3: Compute conversion rate (the headline metric)

For each arm:

- **Conversions** = unique customers in the arm with a qualifying product open in the attribution window.
- **Conversion rate** = conversions / eligible customers in the arm.

Always report conversion rate **per eligible customer**, not per clicker — clicker
conversion rate is a useful diagnostic but is descriptive and self-selected, not
the campaign's effect.

### Step 4: Compute value lift on conversions

If funded balance / first-period revenue is available for each open:

- **Mean funded value among converters** (treated and holdout separately).
- **Median funded value among converters** (heavy-tailed; report both).
- **Total funded value** = sum across converters in the arm.
- **Value per eligible customer** = total funded value / eligible count. This is the metric to compare across arms — it combines conversion rate and funded depth into one number.

### Step 5: Branch on design

**If there is a holdout group:**

- **Conversion rate test.** Two-proportion z-test on (conversions, eligible) for treated vs. holdout. Use Fisher's exact when either arm has fewer than ~10 conversions or eligible counts are small.
- **Conversion rate CI on the difference.** Wilson interval on each rate, plus a 95% CI on the absolute difference (treated rate − holdout rate). The absolute difference is what stakeholders should hear; the relative lift (e.g., "+45% conversion") is fine as a co-headline but flag that it depends on the holdout base rate.
- **Incremental opens** = (treated rate − holdout rate) × treated eligible count.
- **Value-per-customer test.** Welch's t-test on per-eligible-customer funded value (most non-converters contribute zero), plus Mann-Whitney U because the distribution is zero-inflated and heavy-tailed. If both available, prefer Mann-Whitney for the headline test of value impact.
- **Bootstrap a 95% CI** on incremental value per eligible customer.

**If there is no holdout group:**

Report the descriptive conversion rate and funded value, and state plainly:

- Without a holdout, you cannot say how many of those opens would have happened anyway. Some opens are always organic (walk-ins, web, advisor-driven).
- A useful benchmark: historical baseline conversion rate for the same segment in the same window when no campaign was running. If available, the difference between campaign-period conversion and baseline is a **directional** read — not causal, but better than nothing.

Recommend a randomized holdout (10–20%) for the next campaign.

### Step 6: Segment breakdown

Repeat Steps 3–5 within each pre-specified segment. Same multiple-testing caveat
as up-sell — don't fish, pre-specify, or correct.

### Step 7: Engagement-vs-conversion cross-tab

Among treated customers, conversion rate by engagement bucket:

- Clicker conversion rate
- Opener (no click) conversion rate
- Unopened conversion rate

This is **descriptive** — engaged customers self-selected on interest. Useful for
creative teams; not causal. If clicker conversion rate is *lower* than non-opener
conversion rate, investigate — that's a warning sign.

### Step 8: Produce the report

Answer the five headline questions in this order:

1. **Who did we reach?** Eligible treated count, delivery, open rate, CTR.
2. **Who converted?** Conversion rate (account open rate), incremental opens vs. holdout if available.
3. **How much value?** Mean / median funded balance, value per eligible customer, total funded value.
4. **Was the campaign responsible?** Two-proportion test + CI on conversion rate, value-per-customer test if data available; otherwise an honest "we cannot attribute causally without a holdout".
5. **Where did it work best?** Segment breakdown.

Then caveats (cannibalization, attribution window choice, sample size) and a
next-campaign recommendation.

---

## Report template

ALWAYS use this exact top-level structure:

```markdown
# Cross-Sell Campaign Analysis — <campaign name>

**Campaign window:** <start> to <end>
**Attribution window:** <N> days post-treatment
**Target product:** <product name>
**Eligible treated population:** <N> (excluded <M> who already held the product)
**Design:** <Randomized holdout | Non-randomized comparison | No holdout>

## 1. Reach and engagement
- Sent: <N>
- Delivered: <N> (<rate>%)
- Opens: <N> (<rate>%)
- Clicks: <N> (CTR <rate>%)

## 2. Conversion (account open rate)
- Treated converters: <N> of <Eligible> (<rate>%)
- Holdout converters: <N> of <Eligible> (<rate>%)    [if holdout]
- Absolute lift: <treated rate − holdout rate> percentage points
- Relative lift: <%>
- Incremental opens (estimated): <N>

## 3. Value
- Mean funded balance per converter (treated): <value>
- Median funded balance per converter (treated): <value>
- Value per eligible customer (treated): <value>
- Value per eligible customer (holdout): <value>    [if holdout]
- Total funded value (treated): <value>

## 4. Causal read
<If holdout:>
- Conversion: two-proportion z, p = <value>; Fisher's exact p = <value>; 95% CI on absolute lift: [<low>, <high>] pp
- Value per eligible: Welch's t p = <value>; Mann-Whitney p = <value>; 95% CI on incremental value/customer: [<low>, <high>]
- Conclusion: <plain language read>

<If no holdout:>
- No randomized holdout. The conversion rate above includes opens that would have
  happened organically. Historical baseline conversion for this segment is <X%>
  (if available); difference is directional, not causal.

## 5. Segment breakdown
| Segment | Eligible | Treated conv % | Holdout conv % | Absolute lift | Notes |

## 6. Engagement vs. conversion (descriptive)
| Group | N | Conversion rate |
| Clickers | | |
| Openers (no click) | | |
| Unopened | | |

## 7. Caveats and recommendations
- <Cannibalization, attribution window, sample size, design issues>
- <What to change for next campaign>
```

---

## Inputs and outputs

**Inputs:**

- `treated.csv` — columns: `customer_id`, `treatment_date`, optionally `segment_*`, `sent`, `delivered`, `opened`, `clicked`.
- `holdout.csv` (optional) — columns: `customer_id`, optionally `segment_*`.
- `product_opens.csv` — columns: `customer_id`, `product_code`, `open_date`, optionally `funded_balance` or `first_period_revenue`.
- `prior_holdings.csv` (optional but strongly recommended) — columns: `customer_id`, `product_code` for products already held at the campaign start. Used to enforce eligibility.

**Configuration:**

- `--target-product <code>` — the product code being cross-sold.
- `--attribution-window <days>` — defaults to 30.

**Outputs** written to `workspace/analysis/cross-sell/<campaign>/`:

- `summary.json` — headline numbers (eligible, converters, rates, lifts, CIs, p-values, segments).
- `report.md` — the report described above.
- `segments.csv` — segment-level breakdown (written only if `segment_*` columns exist on the treated/holdout inputs).
- `engagement_vs_conversion.csv` — clicker/opener/unopened breakdown. Produced only when the treated file contains per-customer `opened`/`clicked` flags; if engagement data is aggregate-only, this file is skipped and the report's engagement-vs-conversion table notes the gap.

---

## Using the helper script

A reference implementation lives at
`${CLAUDE_PLUGIN_ROOT}/skills/cross-sell-analysis/scripts/analyze_cross_sell.py`
(relative to the repo root). It enforces eligibility, computes engagement and
conversion rates, runs the two-proportion test and Fisher's exact, bootstraps
a CI on absolute lift, computes value per eligible customer, and writes the
full output set.

```
python "${CLAUDE_PLUGIN_ROOT}/skills/cross-sell-analysis/scripts/analyze_cross_sell.py" \
  --treated path/to/treated.csv \
  --holdout path/to/holdout.csv \
  --product-opens path/to/product_opens.csv \
  --prior-holdings path/to/prior_holdings.csv \
  --target-product SAV-HY-01 \
  --attribution-window 30 \
  --out workspace/analysis/cross-sell/<campaign>/
```

Omit `--holdout` for descriptive-only mode. Omit `--prior-holdings` only if you
are certain no treated customer already holds the target product (rare —
strongly prefer to provide it).

---

## Methodology notes

See `references/methodology.md` for deeper coverage of:

- Why conversion rate is the right headline for cross-sell.
- Choosing the attribution window (and what changes if you set it wrong).
- Eligibility filtering and why it has to happen before the conversion-rate denominator.
- Cannibalization: when an internal substitute product absorbs the lift.
- Zero-inflated, heavy-tailed funded balances and the right test for value-per-eligible-customer.
- Sample-size intuition for proportions: roughly `n ≈ 16 · p·(1−p) / δ²` per arm to detect an absolute lift of δ on a base rate of p.

---

## Output Format

The primary artifact is `report.md` written to
`workspace/analysis/cross-sell/<campaign>/` (alongside `summary.json` and, when
the inputs support them, `segments.csv` and `engagement_vs_conversion.csv`).
After writing it, close with a status line and a completion keyword:

```text
CROSS-SELL ANALYSIS
Campaign: <name>
Target product: <name>   Attribution window: <N> days
Design: <Randomized holdout | Non-randomized comparison | No holdout>
Report: workspace/analysis/cross-sell/<campaign>/report.md
Headline: <treated vs holdout conversion + CI + p, or descriptive conversion only>
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
```

Completion status:

- **DONE** — a randomized holdout was present, eligibility was enforced, inputs
  validated cleanly, and the report carries a causal read (conversion-rate test,
  CI on the absolute lift, value-per-eligible test where value data exists) with
  no design caveats beyond ordinary sampling error.
- **DONE_WITH_CONCERNS** — the report was written but the result is qualified.
  This is the natural status for a **no-holdout run** (descriptive conversion rate
  only — some opens are always organic), a **non-randomized comparison group**,
  a conversion-only run with no funded-value data, detected cannibalization,
  small conversion counts, or post-hoc segment cuts. Name the specific
  holdout/design caveat in the status and in the report's caveats section.
- **BLOCKED** — a trustworthy read cannot be produced: treated/holdout overlap
  (a data error that halts analysis), a missing product-opens file (no way to
  detect conversion), or eligibility that cannot be enforced because prior
  holdings are unknown. State the blocker and the input needed to clear it.
- **NEEDS_CONTEXT** — required inputs are missing or ambiguous (no treated list,
  no target product code, undefined attribution window) and could not be
  resolved. Ask for the specific file or definition before proceeding.

## Anti-Patterns

- Computing conversion rate over all treated customers instead of *eligible* treated customers (those who didn't already hold the product). This inflates the denominator and depresses the rate.
- Reporting clicker conversion rate as if it were the campaign's incremental effect. It isn't — clickers self-selected.
- Choosing an attribution window after the fact ("let's use 60 days because 30 looked flat"). Pre-commit to a window or report multiple windows up front.
- Quoting relative lift ("+45% conversion") without the absolute base rates. A jump from 0.2% to 0.29% is +45% but probably noise.
- Ignoring cannibalization. If the same customer opened a substitute internal product, the campaign may have shifted the choice rather than created the open.
- Treating a wide non-overlapping CI on conversion as proof of effect when the base rates and N suggest the test is underpowered.

---

## Financial services note

Cross-sell campaigns frequently promote investment or credit products subject to
disclosure rules. If the workspace is tagged as financial services and the
report includes performance claims, projected returns, or any customer-facing
copy, route through the `compliance-review` skill (marketing-analytics plugin)
before distribution. Internal-only readouts that report opens and balances
factually do not require compliance review, but say so on the cover.
