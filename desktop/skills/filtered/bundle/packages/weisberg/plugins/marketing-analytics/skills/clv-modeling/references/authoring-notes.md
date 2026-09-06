# clv-modeling — Authoring Notes

Builder-facing guidance evicted from `SKILL.md` so runtime context is spent on
the operating loop, not development standards. Consult when editing this skill's
scripts, references, or data contracts. Do not paste back into `SKILL.md`.

## Development guidelines

1. Use the `lifetimes` library for MLE-based models; `PyMC-Marketing` for
   Bayesian posteriors.
2. Always validate with a temporal holdout: fit on first N months, predict next
   M months, compare to actuals.
3. Gamma-Gamma requires frequency > 0; document exclusion of one-time
   purchasers.
4. Discount rate should default to WACC or cost of capital; keep it a
   configurable parameter.
5. CLV confidence intervals must be computed, not just point estimates — use
   bootstrapping or posterior sampling.
6. For financial services, implement an AUM-weighted CLV variant alongside
   transaction-based CLV.
7. Target pipeline execution: under 90 seconds for 500K customers (MLE path).
8. Bayesian CLV posteriors should produce narrower intervals than bootstrapped
   MLE on identical data.

## Acceptance criteria

- BG/NBD holdout period prediction MAE within 20% of calibration period error.
- CLV:CAC calculation correctly handles missing acquisition cost data with
  transparent flagging.
- At-risk identification flags customers with probability-alive < 50% in the
  last quarter.
- Full pipeline from transaction data to CLV predictions executes in under 90
  seconds for 500K customers.
- Bayesian CLV posteriors produce narrower intervals than bootstrapped MLE on
  identical data.

## Cross-skill integration detail

- **audience-segmentation** — export `clv_segments.json` for value-weighted
  segment definitions; CLV tier becomes an enrichment dimension.
- **paid-media** — CLV:CAC ratios inform acquisition bid targets by segment.
- **email-analytics** — probability-alive scores trigger re-engagement flows;
  CLV tiers set personalization/offer levels.
- **attribution-analysis** — CLV serves as a long-term outcome variable;
  attribute CLV (not just conversions) back to touchpoints.
- **reporting** — CLV trends, segment distributions, and at-risk alerts appear
  in executive dashboards.

## Bayesian vs MLE selection

- MLE: fast exploration, large datasets (>100K customers), initial modeling.
- Bayesian (PyMC-Marketing): final production models, small datasets, when
  credible intervals matter, or regulatory/stakeholder presentations requiring
  uncertainty quantification. Sampler: 1000 tune, 1000 draw, ≥4 chains;
  R-hat < 1.01, ESS > 400 for all parameters.
