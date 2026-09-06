"""Anomaly detection for paid media metrics."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

try:
    import pandas as pd
except ModuleNotFoundError:  # pragma: no cover
    pd = None  # type: ignore[assignment]


DEFAULT_ZSCORE_WINDOW = 28
DEFAULT_ZSCORE_THRESHOLD = 2.5
DEFAULT_MIN_OBSERVATIONS = 14
DEFAULT_ISO_N_ESTIMATORS = 100
DEFAULT_ISO_CONTAMINATION = 0.05
DEFAULT_ISO_MAX_SAMPLES = 256
DEFAULT_STL_PERIOD = 7
DEFAULT_STL_SEASONAL_WINDOW = 13
DEFAULT_STL_TREND_WINDOW = 21
DEFAULT_STL_IQR_MULTIPLIER = 3.0
METRICS_TO_MONITOR = ["spend", "cpa", "ctr", "conversion_rate"]


@dataclass
class AnomalyAlert:
    date: str
    platform: str
    campaign_id: str
    metric: str
    observed_value: float
    expected_value: float
    z_score: Optional[float] = None
    isolation_score: Optional[float] = None
    stl_residual: Optional[float] = None
    severity: str = "medium"
    root_cause: str = ""


def _require_pandas():
    if pd is None:
        raise ImportError("pandas is required for anomaly detection")
    return pd


def compute_dow_adjustment(
    series: "pd.Series",
    dates: "pd.Series",
) -> "pd.Series":
    pandas = _require_pandas()
    frame = pandas.DataFrame({"value": series.astype(float), "date": pandas.to_datetime(dates)})
    overall_mean = frame["value"].mean() or 1.0
    dow_means = frame.groupby(frame["date"].dt.dayofweek)["value"].mean().replace(0, 1.0)
    factors = frame["date"].dt.dayofweek.map(dow_means / overall_mean).replace(0, 1.0)
    return frame["value"] / factors


def rolling_zscore(
    series: "pd.Series",
    window: int = DEFAULT_ZSCORE_WINDOW,
    threshold: float = DEFAULT_ZSCORE_THRESHOLD,
    min_observations: int = DEFAULT_MIN_OBSERVATIONS,
) -> "pd.DataFrame":
    pandas = _require_pandas()
    shifted = series.shift(1)
    rolling_mean = shifted.rolling(window=window, min_periods=min_observations).mean()
    rolling_std = shifted.rolling(window=window, min_periods=min_observations).std().replace(0, pd.NA)
    z_score = (series - rolling_mean) / rolling_std
    return pandas.DataFrame(
        {
            "value": series,
            "rolling_mean": rolling_mean,
            "rolling_std": rolling_std,
            "z_score": z_score,
            "is_anomaly": z_score.abs() >= threshold,
        }
    )


def prepare_isolation_features(
    df: "pd.DataFrame",
    metrics: list[str] | None = None,
) -> "pd.DataFrame":
    pandas = _require_pandas()
    metrics = metrics or METRICS_TO_MONITOR
    features = pandas.DataFrame(index=df.index)
    for metric in metrics:
        if metric not in df.columns:
            continue
        values = df[metric].astype(float).fillna(0.0)
        features[f"{metric}_value"] = values
        features[f"{metric}_delta"] = values.diff().fillna(0.0)
        rolling_mean = values.rolling(7, min_periods=1).mean().replace(0, pd.NA)
        features[f"{metric}_ratio_7d"] = (values / rolling_mean).fillna(1.0)
    standardized = (features - features.mean()) / features.std(ddof=0).replace(0, 1.0)
    return standardized.fillna(0.0)


def run_isolation_forest(
    features: "pd.DataFrame",
    n_estimators: int = DEFAULT_ISO_N_ESTIMATORS,
    contamination: float = DEFAULT_ISO_CONTAMINATION,
    max_samples: int = DEFAULT_ISO_MAX_SAMPLES,
) -> "pd.Series":
    del n_estimators, max_samples
    try:  # pragma: no cover - optional dependency path
        from sklearn.ensemble import IsolationForest

        model = IsolationForest(contamination=contamination, random_state=42)
        model.fit(features)
        return pd.Series(model.decision_function(features), index=features.index)
    except Exception:
        distance = (features.pow(2).sum(axis=1)).pow(0.5)
        normalized = (distance - distance.mean()) / (distance.std(ddof=0) or 1.0)
        return -normalized


def stl_decompose(
    series: "pd.Series",
    period: int = DEFAULT_STL_PERIOD,
    seasonal_window: int = DEFAULT_STL_SEASONAL_WINDOW,
    trend_window: int = DEFAULT_STL_TREND_WINDOW,
    iqr_multiplier: float = DEFAULT_STL_IQR_MULTIPLIER,
) -> "pd.DataFrame":
    del seasonal_window, trend_window
    pandas = _require_pandas()
    try:  # pragma: no cover - optional dependency path
        from statsmodels.tsa.seasonal import STL

        result = STL(series.astype(float), period=period, robust=True).fit()
        residual = result.resid
        trend = result.trend
        seasonal = result.seasonal
    except Exception:
        trend = series.astype(float).rolling(period, min_periods=1, center=True).median()
        seasonal = series.astype(float) - trend
        residual = series.astype(float) - trend - seasonal.rolling(period, min_periods=1).mean()
    q1 = residual.quantile(0.25)
    q3 = residual.quantile(0.75)
    iqr = q3 - q1
    threshold = iqr_multiplier * iqr if iqr else iqr_multiplier
    return pandas.DataFrame(
        {
            "trend": trend,
            "seasonal": seasonal,
            "residual": residual,
            "residual_iqr": threshold,
            "is_anomaly": residual.abs() > threshold,
        }
    )


def combine_anomaly_signals(
    zscore_flags: "pd.Series",
    iso_flags: "pd.Series",
    stl_flags: "pd.Series",
) -> "pd.Series":
    pandas = _require_pandas()
    severities = []
    for z_flag, iso_flag, stl_flag in zip(zscore_flags.fillna(False), iso_flags.fillna(False), stl_flags.fillna(False)):
        matches = sum([bool(z_flag), bool(iso_flag), bool(stl_flag)])
        if matches == 3:
            severities.append("critical")
        elif matches == 2:
            severities.append("high")
        elif z_flag:
            severities.append("medium")
        elif iso_flag or stl_flag:
            severities.append("low")
        else:
            severities.append("none")
    return pandas.Series(severities, index=zscore_flags.index)


def drill_down_root_cause(
    df: "pd.DataFrame",
    anomaly_date: str,
    metric: str,
    platform: str,
) -> str:
    pandas = _require_pandas()
    subset = df[
        (pandas.to_datetime(df["date"]).dt.strftime("%Y-%m-%d") == anomaly_date) & (df["platform"] == platform)
    ].copy()
    if subset.empty or metric not in subset.columns:
        return "No lower-level driver identified."
    grouping_columns = [column for column in ("campaign_id", "ad_group_id", "keyword") if column in subset.columns]
    if not grouping_columns:
        return "No lower-level entities available for drill-down."
    best_column = grouping_columns[-1]
    grouped = subset.groupby(best_column)[metric].sum().astype(float).sort_values(ascending=False)
    entity = grouped.index[0]
    contribution = grouped.iloc[0]
    return f"{best_column} '{entity}' contributed the largest {metric} movement ({contribution:.2f})."


def detect_anomalies(
    df: "pd.DataFrame",
    metrics: list[str] | None = None,
    known_events: list[str] | None = None,
    zscore_threshold: float = DEFAULT_ZSCORE_THRESHOLD,
    iso_contamination: float = DEFAULT_ISO_CONTAMINATION,
    stl_iqr_multiplier: float = DEFAULT_STL_IQR_MULTIPLIER,
) -> list[AnomalyAlert]:
    pandas = _require_pandas()
    metrics = metrics or METRICS_TO_MONITOR
    known_events = set(known_events or [])
    alerts: list[AnomalyAlert] = []
    working = df.copy()
    working["date"] = pandas.to_datetime(working["date"])

    if "conversion_rate" not in working.columns and {"conversions", "clicks"}.issubset(working.columns):
        working["conversion_rate"] = working["conversions"].astype(float) / working["clicks"].replace(0, pd.NA).astype(
            float
        )
        working["conversion_rate"] = working["conversion_rate"].fillna(0.0)

    for (platform, campaign_id), group in working.groupby(["platform", "campaign_id"]):
        ordered = group.sort_values("date").reset_index(drop=True)
        for metric in metrics:
            if metric not in ordered.columns:
                continue
            adjusted = compute_dow_adjustment(ordered[metric].astype(float).fillna(0.0), ordered["date"])
            zscore = rolling_zscore(adjusted, threshold=zscore_threshold)
            features = prepare_isolation_features(ordered[[metric]].rename(columns={metric: metric}))
            iso_scores = run_isolation_forest(features, contamination=iso_contamination)
            stl = stl_decompose(adjusted, iqr_multiplier=stl_iqr_multiplier)
            severity = combine_anomaly_signals(
                zscore["is_anomaly"],
                iso_scores < -0.3,
                stl["is_anomaly"],
            )
            for index, level in severity.items():
                date_str = ordered.loc[index, "date"].strftime("%Y-%m-%d")
                if level == "none" or date_str in known_events:
                    continue
                alerts.append(
                    AnomalyAlert(
                        date=date_str,
                        platform=str(platform),
                        campaign_id=str(campaign_id),
                        metric=metric,
                        observed_value=float(ordered.loc[index, metric]),
                        expected_value=float(zscore.loc[index, "rolling_mean"])
                        if pd.notna(zscore.loc[index, "rolling_mean"])
                        else float(ordered.loc[index, metric]),
                        z_score=float(zscore.loc[index, "z_score"]) if pd.notna(zscore.loc[index, "z_score"]) else None,
                        isolation_score=float(iso_scores.loc[index]),
                        stl_residual=float(stl.loc[index, "residual"])
                        if pd.notna(stl.loc[index, "residual"])
                        else None,
                        severity=level,
                        root_cause=drill_down_root_cause(working, date_str, metric, str(platform)),
                    )
                )
    severity_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    return sorted(
        alerts, key=lambda alert: (severity_rank.get(alert.severity, 9), alert.date, alert.platform, alert.campaign_id)
    )
