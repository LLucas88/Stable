# audience-segmentation — Authoring Notes

Builder-facing guidance evicted from `SKILL.md`. Consult when editing scripts,
references, or data contracts; do not paste back into `SKILL.md`.

## Development guidelines

1. Use `scikit-learn` for all clustering; set deterministic seeds
   (`random_state=42`) for reproducibility.
2. Recompute RFM quintile boundaries monthly to account for distribution drift.
3. Normalize behavioral features (`StandardScaler`) before distance-based
   algorithms.
4. Always produce both statistical clusters and business-interpretable RFM
   segments; let the user choose.
5. Segment profiles must include size (count and percentage), top behavioral
   indicators, and average CLV.
6. Migration tracking requires consistent segment definitions across periods;
   document any re-clustering decisions.
7. Validate that cohort retention matrices never exceed 100% retention.
8. Validate that segment migration matrix rows sum to 100%.
9. Write all intermediate DataFrames to workspace paths for downstream skills.
10. Log at INFO level for key pipeline milestones (scoring, clustering fit, etc.).

## Acceptance criteria

- RFM quintile assignment and named-segment mapping match the label table in
  `references/rfm_methodology.md`.
- K-Means k is selected by elbow confirmed by silhouette (target > 0.3), fit with
  `random_state=42`.
- Cohort retention matrices never exceed 100%; migration matrix rows sum to 100%.
- Segment profiles carry size, top distinguishing features, and average CLV.

## Cross-skill integration detail

- **experimentation** — segments used for stratified randomization / subgroup
  analysis.
- **email-analytics** — targets segments with personalized lifecycle flows.
- **paid-media** — builds lookalike audiences from high-value segments.
- **clv-modeling** — enriches segments with a value dimension.
- **reporting** — segment trends in executive dashboards.
- **compliance-review** — validates FS-mode segment targeting avoids prohibited
  discrimination.

Downstream skills read `workspace/processed/segments.json` and
`workspace/analysis/segment_profiles.json`.
