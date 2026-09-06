# Lead Scoring Methodology

Feature engineering guide, model selection criteria, and calibration techniques
for predictive lead scoring.

## Feature Engineering

### Firmographic Features

Firmographic features describe the lead's company characteristics. These are
typically strong predictors of deal size and conversion likelihood.

| Feature | Source | Engineering Notes |
| :------ | :----- | :---------------- |
| Company size (employees) | CRM field | Log-transform; bin into SMB / Mid-Market / Enterprise |
| Industry | CRM field | One-hot encode top 15 industries; group remainder as "Other" |
| Annual revenue | CRM field or enrichment | Log-transform; impute missing with industry median |
| Geography / region | CRM field | Map to sales territory; one-hot encode regions |
| Technology stack | Enrichment API | Binary flags for key technologies relevant to product fit |

### Demographic Features

Demographic features describe the individual contact.

| Feature | Source | Engineering Notes |
| :------ | :----- | :---------------- |
| Job title / seniority | CRM field | Map to seniority levels: C-suite, VP, Director, Manager, IC |
| Department | CRM field | One-hot encode; focus on decision-maker departments |
| LinkedIn connections | Enrichment | Proxy for influence; log-transform |

### Behavioral Features

Behavioral features capture engagement signals and are typically the strongest
short-term predictors.

| Feature | Source | Engineering Notes |
| :------ | :----- | :---------------- |
| Page views (last 7/30/90 days) | Web analytics | Count per window; ratio of recent to older activity |
| Email opens / clicks | Email analytics | Count and rate per window; distinguish marketing vs. sales emails |
| Content downloads | CRM / MAP | Count by content type (whitepaper, case study, pricing page) |
| Form submissions | CRM / MAP | Count; weight high-intent forms (demo request, contact sales) higher |
| Event attendance | CRM | Binary flags for webinar, conference, in-person events |
| Recency of last activity | Activity log | Days since last engagement; apply decay function |
| Activity velocity | Activity log | Change in activity count week-over-week |

### Derived Features

| Feature | Derivation |
| :------ | :--------- |
| Lead age | Days between `created_date` and scoring date |
| Activity intensity | Total activities / lead age (activities per day) |
| Channel diversity | Count of distinct `activity_type` values |
| High-intent signal | Binary: 1 if any pricing page view, demo request, or contact-sales form |
| Engagement score | Weighted sum of behavioral features (configurable weights) |

### Feature Engineering Best Practices

- Handle missing values explicitly: use median imputation for numeric features,
  a dedicated "Unknown" category for categorical features.
- Apply log-transforms to skewed numeric features (revenue, employee count,
  page views).
- Create time-windowed aggregations (7-day, 30-day, 90-day) for all behavioral
  features to capture recency and trend.
- Avoid data leakage: never use features that are only known after the outcome
  is determined (e.g., close date, final deal stage).
- For account-based scoring, aggregate contact-level features to the company
  level using max, sum, and count aggregations.

## Model Selection Criteria

### Logistic Regression (Interpretable Baseline)

Use logistic regression as the primary model when:

- Stakeholders require fully transparent scoring logic.
- The sales team needs to understand exactly why a lead received its score.
- Regulatory or compliance requirements demand model interpretability (e.g.,
  fair lending in financial services).
- The feature space is well-engineered and relatively low-dimensional.

Configuration:
- Regularization: L1 (Lasso) for automatic feature selection, or ElasticNet
  for a balance of L1 and L2.
- Solver: `saga` for large datasets; `lbfgs` for smaller datasets.
- Class weights: use `balanced` when conversion rates are below 5%.

### Gradient Boosting (Accuracy-Optimized)

Use gradient boosting when:

- Predictive accuracy is the primary objective.
- The feature space includes complex interactions that logistic regression
  cannot capture.
- SHAP explanations provide sufficient interpretability for stakeholders.

Configuration:
- Use `sklearn.ensemble.GradientBoostingClassifier` or `xgboost.XGBClassifier`.
- Hyperparameter tuning via cross-validated grid search: `n_estimators`
  (100-500), `max_depth` (3-6), `learning_rate` (0.01-0.1), `subsample`
  (0.7-0.9).
- Early stopping on validation loss to prevent overfitting.

### Model Comparison Protocol

1. Train both models on the same temporal training set.
2. Evaluate on temporal holdout (most recent 20% of data by date).
3. Compare AUC-ROC, precision-recall AUC, and calibration error.
4. If gradient boosting AUC exceeds logistic regression by less than 0.02,
   prefer logistic regression for interpretability.
5. Always report both models' performance to stakeholders.

## Calibration Techniques

### Why Calibration Matters

Raw model outputs (especially from gradient boosting) are not true
probabilities. A score of 0.7 does not mean 70% of leads with that score
convert. Calibration transforms raw scores into reliable probability estimates.

### Platt Scaling

- Fits a logistic regression on the model's raw output scores vs. true labels.
- Best for models that produce roughly sigmoid-shaped score distributions.
- Use when the training set is large (>5,000 positive examples).
- Implementation: `sklearn.calibration.CalibratedClassifierCV(method='sigmoid')`.

### Isotonic Regression

- Fits a non-parametric monotonic function to map scores to probabilities.
- More flexible than Platt scaling; handles non-sigmoid distortions.
- Requires more data to avoid overfitting (>10,000 examples recommended).
- Implementation: `sklearn.calibration.CalibratedClassifierCV(method='isotonic')`.

### Calibration Validation

1. Bin scored leads into deciles by predicted probability.
2. For each decile, compute the observed conversion rate.
3. Plot predicted vs. observed rates (reliability diagram).
4. A well-calibrated model produces points along the diagonal.
5. Acceptance criterion: predicted and observed rates must agree within 5
   percentage points across all decile bins.

### Recalibration Cadence

- Recalibrate monthly or whenever the model is retrained.
- Monitor calibration drift: if any decile bin drifts beyond 5 percentage
  points, trigger recalibration.
- Log calibration metrics alongside model performance metrics for audit trail.

## Temporal Validation Protocol

1. Sort all leads by `created_date`.
2. Define a training window (e.g., leads created 12-3 months ago).
3. Define a validation window (e.g., leads created in the most recent 3 months).
4. Train exclusively on the training window; evaluate on the validation window.
5. Never shuffle or randomly split time-ordered lead data.
6. Report performance on both training and validation sets to detect overfitting.

## Drift Detection

- Compare current month's feature distributions to the training set using
  Population Stability Index (PSI).
- PSI > 0.1 for any feature triggers a warning; PSI > 0.2 triggers mandatory
  retraining.
- Monitor the overall score distribution monthly; significant shifts indicate
  population drift.
- Track conversion rate by score decile monthly; divergence from calibration
  indicates model degradation.
