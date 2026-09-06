# funnel-analysis — Authoring Notes

Builder-facing guidance evicted from `SKILL.md`. Consult when editing scripts,
references, or data contracts; do not paste back into `SKILL.md`.

## Development guidelines

1. Use Wilson score intervals for conversion-rate CIs (more accurate than normal
   approximation at low rates). See `references/funnel_methodology.md`.
2. Funnel definitions must be configurable without code changes — store as JSON or
   YAML step sequences in `workspace/config/funnel_definition.json`.
3. Time-to-convert analysis must handle censored data (users still in funnel at
   analysis time). Use Kaplan-Meier estimation where appropriate.
4. Revenue impact should use conservative estimates: 50th percentile of the
   improvement range, not optimistic projections.
5. Support both GA4 event export format and generic event CSV.
6. The bottleneck scoring formula must be documented and adjustable. Default:
   `drop_off_rate * sqrt(volume) * revenue_proximity`.
7. All statistical computations run in deterministic Python (`scipy.stats`,
   `numpy`). Never let the LLM estimate conversion rates or p-values.
8. Chi-squared segment comparison must apply Bonferroni correction when testing
   more than two segments simultaneously.

## Acceptance criteria

- Funnel construction correctly counts users who do not complete within the time
  window as dropped.
- Wilson score CIs have nominal 95% coverage (verified by simulation).
- Bottleneck ranking agrees with expert assessment on 80%+ of top-3
  identifications.
- Revenue impact estimates land within 25% of observed change when a bottleneck is
  subsequently fixed.
- Segment comparison flags statistically significant differences at p < 0.05.
- End-to-end pipeline runs in under 60 seconds for 1M-row event datasets.

## Cross-skill integration detail

- **experimentation** — CRO hypotheses become A/B test candidates.
- **web-analytics** — provides the behavioral event stream funnels are built from.
- **audience-segmentation** — segment definitions enable cohort-level funnel
  comparison.
- **paid-media** — funnel entry-stage analysis feeds landing-page optimization.
- **reporting** — funnel trends, bottleneck rankings, and CRO progress feed
  dashboards.
