# Cross-Sell Analysis — Methodology Notes

Deeper coverage of the design and statistical choices in the cross-sell-analysis
skill. Read this when a campaign has an unusual data shape, an attribution
window is contested, or a base-rate situation makes the headline numbers
deceiving.

## 1. Why conversion rate is the right headline

Cross-sell campaigns succeed when an existing customer opens a *new* product.
That's a binary event. The rate at which it happens — conversions per eligible
customer in the window — is the cleanest, most comparable number across
campaigns, segments, and time.

Avoid the temptation to lead with funded balance or revenue. Those are downstream
of conversion: a campaign with 1% conversion and $10,000 average funded looks
identical on "total funded" to a campaign with 0.1% conversion and $100,000
average funded, but the second is probably anti-selection (only your wealthiest
customers responded) and won't repeat. Conversion rate exposes the difference;
funded value alone hides it.

Lead with conversion rate, then layer value on top.

## 2. Attribution window choice

The attribution window is the period after treatment during which a new-product
open is credited to the campaign. Choose it before looking at the data, and
report it on the cover of the readout. Practical defaults:

- **30 days** for digital, low-consideration products (savings, basic credit card).
- **60 days** for considered products (rewards card, secured loans).
- **90 days** for high-consideration products (advised accounts, mortgages, business banking).

Why pre-commit? If you slide the window after seeing the data, you'll naturally
land on whichever window makes the campaign look best. That is a form of
multiple testing without correction and inflates apparent effect sizes.

If the user genuinely doesn't know what window to use, run the analysis at 30
and 90 days both, show the curve of cumulative conversion by week-since-
treatment, and let stakeholders pick a window for *next* campaign with the data
on the table. Don't keep re-running until a window "works".

## 3. Eligibility — get this right or the rate is meaningless

A customer who already holds the target product cannot convert to it. Including
them in the denominator deflates the conversion rate; including them in the
numerator (because they "had" the product during the window) inflates it.

The cleanest rule:

- Exclude any customer who held the target product on the campaign start date.
- For the holdout, use the same rule with the same as-of date.
- Report the count excluded from each arm. If the exclusion counts differ
  materially between treated and holdout, the random assignment was either
  flawed or done before the eligibility filter — investigate.

If `prior_holdings` data is not available, the conversion rate will be biased
downward (toward zero) by however many treated customers already had the
product. Disclose this when you report the number.

## 4. Cannibalization and substitution

A cross-sell campaign for high-yield savings might cause a customer to move
money from their existing low-yield savings into the new product. The customer
"converted" but the bank didn't gain a deposit — it shifted one. To detect this:

- Look at substitute internal products opened *or closed* in the attribution
  window for converters. Did closures of substitutes spike?
- Compare net deposit / net AUM change at the customer level, not just the new-
  product funded balance.
- If a meaningful share of "incremental" funded balance is offset by reductions
  elsewhere, surface the net number prominently.

The cross-sell skill doesn't compute net cannibalization by default because the
data shape varies. Flag it in the caveats section and recommend a follow-up
analysis when the campaign targets a product with obvious internal substitutes.

## 5. Value-per-eligible-customer test

The right test for "did the campaign drive incremental funded value per
customer" treats every eligible customer in each arm as one row, with funded
value = 0 for non-converters and = their funded amount for converters. This is
zero-inflated and heavy-tailed.

Practical guidance:

- **Welch's t-test** works at large N because the CLT kicks in, but with small
  arms or skewed funding the p-value can be unreliable.
- **Mann-Whitney U** on the same per-eligible vector is more robust and is the
  default headline test for value impact.
- **Bootstrap CI** on the mean difference is the friendliest stakeholder-
  facing number. Use 5,000+ resamples; report the 2.5th and 97.5th percentiles.
- Don't run the value-per-converter test as the primary value test — it
  conditions on conversion, which is itself an outcome. If the campaign moves
  the conversion rate but not the funded amount per converter, the value-per-
  converter test will show null effect even though the campaign worked.

## 6. Sample-size intuition for proportions

To detect an absolute lift δ on a base rate p with 80% power at α=0.05:

    n per arm ≈ 16 · p · (1 − p) / δ²

So if the holdout conversion is around p = 1% and you want to detect a δ = 0.5
percentage-point lift to 1.5%:

    n ≈ 16 · 0.01 · 0.99 / 0.005² ≈ 6,300 per arm

Real cross-sell campaigns frequently have eligible populations smaller than this
for a given absolute lift, especially for higher-base-rate products where δ is
relatively small. When the campaign is underpowered, say so up front: the
analysis can still report descriptive rates and CIs, but the absence of a
"significant" result is uninformative.

Relative lift is harder to size because it depends on p. Quick conversion to
absolute: a 50% relative lift on p = 1% means δ = 0.5 percentage points — see
above.

## 7. Confidence intervals on rates

For each arm's conversion rate, prefer Wilson interval over the normal-
approximation Wald interval — Wilson is well-behaved at small rates (the regime
cross-sell usually lives in) and at small N.

For the difference between two rates, the simplest defensible CI is the
Newcombe interval, which combines two Wilson intervals. A bootstrap CI is also
fine and avoids the algebra; if you bootstrap, resample customers within each
arm independently and compute the difference of rates each iteration.

## 8. Relative vs. absolute lift in the headline

A 0.2% → 0.29% conversion is a 45% relative lift. That sounds enormous and is
the kind of number that sells a campaign in a deck. It's also two-tenths of a
percentage point in absolute terms and almost certainly inside the noise band
for a typical sample size.

Always report absolute lift (percentage points) and relative lift side by side,
and let the absolute number drive interpretation. Relative lift is fine for
comparison across campaigns or segments, where base rates differ — but the
absolute number is what determines whether the campaign was actually worth
running.

## 9. Engagement-vs-conversion is a diagnostic, not an effect

Clickers convert at a higher rate than non-openers. Almost always. This is not
the campaign's incremental effect — clickers self-selected on interest, and
interested customers were already more likely to open the product.

Use the cross-tab for:

- Creative diagnostics ("our subject line attracted the wrong segment").
- Red flags (clickers converting *less* than openers — possible bait-and-switch
  in the creative, or a broken landing page).
- Sizing the right audience for the next round (look at which prior-engagement
  signals predict conversion in the holdout — that's a clean signal you can
  use to target the next campaign).

Never use it to claim incremental lift.
