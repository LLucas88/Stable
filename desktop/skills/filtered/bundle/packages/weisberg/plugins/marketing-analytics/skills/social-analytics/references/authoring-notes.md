# social-analytics — Authoring Notes

Builder-facing guidance evicted from `SKILL.md`. Consult when editing scripts,
references, or data contracts; do not paste back into `SKILL.md`.

## Development guidelines

1. Use platform APIs where available; fall back to CSV export for restricted
   platforms.
2. Sentiment analysis must use a pre-trained transformer (e.g.,
   `cardiffnlp/twitter-roberta-base-sentiment`), not keyword matching.
3. Engagement-rate normalization must account for platform-specific reach
   differences; engagement rate = `engagements / reach` (fall back to impressions
   with a transparent label).
4. Share-of-voice calculations must use consistent time windows and query
   definitions across competitors.
5. Support both organic-only and blended (organic + paid) views.
6. Crisis-detection threshold configurable; default 3× standard deviation in
   negative-sentiment volume.
7. All monetary calculations use `decimal.Decimal` to avoid float rounding.
8. Keep methodology detail in `references/`; keep SKILL.md focused on the loop.
9. Scripts handle deterministic computation; the LLM handles interpretation and
   framing.

## Script rename note

The content-analysis and share-of-voice scripts are prefixed `social_` to avoid a
Python module-name collision with `seo-content` and `competitive-intel` (which
ship files of the same base names). Scripts:
`scripts/social_content_analysis.py`, `scripts/social_share_of_voice.py`,
`scripts/normalize_social.py`, `scripts/sentiment_analysis.py`.

## Metric taxonomy

Unified metric mapping across Meta/LinkedIn/TikTok/YouTube/X and video-view
definitions (Meta 3s, TikTok display, YouTube 30s/completion) live in
`references/social_api_mapping.md`. Label all video metrics with the platform-
native view definition; normalize paid-social currency with daily FX; separate
organic/paid/total reach columns.

## Acceptance criteria

- Normalized post schema populates engagement_rate = engagements / reach with a
  documented impressions fallback.
- Sentiment uses the transformer model, not keyword matching.
- Crisis alert fires above the configured negative-sentiment threshold with sample
  mentions and affected platforms.
- Share of voice uses consistent windows/queries across competitors.
