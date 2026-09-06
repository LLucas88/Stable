# email-analytics — Authoring Notes

Builder-facing guidance evicted from `SKILL.md`. Consult when editing scripts,
references, or data contracts; do not paste back into `SKILL.md`.

## Development guidelines

1. Prioritize click-to-delivered rate over open rate as the primary engagement
   metric (iOS 15 / Mail Privacy Protection inflates opens).
2. Send-time optimization must account for time zones in multi-region campaigns.
3. Deliverability monitoring should support both ESP API integration (Braze,
   SendGrid, Iterable) and CSV upload.
4. Inactive-subscriber threshold configurable; default 90 days without click.
5. Subject-line significance testing uses chi-squared on click rates — delegate to
   the experimentation skill, don't implement it here.
6. Revenue attribution must use the organization's standard attribution window.
7. All statistical computations run in deterministic Python scripts. Never let the
   LLM estimate metrics or p-values.

## Acceptance criteria

- Deliverability check identifies misconfigured SPF/DKIM/DMARC against DNS lookup.
- CTDR calculations match ESP-reported metrics within 1% tolerance.
- Send-time heatmap identifies the top 3 windows, verified against held-out sends.
- Inactive-subscriber identification flags 95%+ of subscribers with zero clicks in
  the lookback window.
- Experiment analysis is handed to the experimentation skill via a workspace file,
  not computed inline.

## Cross-skill integration detail

- **experimentation** — all A/B testing (subject line, send time, content variant)
  is delegated; write `workspace/raw/experiment_data.csv` and invoke it.
- **experimentation / email-incrementality** — holdout/lift ("did email cause the
  purchase") belongs to the experimentation plugin's `email-incrementality` skill,
  not here.
- **audience-segmentation** — provides targeting segments for segment-level reads.
- **clv-modeling** — probability-alive scores trigger re-engagement flows.
- **reporting** — email trends feed cross-channel dashboards.
- **compliance-review** — FS-mode content/variant gate before deployment.
