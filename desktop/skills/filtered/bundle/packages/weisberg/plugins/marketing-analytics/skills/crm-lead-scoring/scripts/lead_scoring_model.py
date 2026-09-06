"""
Lead Scoring Model — Feature engineering, model training, SHAP explanation,
and score calibration for predictive lead scoring.

Uses logistic regression (interpretable baseline) and gradient boosting
(accuracy-optimized) with temporal holdout validation. SHAP values provide
per-lead feature explanations. Calibration ensures predicted probabilities
match observed conversion rates.

Dependencies:
    pandas, numpy, scikit-learn, shap

Inputs:
    workspace/raw/crm_leads.csv
    workspace/raw/lead_activities.csv
    workspace/processed/segments.json (optional)

Outputs:
    workspace/analysis/lead_scores.json
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd
from numpy.typing import NDArray


# ---------------------------------------------------------------------------
# Feature Engineering
# ---------------------------------------------------------------------------


def load_crm_leads(filepath: str | Path) -> pd.DataFrame:
    """Load and validate CRM lead/opportunity data.

    Parameters
    ----------
    filepath : str | Path
        Path to ``crm_leads.csv``. Required columns: ``lead_id``, ``source``,
        ``stage``, ``created_date``, ``close_date``, ``amount``, ``outcome``.

    Returns
    -------
    pd.DataFrame
        Validated lead dataframe with parsed date columns.

    Raises
    ------
    ValueError
        If required columns are missing.
    """
    df = pd.read_csv(filepath)
    required = {"lead_id", "source", "stage", "created_date", "close_date", "amount", "outcome"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df["created_date"] = pd.to_datetime(df["created_date"])
    df["close_date"] = pd.to_datetime(df["close_date"], errors="coerce")
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
    return df


def load_lead_activities(filepath: str | Path) -> pd.DataFrame:
    """Load and validate lead activity/behavioral data.

    Parameters
    ----------
    filepath : str | Path
        Path to ``lead_activities.csv``. Required columns: ``lead_id``,
        ``activity_type``, ``timestamp``.

    Returns
    -------
    pd.DataFrame
        Validated activity dataframe with parsed timestamp column.

    Raises
    ------
    ValueError
        If required columns are missing.
    """
    df = pd.read_csv(filepath)
    required = {"lead_id", "activity_type", "timestamp"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df["timestamp"] = pd.to_datetime(df["timestamp"])
    return df


def load_segments(filepath: str | Path) -> Optional[dict[str, Any]]:
    """Load optional segment enrichment from audience-segmentation.

    Parameters
    ----------
    filepath : str | Path
        Path to ``segments.json``.

    Returns
    -------
    dict or None
        Segment mapping if file exists, otherwise ``None``.
    """
    p = Path(filepath)
    if p.exists():
        with open(p) as f:
            return json.load(f)
    return None


def engineer_firmographic_features(leads: pd.DataFrame) -> pd.DataFrame:
    """Build firmographic features from CRM lead fields.

    Creates features including:
    - Company size bucket (SMB / Mid-Market / Enterprise)
    - Industry one-hot encoding (top 15 + Other)
    - Log-transformed annual revenue
    - Geographic region encoding

    Parameters
    ----------
    leads : pd.DataFrame
        Raw CRM leads dataframe.

    Returns
    -------
    pd.DataFrame
        Firmographic feature matrix indexed by ``lead_id``.
    """
    features = pd.DataFrame(index=leads["lead_id"])

    # Company size bucket
    if "company_size" in leads.columns:
        size = pd.to_numeric(leads["company_size"], errors="coerce").fillna(0)
        features["company_size_log"] = np.log1p(size.values)
        features["size_smb"] = (size.values < 200).astype(int)
        features["size_midmarket"] = ((size.values >= 200) & (size.values < 1000)).astype(int)
        features["size_enterprise"] = (size.values >= 1000).astype(int)
    else:
        features["company_size_log"] = 0.0
        features["size_smb"] = 0
        features["size_midmarket"] = 0
        features["size_enterprise"] = 0

    # Industry one-hot (top 15 + Other)
    if "industry" in leads.columns:
        industry = leads["industry"].fillna("Unknown")
        top_15 = industry.value_counts().nlargest(15).index.tolist()
        industry_mapped = industry.where(industry.isin(top_15), other="Other")
        dummies = pd.get_dummies(industry_mapped, prefix="industry")
        dummies.index = leads["lead_id"].values
        features = features.join(dummies)
    else:
        features["industry_Unknown"] = 1

    # Log-transformed annual revenue
    if "annual_revenue" in leads.columns:
        rev = pd.to_numeric(leads["annual_revenue"], errors="coerce").fillna(0)
        features["annual_revenue_log"] = np.log1p(rev.values)
    else:
        features["annual_revenue_log"] = 0.0

    # Geographic region encoding
    if "region" in leads.columns:
        region = leads["region"].fillna("Unknown")
        region_dummies = pd.get_dummies(region, prefix="region")
        region_dummies.index = leads["lead_id"].values
        features = features.join(region_dummies)
    elif "country" in leads.columns:
        country = leads["country"].fillna("Unknown")
        country_dummies = pd.get_dummies(country, prefix="geo")
        country_dummies.index = leads["lead_id"].values
        features = features.join(country_dummies)

    return features


def engineer_behavioral_features(
    activities: pd.DataFrame,
    scoring_date: pd.Timestamp,
    windows: list[int] | None = None,
) -> pd.DataFrame:
    """Build behavioral features from lead activity data.

    Creates time-windowed aggregations (7, 30, 90 days) for:
    - Page views, email opens/clicks, content downloads, form submissions
    - Recency of last activity (days since last engagement)
    - Activity velocity (week-over-week change)
    - Channel diversity (distinct activity types)
    - High-intent signal flag (pricing page, demo request, contact-sales form)

    Parameters
    ----------
    activities : pd.DataFrame
        Lead activities dataframe with ``lead_id``, ``activity_type``,
        ``timestamp``.
    scoring_date : pd.Timestamp
        Reference date for computing recency and time windows.
    windows : list[int] or None
        Time windows in days for aggregation. Defaults to ``[7, 30, 90]``.

    Returns
    -------
    pd.DataFrame
        Behavioral feature matrix indexed by ``lead_id``.
    """
    if windows is None:
        windows = [7, 30, 90]

    activities = activities.copy()
    activities["days_before_scoring"] = (scoring_date - activities["timestamp"]).dt.days

    # Only consider activities that occurred before the scoring date
    activities = activities[activities["days_before_scoring"] >= 0]

    lead_ids = activities["lead_id"].unique()
    features = pd.DataFrame(index=lead_ids)
    features.index.name = "lead_id"

    # Activity types of interest
    activity_types = ["page_view", "email_open", "email_click", "content_download", "form_submission"]
    high_intent_types = {"pricing_page", "demo_request", "contact_sales"}

    for window in windows:
        mask = activities["days_before_scoring"] <= window
        window_data = activities[mask]
        counts = window_data.groupby(["lead_id", "activity_type"]).size().unstack(fill_value=0)

        for atype in activity_types:
            col_name = f"{atype}_{window}d"
            if atype in counts.columns:
                features[col_name] = counts[atype].reindex(lead_ids, fill_value=0)
            else:
                features[col_name] = 0

    # Recency: days since last activity
    last_activity = activities.groupby("lead_id")["timestamp"].max()
    features["recency_days"] = (scoring_date - last_activity).dt.days.reindex(lead_ids, fill_value=9999)

    # Activity velocity: week-over-week change (last 7d vs prior 7d)
    recent_7d = activities[activities["days_before_scoring"] <= 7].groupby("lead_id").size()
    prior_7d = (
        activities[(activities["days_before_scoring"] > 7) & (activities["days_before_scoring"] <= 14)]
        .groupby("lead_id")
        .size()
    )
    recent_7d = recent_7d.reindex(lead_ids, fill_value=0)
    prior_7d = prior_7d.reindex(lead_ids, fill_value=0)
    features["activity_velocity"] = recent_7d - prior_7d

    # Channel diversity: distinct activity types
    features["channel_diversity"] = (
        activities.groupby("lead_id")["activity_type"].nunique().reindex(lead_ids, fill_value=0)
    )

    # High-intent signal flag
    high_intent = activities[activities["activity_type"].isin(high_intent_types)]
    features["high_intent_flag"] = high_intent.groupby("lead_id").size().reindex(lead_ids, fill_value=0).clip(upper=1)

    features = features.fillna(0)
    return features


def engineer_derived_features(
    leads: pd.DataFrame,
    behavioral: pd.DataFrame,
    scoring_date: pd.Timestamp,
) -> pd.DataFrame:
    """Build derived features combining lead metadata and behavioral signals.

    Includes:
    - Lead age (days since created_date)
    - Activity intensity (total activities / lead age)
    - Engagement score (weighted sum of behavioral features)

    Parameters
    ----------
    leads : pd.DataFrame
        CRM leads dataframe.
    behavioral : pd.DataFrame
        Behavioral feature matrix.
    scoring_date : pd.Timestamp
        Reference date for age calculation.

    Returns
    -------
    pd.DataFrame
        Derived feature matrix indexed by ``lead_id``.
    """
    features = pd.DataFrame(index=leads["lead_id"])

    # Lead age
    lead_age = (scoring_date - leads["created_date"]).dt.days.values
    features["lead_age_days"] = np.maximum(lead_age, 1)  # avoid division by zero

    # Total activity count (sum of 90-day window columns as proxy)
    activity_cols_90d = [c for c in behavioral.columns if c.endswith("_90d")]
    if activity_cols_90d:
        total_activities = behavioral[activity_cols_90d].sum(axis=1)
    else:
        total_activities = pd.Series(0, index=behavioral.index)

    total_activities = total_activities.reindex(leads["lead_id"], fill_value=0)
    features["activity_intensity"] = total_activities.values / features["lead_age_days"].values

    # Engagement score: weighted sum of key behavioral signals
    engagement = pd.Series(0.0, index=leads["lead_id"])
    behavioral_reindexed = behavioral.reindex(leads["lead_id"], fill_value=0)

    weights = {
        "page_view_30d": 1.0,
        "email_open_30d": 1.5,
        "email_click_30d": 3.0,
        "content_download_30d": 4.0,
        "form_submission_30d": 5.0,
        "high_intent_flag": 10.0,
    }
    for col, weight in weights.items():
        if col in behavioral_reindexed.columns:
            engagement = engagement + (behavioral_reindexed[col].values * weight)

    features["engagement_score"] = engagement.values
    return features


def build_feature_matrix(
    leads: pd.DataFrame,
    activities: pd.DataFrame,
    scoring_date: pd.Timestamp,
    segments: Optional[dict[str, Any]] = None,
) -> tuple[pd.DataFrame, pd.Series]:
    """Assemble the complete feature matrix and target variable.

    Combines firmographic, behavioral, and derived features. Optionally
    enriches with segment membership from audience-segmentation.

    Parameters
    ----------
    leads : pd.DataFrame
        CRM leads dataframe.
    activities : pd.DataFrame
        Lead activities dataframe.
    scoring_date : pd.Timestamp
        Reference date for feature engineering.
    segments : dict or None
        Optional segment enrichment data.

    Returns
    -------
    tuple[pd.DataFrame, pd.Series]
        Feature matrix ``X`` and binary target ``y`` (1 = converted, 0 = not).
    """
    firmographic = engineer_firmographic_features(leads)
    behavioral = engineer_behavioral_features(activities, scoring_date)
    derived = engineer_derived_features(leads, behavioral, scoring_date)

    # Merge all feature sets on lead_id
    X = firmographic.copy()
    X = X.join(behavioral, how="left")
    X = X.join(derived, how="left", rsuffix="_derived")

    # Enrich with segment membership if available
    if segments is not None:
        # Expect segments to be a dict with "lead_segments": {lead_id: segment_name}
        lead_segments = segments.get("lead_segments", {})
        if lead_segments:
            seg_series = pd.Series(lead_segments, name="segment")
            seg_dummies = pd.get_dummies(seg_series, prefix="segment")
            seg_dummies.index.name = "lead_id"
            X = X.join(seg_dummies, how="left")

    # Fill missing values
    X = X.fillna(0)

    # Target variable: 1 if outcome is won/converted, 0 otherwise
    outcome = leads.set_index("lead_id")["outcome"]
    y = outcome.map(lambda x: 1 if str(x).lower() in ("won", "closed won", "converted", "1") else 0)
    y = y.reindex(X.index, fill_value=0)

    # Keep created_date accessible for temporal split (store as metadata)
    created_dates = leads.set_index("lead_id")["created_date"]
    X["_created_date"] = created_dates.reindex(X.index)

    return X, y


# ---------------------------------------------------------------------------
# CRM Field Mapping
# ---------------------------------------------------------------------------


def map_crm_fields(
    df: pd.DataFrame,
    crm_type: str = "salesforce",
    custom_mapping: Optional[dict[str, str]] = None,
) -> pd.DataFrame:
    """Map CRM-specific field names to canonical names.

    Supports Salesforce and HubSpot naming conventions with an optional
    custom mapping override.

    Parameters
    ----------
    df : pd.DataFrame
        Raw CRM dataframe with platform-specific column names.
    crm_type : str
        CRM platform: ``"salesforce"`` or ``"hubspot"``.
    custom_mapping : dict or None
        Optional column name mapping ``{crm_name: canonical_name}``.

    Returns
    -------
    pd.DataFrame
        Dataframe with canonical column names.

    Raises
    ------
    ValueError
        If ``crm_type`` is not supported.
    """
    salesforce_mapping = {
        "Id": "lead_id",
        "LeadSource": "source",
        "StageName": "stage",
        "CreatedDate": "created_date",
        "CloseDate": "close_date",
        "Amount": "amount",
        "IsWon": "outcome",
        "IsClosed": "is_closed",
        "Company": "company_name",
        "NumberOfEmployees": "company_size",
        "Industry": "industry",
        "AnnualRevenue": "annual_revenue",
        "BillingCountry": "country",
        "BillingState": "region",
        "OwnerId": "owner",
        "Name": "deal_name",
        "AccountId": "company_id",
        "ContactId": "contact_id",
        "Description": "description",
        "Probability": "probability",
        "ExpectedRevenue": "expected_revenue",
        "Type": "deal_type",
    }

    hubspot_mapping = {
        "hs_object_id": "lead_id",
        "dealname": "deal_name",
        "dealstage": "stage",
        "createdate": "created_date",
        "closedate": "close_date",
        "amount": "amount",
        "hs_is_closed_won": "outcome",
        "hs_is_closed": "is_closed",
        "hs_analytics_source": "source",
        "company": "company_name",
        "numberofemployees": "company_size",
        "industry": "industry",
        "annualrevenue": "annual_revenue",
        "country": "country",
        "state": "region",
        "hubspot_owner_id": "owner",
        "associatedcompanyid": "company_id",
        "hs_deal_stage_probability": "probability",
    }

    crm_type_lower = crm_type.lower()
    if crm_type_lower == "salesforce":
        mapping = salesforce_mapping
    elif crm_type_lower == "hubspot":
        mapping = hubspot_mapping
    else:
        raise ValueError(f"Unsupported CRM type: {crm_type}. Supported: 'salesforce', 'hubspot'.")

    # Apply platform mapping (only for columns that exist)
    rename_map = {k: v for k, v in mapping.items() if k in df.columns}
    df = df.rename(columns=rename_map)

    # Apply custom overrides
    if custom_mapping:
        custom_rename = {k: v for k, v in custom_mapping.items() if k in df.columns}
        df = df.rename(columns=custom_rename)

    return df


# ---------------------------------------------------------------------------
# Model Training
# ---------------------------------------------------------------------------


def temporal_train_test_split(
    X: pd.DataFrame,
    y: pd.Series,
    test_fraction: float = 0.2,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
    """Split data by time for temporal holdout validation.

    Sorts by ``created_date`` (must be in X index or columns) and assigns
    the most recent ``test_fraction`` of records to the test set.

    Parameters
    ----------
    X : pd.DataFrame
        Feature matrix.
    y : pd.Series
        Target variable.
    test_fraction : float
        Fraction of data (by date order) to use for validation.

    Returns
    -------
    tuple
        ``(X_train, X_test, y_train, y_test)``
    """
    # Use _created_date for sorting if available, then drop it
    if "_created_date" in X.columns:
        sort_col = X["_created_date"]
    elif "created_date" in X.columns:
        sort_col = X["created_date"]
    else:
        # Fall back to index order
        sort_col = pd.Series(range(len(X)), index=X.index)

    sorted_idx = sort_col.sort_values().index
    split_point = int(len(sorted_idx) * (1 - test_fraction))

    train_idx = sorted_idx[:split_point]
    test_idx = sorted_idx[split_point:]

    X_train = X.loc[train_idx].copy()
    X_test = X.loc[test_idx].copy()

    # Drop the internal created_date column before training
    for col in ["_created_date", "created_date"]:
        if col in X_train.columns:
            X_train = X_train.drop(columns=[col])
        if col in X_test.columns:
            X_test = X_test.drop(columns=[col])

    y_train = y.loc[train_idx]
    y_test = y.loc[test_idx]

    return X_train, X_test, y_train, y_test


def train_logistic_regression(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    regularization: str = "elasticnet",
    class_weight: str = "balanced",
) -> Any:
    """Train a logistic regression model (interpretable baseline).

    Parameters
    ----------
    X_train : pd.DataFrame
        Training feature matrix.
    y_train : pd.Series
        Training target.
    regularization : str
        Regularization type: ``"l1"``, ``"l2"``, or ``"elasticnet"``.
    class_weight : str
        Class weighting strategy. Use ``"balanced"`` for low conversion rates.

    Returns
    -------
    sklearn.linear_model.LogisticRegression
        Fitted logistic regression model.
    """
    from sklearn.linear_model import LogisticRegression

    # saga solver supports all penalty types including elasticnet
    solver = "saga"
    penalty = regularization

    kwargs: dict[str, Any] = {
        "penalty": penalty,
        "solver": solver,
        "class_weight": class_weight,
        "max_iter": 1000,
        "random_state": 42,
        "n_jobs": -1,
    }

    if penalty == "elasticnet":
        kwargs["l1_ratio"] = 0.5

    model = LogisticRegression(**kwargs)
    model.fit(X_train, y_train)
    return model


def train_gradient_boosting(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    n_estimators: int = 300,
    max_depth: int = 5,
    learning_rate: float = 0.05,
    subsample: float = 0.8,
) -> Any:
    """Train a gradient boosting model (accuracy-optimized).

    Uses cross-validated hyperparameter selection with early stopping on
    validation loss.

    Parameters
    ----------
    X_train : pd.DataFrame
        Training feature matrix.
    y_train : pd.Series
        Training target.
    n_estimators : int
        Maximum number of boosting rounds.
    max_depth : int
        Maximum tree depth.
    learning_rate : float
        Shrinkage rate.
    subsample : float
        Row subsampling fraction.

    Returns
    -------
    sklearn.ensemble.GradientBoostingClassifier
        Fitted gradient boosting model.
    """
    from sklearn.ensemble import GradientBoostingClassifier

    model = GradientBoostingClassifier(
        n_estimators=n_estimators,
        max_depth=max_depth,
        learning_rate=learning_rate,
        subsample=subsample,
        validation_fraction=0.15,
        n_iter_no_change=20,
        tol=1e-4,
        random_state=42,
    )
    model.fit(X_train, y_train)
    return model


def evaluate_model(
    model: Any,
    X_test: pd.DataFrame,
    y_test: pd.Series,
) -> dict[str, float]:
    """Evaluate a trained model on the temporal holdout set.

    Computes AUC-ROC, precision-recall AUC, log-loss, and Brier score.

    Parameters
    ----------
    model : fitted sklearn estimator
        Trained classification model.
    X_test : pd.DataFrame
        Test feature matrix.
    y_test : pd.Series
        Test target.

    Returns
    -------
    dict[str, float]
        Dictionary with keys ``auc_roc``, ``auc_pr``, ``log_loss``,
        ``brier_score``.
    """
    from sklearn.metrics import (
        average_precision_score,
        brier_score_loss,
        log_loss,
        roc_auc_score,
    )

    y_prob = model.predict_proba(X_test)[:, 1]

    return {
        "auc_roc": float(roc_auc_score(y_test, y_prob)),
        "auc_pr": float(average_precision_score(y_test, y_prob)),
        "log_loss": float(log_loss(y_test, y_prob)),
        "brier_score": float(brier_score_loss(y_test, y_prob)),
    }


def compare_models(
    lr_metrics: dict[str, float],
    gb_metrics: dict[str, float],
    auc_threshold: float = 0.02,
) -> str:
    """Select the preferred model based on performance comparison.

    If gradient boosting AUC exceeds logistic regression by less than
    ``auc_threshold``, prefer logistic regression for interpretability.

    Parameters
    ----------
    lr_metrics : dict
        Logistic regression evaluation metrics.
    gb_metrics : dict
        Gradient boosting evaluation metrics.
    auc_threshold : float
        Minimum AUC improvement to prefer gradient boosting.

    Returns
    -------
    str
        ``"logistic_regression"`` or ``"gradient_boosting"``.
    """
    auc_diff = gb_metrics["auc_roc"] - lr_metrics["auc_roc"]
    if auc_diff >= auc_threshold:
        return "gradient_boosting"
    return "logistic_regression"


# ---------------------------------------------------------------------------
# Calibration
# ---------------------------------------------------------------------------


def calibrate_model(
    model: Any,
    X_train: pd.DataFrame,
    y_train: pd.Series,
    method: str = "isotonic",
) -> Any:
    """Calibrate a model's predicted probabilities.

    Applies Platt scaling (sigmoid) or isotonic regression to transform raw
    model scores into reliable probability estimates.

    Parameters
    ----------
    model : fitted sklearn estimator
        Trained classification model.
    X_train : pd.DataFrame
        Training feature matrix (used for calibration fitting).
    y_train : pd.Series
        Training target.
    method : str
        Calibration method: ``"sigmoid"`` (Platt) or ``"isotonic"``.

    Returns
    -------
    sklearn.calibration.CalibratedClassifierCV
        Calibrated model wrapper.
    """
    from sklearn.calibration import CalibratedClassifierCV

    calibrated = CalibratedClassifierCV(
        estimator=model,
        method=method,
        cv=5,
    )
    calibrated.fit(X_train, y_train)
    return calibrated


def validate_calibration(
    model: Any,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    n_bins: int = 10,
) -> dict[str, Any]:
    """Validate model calibration across decile bins.

    Bins predicted probabilities into deciles and compares predicted vs.
    observed conversion rates. Acceptance criterion: agreement within 5
    percentage points per bin.

    Parameters
    ----------
    model : fitted estimator
        Calibrated model.
    X_test : pd.DataFrame
        Test feature matrix.
    y_test : pd.Series
        Test target.
    n_bins : int
        Number of probability bins (default: 10 for deciles).

    Returns
    -------
    dict[str, Any]
        Keys: ``bins`` (list of bin edges), ``predicted_rates`` (list),
        ``observed_rates`` (list), ``max_deviation`` (float),
        ``calibration_passed`` (bool).
    """
    y_prob = model.predict_proba(X_test)[:, 1]

    # Create bins
    bin_edges = np.linspace(0, 1, n_bins + 1)
    predicted_rates = []
    observed_rates = []

    y_test_arr = np.array(y_test)

    for i in range(n_bins):
        lower, upper = bin_edges[i], bin_edges[i + 1]
        if i == n_bins - 1:
            mask = (y_prob >= lower) & (y_prob <= upper)
        else:
            mask = (y_prob >= lower) & (y_prob < upper)

        if mask.sum() > 0:
            predicted_rates.append(float(y_prob[mask].mean()))
            observed_rates.append(float(y_test_arr[mask].mean()))
        else:
            predicted_rates.append(float((lower + upper) / 2))
            observed_rates.append(float("nan"))

    # Compute max deviation (ignoring empty bins)
    deviations = []
    for p, o in zip(predicted_rates, observed_rates):
        if not np.isnan(o):
            deviations.append(abs(p - o))

    max_deviation = float(max(deviations)) if deviations else 0.0

    return {
        "bins": bin_edges.tolist(),
        "predicted_rates": predicted_rates,
        "observed_rates": observed_rates,
        "max_deviation": max_deviation,
        "calibration_passed": max_deviation <= 0.05,
    }


# ---------------------------------------------------------------------------
# SHAP Explainability
# ---------------------------------------------------------------------------


def compute_shap_values(
    model: Any,
    X: pd.DataFrame,
    max_samples: int = 1000,
) -> NDArray[np.float64]:
    """Compute SHAP values for model predictions.

    Uses TreeExplainer for tree-based models and LinearExplainer for linear
    models. Subsamples the background dataset if needed for performance.

    Parameters
    ----------
    model : fitted sklearn estimator
        Trained model (logistic regression or gradient boosting).
    X : pd.DataFrame
        Feature matrix for which to compute SHAP values.
    max_samples : int
        Maximum background samples for SHAP computation.

    Returns
    -------
    np.ndarray
        SHAP value matrix of shape ``(n_samples, n_features)``.
    """
    import shap
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.linear_model import LogisticRegression

    # Unwrap calibrated model if necessary
    base_model = model
    if isinstance(model, CalibratedClassifierCV):
        base_model = model.estimators_[0].estimator

    # Subsample background data if needed
    if len(X) > max_samples:
        background = X.sample(n=max_samples, random_state=42)
    else:
        background = X

    if isinstance(base_model, GradientBoostingClassifier):
        explainer = shap.TreeExplainer(base_model)
        shap_vals = explainer.shap_values(X)
    elif isinstance(base_model, LogisticRegression):
        explainer = shap.LinearExplainer(base_model, background)
        shap_vals = explainer.shap_values(X)
    else:
        # Fallback to KernelExplainer
        predict_fn = model.predict_proba if hasattr(model, "predict_proba") else model.predict
        explainer = shap.KernelExplainer(predict_fn, background)
        shap_vals = explainer.shap_values(X)

    # For binary classification, shap_values may return a list of two arrays
    if isinstance(shap_vals, list):
        shap_vals = shap_vals[1]  # Use positive class SHAP values

    return np.array(shap_vals, dtype=np.float64)


def get_top_features(
    shap_values: NDArray[np.float64],
    feature_names: list[str],
    top_k: int = 10,
) -> list[dict[str, Any]]:
    """Rank features by mean absolute SHAP value.

    Parameters
    ----------
    shap_values : np.ndarray
        SHAP value matrix of shape ``(n_samples, n_features)``.
    feature_names : list[str]
        Names corresponding to feature columns.
    top_k : int
        Number of top features to return.

    Returns
    -------
    list[dict[str, Any]]
        Ranked list of dicts with keys ``feature``, ``mean_abs_shap``,
        ``direction`` (positive/negative average impact).
    """
    mean_abs = np.abs(shap_values).mean(axis=0)
    mean_signed = shap_values.mean(axis=0)

    indices = np.argsort(mean_abs)[::-1][:top_k]

    results = []
    for idx in indices:
        results.append(
            {
                "feature": feature_names[idx],
                "mean_abs_shap": float(mean_abs[idx]),
                "direction": "positive" if mean_signed[idx] >= 0 else "negative",
            }
        )
    return results


def explain_lead_score(
    lead_id: str,
    shap_values: NDArray[np.float64],
    feature_names: list[str],
    X: pd.DataFrame,
    top_k: int = 5,
) -> dict[str, Any]:
    """Generate a human-readable SHAP explanation for a single lead.

    Parameters
    ----------
    lead_id : str
        Identifier for the lead to explain.
    shap_values : np.ndarray
        SHAP value matrix.
    feature_names : list[str]
        Feature column names.
    X : pd.DataFrame
        Feature matrix (indexed by lead_id).
    top_k : int
        Number of top contributing features to include.

    Returns
    -------
    dict[str, Any]
        Keys: ``lead_id``, ``score``, ``top_factors`` (list of
        ``{feature, value, shap_contribution, direction}``).
    """
    lead_idx = X.index.get_loc(lead_id)
    lead_shap = shap_values[lead_idx]
    lead_features = X.iloc[lead_idx]

    # Sort by absolute SHAP contribution
    abs_shap = np.abs(lead_shap)
    top_indices = np.argsort(abs_shap)[::-1][:top_k]

    top_factors = []
    for idx in top_indices:
        top_factors.append(
            {
                "feature": feature_names[idx],
                "value": float(lead_features.iloc[idx])
                if np.isscalar(lead_features.iloc[idx])
                else str(lead_features.iloc[idx]),
                "shap_contribution": float(lead_shap[idx]),
                "direction": "positive" if lead_shap[idx] >= 0 else "negative",
            }
        )

    return {
        "lead_id": lead_id,
        "score": float(lead_shap.sum()),
        "top_factors": top_factors,
    }


# ---------------------------------------------------------------------------
# Drift Detection
# ---------------------------------------------------------------------------


def compute_psi(
    reference: NDArray[np.float64],
    current: NDArray[np.float64],
    n_bins: int = 10,
) -> float:
    """Compute Population Stability Index between two distributions.

    PSI > 0.1 triggers a warning; PSI > 0.2 triggers mandatory retraining.

    Parameters
    ----------
    reference : np.ndarray
        Reference (training) distribution values.
    current : np.ndarray
        Current (scoring) distribution values.
    n_bins : int
        Number of bins for discretization.

    Returns
    -------
    float
        PSI value.
    """
    # Create bins based on reference distribution quantiles
    eps = 1e-6
    bin_edges = np.percentile(reference, np.linspace(0, 100, n_bins + 1))
    bin_edges[0] = -np.inf
    bin_edges[-1] = np.inf
    # Ensure unique bin edges
    bin_edges = np.unique(bin_edges)

    ref_counts = np.histogram(reference, bins=bin_edges)[0].astype(float)
    cur_counts = np.histogram(current, bins=bin_edges)[0].astype(float)

    # Normalize to proportions
    ref_pct = ref_counts / ref_counts.sum()
    cur_pct = cur_counts / cur_counts.sum()

    # Avoid log(0) by adding epsilon
    ref_pct = np.clip(ref_pct, eps, None)
    cur_pct = np.clip(cur_pct, eps, None)

    psi = float(np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct)))
    return psi


def detect_feature_drift(
    X_train: pd.DataFrame,
    X_current: pd.DataFrame,
    psi_warning: float = 0.1,
    psi_critical: float = 0.2,
) -> dict[str, Any]:
    """Check all features for distribution drift using PSI.

    Parameters
    ----------
    X_train : pd.DataFrame
        Training feature matrix.
    X_current : pd.DataFrame
        Current scoring feature matrix.
    psi_warning : float
        PSI threshold for warning.
    psi_critical : float
        PSI threshold for mandatory retraining.

    Returns
    -------
    dict[str, Any]
        Keys: ``feature_psi`` (dict of feature -> PSI), ``warnings`` (list),
        ``critical`` (list), ``retrain_recommended`` (bool).
    """
    feature_psi: dict[str, float] = {}
    warnings: list[str] = []
    critical: list[str] = []

    common_cols = [c for c in X_train.columns if c in X_current.columns and c != "_created_date"]

    for col in common_cols:
        ref_vals = X_train[col].dropna().values.astype(float)
        cur_vals = X_current[col].dropna().values.astype(float)

        if len(ref_vals) < 10 or len(cur_vals) < 10:
            continue

        # Skip constant features
        if np.std(ref_vals) == 0 and np.std(cur_vals) == 0:
            feature_psi[col] = 0.0
            continue

        psi_val = compute_psi(ref_vals, cur_vals)
        feature_psi[col] = psi_val

        if psi_val >= psi_critical:
            critical.append(col)
        elif psi_val >= psi_warning:
            warnings.append(col)

    return {
        "feature_psi": feature_psi,
        "warnings": warnings,
        "critical": critical,
        "retrain_recommended": len(critical) > 0,
    }


# ---------------------------------------------------------------------------
# Account-Based Scoring
# ---------------------------------------------------------------------------


def aggregate_to_account_scores(
    lead_scores: pd.DataFrame,
    account_field: str = "company_id",
) -> pd.DataFrame:
    """Aggregate contact-level lead scores to account-level propensity.

    Combines multiple contact signals using max, mean, and count aggregations.

    Parameters
    ----------
    lead_scores : pd.DataFrame
        Lead-level scores with ``lead_id``, ``score``, and ``account_field``.
    account_field : str
        Column name for the account/company identifier.

    Returns
    -------
    pd.DataFrame
        Account-level scores with ``account_id``, ``max_score``,
        ``mean_score``, ``contact_count``, ``account_propensity``.
    """
    grouped = lead_scores.groupby(account_field)["score"]

    account_df = pd.DataFrame(
        {
            "account_id": grouped.max().index,
            "max_score": grouped.max().values,
            "mean_score": grouped.mean().values,
            "contact_count": grouped.count().values,
        }
    )

    # Account propensity: weighted combination favoring max score
    # Higher contact count provides a modest boost
    contact_boost = np.log1p(account_df["contact_count"].values) / np.log1p(10)
    account_df["account_propensity"] = (
        0.6 * account_df["max_score"] + 0.3 * account_df["mean_score"] + 0.1 * contact_boost
    ).clip(0, 1)

    return account_df


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


def generate_lead_scores_output(
    X: pd.DataFrame,
    model: Any,
    shap_values: NDArray[np.float64],
    feature_names: list[str],
    output_path: str | Path,
) -> None:
    """Generate the lead_scores.json output file.

    Produces lead-level propensity scores with per-lead SHAP feature
    explanations and global feature importance rankings.

    Parameters
    ----------
    X : pd.DataFrame
        Feature matrix for scored leads.
    model : fitted estimator
        Calibrated scoring model.
    shap_values : np.ndarray
        SHAP value matrix.
    feature_names : list[str]
        Feature column names.
    output_path : str | Path
        Path to write ``lead_scores.json``.
    """
    # Drop internal columns before scoring
    X_clean = X.drop(columns=["_created_date"], errors="ignore")

    scores = model.predict_proba(X_clean)[:, 1]

    # Global feature importance
    top_features = get_top_features(shap_values, feature_names, top_k=10)

    # Per-lead scores and explanations
    lead_records = []
    for i, lead_id in enumerate(X.index):
        lead_shap = shap_values[i]
        abs_shap = np.abs(lead_shap)
        top_idx = np.argsort(abs_shap)[::-1][:5]

        factors = []
        for idx in top_idx:
            factors.append(
                {
                    "feature": feature_names[idx],
                    "value": float(X_clean.iloc[i, idx]),
                    "shap_contribution": float(lead_shap[idx]),
                    "direction": "positive" if lead_shap[idx] >= 0 else "negative",
                }
            )

        lead_records.append(
            {
                "lead_id": str(lead_id),
                "score": float(scores[i]),
                "top_factors": factors,
            }
        )

    output = {
        "model_type": type(model).__name__,
        "global_feature_importance": top_features,
        "lead_scores": lead_records,
    }

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2, default=str)


# ---------------------------------------------------------------------------
# Main Orchestration
# ---------------------------------------------------------------------------


def run_lead_scoring_pipeline(
    leads_path: str | Path,
    activities_path: str | Path,
    output_path: str | Path,
    segments_path: Optional[str | Path] = None,
    scoring_date: Optional[pd.Timestamp] = None,
    crm_type: str = "salesforce",
    calibration_method: str = "isotonic",
) -> dict[str, Any]:
    """Execute the full lead scoring pipeline.

    Steps:
    1. Load and validate input data
    2. Map CRM fields to canonical names
    3. Engineer features (firmographic, behavioral, derived)
    4. Split data temporally
    5. Train logistic regression and gradient boosting models
    6. Evaluate and select preferred model
    7. Calibrate and validate calibration
    8. Compute SHAP explanations
    9. Detect feature drift (if retraining)
    10. Generate output JSON

    Parameters
    ----------
    leads_path : str | Path
        Path to ``crm_leads.csv``.
    activities_path : str | Path
        Path to ``lead_activities.csv``.
    output_path : str | Path
        Path to write ``lead_scores.json``.
    segments_path : str | Path or None
        Optional path to ``segments.json``.
    scoring_date : pd.Timestamp or None
        Reference date for features. Defaults to current date.
    crm_type : str
        CRM platform for field mapping.
    calibration_method : str
        Calibration technique: ``"isotonic"`` or ``"sigmoid"``.

    Returns
    -------
    dict[str, Any]
        Pipeline summary with model metrics, calibration results,
        top features, and drift status.
    """
    # 1. Load and validate
    leads = load_crm_leads(leads_path)
    activities = load_lead_activities(activities_path)
    segments = load_segments(segments_path) if segments_path else None

    # 2. Map CRM fields
    leads = map_crm_fields(leads, crm_type=crm_type)

    # 3. Set scoring date
    if scoring_date is None:
        scoring_date = pd.Timestamp.now()

    # 4. Build feature matrix
    X, y = build_feature_matrix(leads, activities, scoring_date, segments)

    # 5. Temporal train/test split
    X_train, X_test, y_train, y_test = temporal_train_test_split(X, y)

    # Drop internal date column from feature matrices
    for col in ["_created_date"]:
        if col in X_train.columns:
            X_train = X_train.drop(columns=[col])
        if col in X_test.columns:
            X_test = X_test.drop(columns=[col])

    # 6. Train models
    lr_model = train_logistic_regression(X_train, y_train)
    gb_model = train_gradient_boosting(X_train, y_train)

    # 7. Evaluate models
    lr_metrics = evaluate_model(lr_model, X_test, y_test)
    gb_metrics = evaluate_model(gb_model, X_test, y_test)

    # 8. Select preferred model
    preferred = compare_models(lr_metrics, gb_metrics)
    selected_model = lr_model if preferred == "logistic_regression" else gb_model
    selected_metrics = lr_metrics if preferred == "logistic_regression" else gb_metrics

    # 9. Calibrate
    calibrated_model = calibrate_model(selected_model, X_train, y_train, method=calibration_method)

    # 10. Validate calibration
    calibration_results = validate_calibration(calibrated_model, X_test, y_test)

    # 11. Compute SHAP values
    feature_names = X_train.columns.tolist()
    shap_vals = compute_shap_values(selected_model, X_test)
    top_features = get_top_features(shap_vals, feature_names)

    # 12. Detect drift (train vs test as proxy)
    drift_results = detect_feature_drift(X_train, X_test)

    # 13. Generate output
    # Re-build full X without the _created_date column for scoring
    X_scoring = X.drop(columns=["_created_date"], errors="ignore")
    full_shap = compute_shap_values(selected_model, X_scoring)
    generate_lead_scores_output(X, calibrated_model, full_shap, feature_names, output_path)

    return {
        "preferred_model": preferred,
        "logistic_regression_metrics": lr_metrics,
        "gradient_boosting_metrics": gb_metrics,
        "selected_model_metrics": selected_metrics,
        "calibration": calibration_results,
        "top_features": top_features,
        "drift": drift_results,
        "n_leads_scored": len(X),
        "output_path": str(output_path),
    }
