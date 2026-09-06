# voc-analytics — Authoring Notes

Builder-facing guidance evicted from `SKILL.md`. Consult when editing scripts,
references, or data contracts; do not paste back into `SKILL.md`.

## Development guidelines

1. Theme extraction uses an LLM (Claude API) with structured output for consistent
   categorization rather than traditional topic models.
2. NPS confidence intervals must use bootstrapping (not normal approximation) —
   NPS is bounded and non-Gaussian.
3. Key-driver analysis uses relative importance (permutation importance from random
   forest), not simple bivariate correlations.
4. Support both predefined theme taxonomies and emergent theme discovery; let the
   LLM suggest new themes.
5. Text categorization must handle multilingual responses for international
   operations.
6. Satisfaction-behavior linking uses explicit causal-reasoning disclaimers
   (correlation, not causation).
7. All deterministic metric computation runs in Python (`numpy`, `scipy.stats`).
   Never let the LLM compute NPS or CIs directly.
8. Bootstrap resampling uses at least 10,000 iterations for stable CIs.

## Acceptance criteria

- NPS matches manual calculation within 0.1 point; bootstrap CIs have nominal 95%
  coverage.
- Theme extraction reaches 85%+ agreement with human labels on a 200-response
  validation set.
- Key-driver analysis identifies the top 3 drivers, verified against known service
  issues.
- Trend detection flags NPS shifts > 5 points as significant with the appropriate
  test.

## Cross-skill integration detail

- **audience-segmentation** — satisfaction scores add a dimension (e.g.,
  "High-value Detractors").
- **seo-content** — extracted themes reveal customer language for content strategy.
- **email-analytics** — NPS class drives personalization (Promoter referral asks vs
  Detractor recovery).
- **reporting** — satisfaction trends and key-driver rankings feed dashboards.
