# competitive-intel — Authoring Notes

Builder-facing guidance evicted from `SKILL.md`. Consult when editing scripts,
references, or data contracts; do not paste back into `SKILL.md`.

## Development guidelines

1. Design for graceful degradation: some sources need paid subscriptions (Semrush,
   Ahrefs, SimilarWeb). Function with whatever is available and state what's
   missing.
2. Keyword-gap opportunity scoring must use
   `search_volume * (1 - keyword_difficulty) * business_relevance`.
3. Share-of-voice outputs must include methodology notes and data-source
   limitations.
4. Change detection uses percentage change, not absolute, to handle competitors of
   different sizes.
5. Strategic recommendations must be grounded in specific data points — never
   generic best-practice advice.
6. Support manual competitor list definition; do not auto-discover competitors.
7. All monetary calculations use `decimal.Decimal`.
8. Keep methodology in `references/`; keep SKILL.md focused on the loop.
9. Scripts handle deterministic computation; the LLM handles interpretation and
   recommendation framing.

## Traffic-estimate labeling

Always label traffic estimates with methodology and confidence. Methods: third-
party estimates (SimilarWeb/Semrush/DataForSEO), CTR-curve proxy (search volume ×
position CTR), and relative indexing against your verified traffic. Never present
third-party estimates as precise figures. Use only publicly available pricing;
never scrape in violation of terms of service; label stale pricing with a
last-verified date.

## Acceptance criteria

- Keyword-gap scoring uses the documented formula and matches a manual audit.
- SOV outputs carry methodology + limitations notes.
- Alerting uses percentage thresholds.
- Every recommendation links to at least one specific data point.
