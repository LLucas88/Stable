# Marketing Analytics — Authoring Notes

Builder-facing guidance for the marketing-analytics plugin. This content is
**not** part of any skill's runtime body — it was evicted from the SKILL.md
files so that runtime context is spent on the operating loop, not on
development standards or acceptance checklists. Consult it when editing a
skill's scripts, references, or data contracts; do not paste it back into a
SKILL.md.

Scope: `attribution-analysis`, `experimentation`, `paid-media`, `reporting`,
`compliance-review`. `data-extraction` is already authored to the bar and needs
no separate acceptance criteria here.

---

## Cross-cutting engineering conventions

These hold for every skill in the plugin:

1. **Deterministic computation lives in `scripts/`.** Never let the model
   estimate a p-value, posterior, effect size, sample size, ROAS, or any other
   statistical quantity. Scripts compute; the model interprets, frames, and
   recommends. If a number appears in a report, a script produced it.
2. **Uncertainty is mandatory.** No point estimate ships without its interval
   (credible interval, confidence interval, or posterior). This is both a
   quality rule and, in financial-services mode, a compliance rule.
3. **Progressive disclosure is automatic.** Frontmatter (`name`, `description`)
   loads at routing time; the SKILL.md body loads on activation; `references/`
   and `scripts/` load on demand. Do not narrate this in the body — keep the
   body focused on the operating loop and let reference files carry depth.
4. **Monetary math uses `decimal.Decimal`.** Avoid float rounding in spend,
   revenue, and pacing calculations.
5. **Dates are ISO 8601 and timezone-aware.** Align grain across inputs before
   merging.
6. **Reference files are versioned and self-dating** where they encode rules
   (compliance especially). Update the reference, not the script, when a rule
   changes.
7. **Log which inputs were used.** Aggregation, model fitting, and compliance
   review must all record which workspace files were read and which were
   missing, so a reader can trace provenance.

---

## Per-skill acceptance criteria

A change to a skill's scripts should keep these true. They are test/QA targets,
not runtime instructions.

### attribution-analysis

- R-hat < 1.05 for all estimated parameters.
- Effective sample size > 400 for all estimated parameters.
- Posterior predictive check covers 90%+ of observed data within the 90%
  credible interval.
- Budget optimizer produces feasible allocations summing to the specified total.
- Scenario analysis propagates posterior uncertainty into predictions.
- Channel contribution decomposition sums to total observed outcome within 2%.
- Full pipeline runs end-to-end from raw data to executive report in one session.
- PyMC-Marketing is the primary framework; the Robyn-style ridge fallback
  (`scripts/_lightweight_mmm.py`) is used only when MCMC infra is unavailable or
  the user requests it, and the tradeoff is documented in diagnostics.
- Prior sensitivity analysis (vague vs informative) is always run and reported.
- MCMC traces are stored in ArviZ InferenceData format with seeds, sampler
  settings, and PyMC-Marketing version recorded in diagnostics.

### experimentation

- Power analysis produces sample sizes within 5% of the analytical formula for
  known distributions.
- CUPED adjustment yields 20%+ variance reduction on realistic simulated data
  with correlated covariates.
- Sequential test holds Type I error below nominal alpha (verify across 10,000
  simulation runs).
- SRM detection flags 95%+ of intentionally imbalanced datasets at the 0.1%
  threshold.
- Bayesian posteriors match analytical conjugate solutions on Beta-Binomial
  cases.
- End-to-end raw-data-to-report runs in under 60s for 1M-row datasets.
- CUPED covariates are validated as strictly pre-treatment (no post-treatment
  contamination).
- Two-sided tests are the default; one-sided requires explicit justification in
  the experiment spec.

### paid-media

- Anomaly detection accounts for day-of-week seasonality and known events
  (Black Friday, quarter-end) to suppress false positives.
- Creative fatigue uses conversion-weighted CTR, not raw CTR, so top-of-funnel
  awareness creatives are not mis-flagged.
- Budget pacing projection uses exponential smoothing, not linear extrapolation.
- Incremental data updates (append new dates) are supported without a full
  history reload.
- MCP servers (e.g. `google-analytics-mcp`, `meta-ads-mcp`) are used for live
  data where available, with CSV upload as the fallback.

### reporting

- The dashboard aggregates outputs from at least 5 different skill analysis
  files into a unified view.
- The interactive HTML dashboard loads in under 3s in a modern browser with 50+
  charts.
- Natural-language insights correctly identify the top 3 movers by magnitude.
- PPTX output renders correctly in both PowerPoint and Google Slides.
- Report generation completes within 120s for a full portfolio of outputs.
- HTML is self-contained: inlined CSS/JS and base64-encoded images for offline
  viewing.
- Charts are accessible: alt text, colorblind-safe palettes, screen-reader
  support.
- The template system is extensible without editing core scripts.

### compliance-review

- Advisory only. The skill never certifies compliance; every output states it is
  a first-pass review requiring human compliance-officer confirmation.
- Rule references in `references/` are versioned and updatable without touching
  scripts; each carries its own effective date.
- False-positive rate stays below 30% to preserve reviewer trust; precision is
  prioritized over recall for low-severity issues, while high-severity
  violations (superlatives, guarantees) aim for near-100% recall.
- Disclosure templates support per-firm customization overriding defaults.
- HIGH severity is reserved for clear rule violations; judgment calls (tone,
  emphasis) are MEDIUM/LOW.
- Archival tagging emits metadata compatible with common systems (Smarsh, Global
  Relay, Bloomberg Vault).
- The review log is append-only and immutable once written.
- Fail-safe default: when in doubt, flag for human review rather than pass
  silently.

---

## Financial-services mode (portfolio rule)

When a workspace is tagged as financial services, `compliance-review` is a
mandatory gate for all customer-facing content. Every skill that produces
reports, ad copy, email, or other distributable material routes its output
through `compliance-review` before distribution. The gate is advisory and always
recommends human compliance-officer review. See each skill's `## Contract` for
the specific FS-mode hard-stop it enforces.
