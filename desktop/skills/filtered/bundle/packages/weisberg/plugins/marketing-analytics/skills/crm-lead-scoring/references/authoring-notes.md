# crm-lead-scoring — Authoring Notes

Builder-facing guidance evicted from `SKILL.md`. Consult when editing scripts,
references, or data contracts; do not paste back into `SKILL.md`.

## Development guidelines

1. Use scikit-learn; always include logistic regression as an interpretable
   baseline alongside gradient boosting.
2. SHAP values are required for explainability — never deploy a scoring model
   without feature-importance documentation.
3. Temporal holdout validation is mandatory: train on historical, validate on
   future. Never use random splits for time-series scoring data.
4. Calibrate with isotonic regression or Platt scaling so predicted probabilities
   are reliable.
5. Retraining cadence configurable; default monthly with drift detection comparing
   current feature distributions to training.
6. Support Salesforce and HubSpot field naming via a mapping layer; abstract CRM
   field names into canonical names before feature engineering.

## Acceptance criteria

- Lead-scoring model reaches AUC > 0.75 on the temporal holdout.
- Calibrated probabilities match observed conversion rates within 5 pp across
  decile bins.
- SHAP identifies the top 5 predictive features, verified against expert review.
- Pipeline velocity matches manual CRM reports within 2% tolerance.
- Win/loss analysis surfaces at least 3 significant differentiators (p < 0.05).

## Cross-skill integration detail

- **web-analytics / email-analytics** — supply behavioral and engagement signals
  as scoring features.
- **clv-modeling** — expected value estimates for score-weighted prioritization.
- **audience-segmentation** — segment membership enables segment-aware scoring.
- **paid-media** — lead-quality signals optimize campaign targeting.
- **reporting** — pipeline health metrics in executive dashboards.
