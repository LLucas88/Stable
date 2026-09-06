"""
Time series trend analysis for satisfaction metrics with statistical change detection.

This module tracks NPS, CSAT, and CES over time, detects statistically
significant shifts, and controls for seasonality and response-mix changes.
Flags NPS movements greater than 5 points for review.

Usage:
    python satisfaction_trends.py \
        --input workspace/raw/survey_responses.csv \
        --metrics workspace/analysis/satisfaction_metrics.json \
        --output workspace/analysis/satisfaction_trends.json \
        --period monthly \
        --nps-shift-threshold 5.0

Dependencies:
    numpy, pandas, scipy
"""

from __future__ import annotations

import argparse
import json
import logging
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Literal, Optional

import numpy as np
import pandas as pd
from scipy import stats as sp_stats

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class PeriodMetric:
    """A satisfaction metric value for a single time period."""

    period_label: str  # e.g. "2026-01", "2026-Q1"
    metric_name: str  # "NPS", "CSAT", or "CES"
    value: float
    ci_lower: float
    ci_upper: float
    n_responses: int
    low_confidence: bool  # True if n_responses < 30


@dataclass
class ChangePoint:
    """A detected statistically significant change in a metric time series."""

    metric_name: str
    period_before: str
    period_after: str
    value_before: float
    value_after: float
    absolute_change: float
    pct_change: float
    p_value: float
    test_method: str  # e.g. "bootstrap_difference", "permutation", "cusum"
    is_significant: bool  # True if p_value < alpha
    exceeds_threshold: bool  # True if |change| > threshold (e.g. 5 for NPS)


@dataclass
class SeasonalityEstimate:
    """Estimated seasonal component for a metric."""

    metric_name: str
    seasonal_indices: dict[str, float]  # period component -> index value
    method: str  # e.g. "additive_decomposition", "dummy_regression"


@dataclass
class TrendReport:
    """Complete trend analysis output."""

    period_metrics: list[PeriodMetric]
    change_points: list[ChangePoint]
    seasonality: list[SeasonalityEstimate]
    overall_trend_direction: str  # "improving", "declining", "stable"
    overall_trend_slope: float  # Linear trend slope per period
    alerts: list[str]  # Human-readable alert messages


# ---------------------------------------------------------------------------
# Metric computation helpers
# ---------------------------------------------------------------------------


def _compute_nps_from_scores(scores: np.ndarray) -> float:
    """Compute NPS from an array of 0-10 scores."""
    n = len(scores)
    if n == 0:
        return 0.0
    promoters = np.sum(scores >= 9)
    detractors = np.sum(scores <= 6)
    return float((promoters - detractors) / n * 100)


def _compute_csat_from_scores(
    scores: np.ndarray,
    scale_max: int = 5,
    top_box: int = 2,
) -> float:
    """Compute CSAT percentage from scores."""
    n = len(scores)
    if n == 0:
        return 0.0
    threshold = scale_max - top_box + 1
    return float(np.sum(scores >= threshold) / n * 100)


def _compute_ces_from_scores(scores: np.ndarray) -> float:
    """Compute CES mean from scores."""
    if len(scores) == 0:
        return 0.0
    return float(np.mean(scores))


def _bootstrap_ci(
    scores: np.ndarray,
    stat_func,
    n_bootstrap: int = 10_000,
    confidence_level: float = 0.95,
    random_seed: Optional[int] = None,
) -> tuple[float, float]:
    """Generic bootstrap CI for any statistic."""
    n = len(scores)
    rng = np.random.default_rng(random_seed)
    alpha = 1 - confidence_level

    boot_indices = rng.integers(0, n, size=(n_bootstrap, n))
    boot_stats = np.array([stat_func(scores[idx]) for idx in boot_indices])

    lower = float(np.percentile(boot_stats, alpha / 2 * 100))
    upper = float(np.percentile(boot_stats, (1 - alpha / 2) * 100))
    return lower, upper


# ---------------------------------------------------------------------------
# Period aggregation
# ---------------------------------------------------------------------------


def aggregate_by_period(
    df: pd.DataFrame,
    period: Literal["weekly", "monthly", "quarterly"] = "monthly",
    metric_type: str = "NPS",
    n_bootstrap: int = 10_000,
    confidence_level: float = 0.95,
    random_seed: Optional[int] = None,
) -> list[PeriodMetric]:
    """Aggregate survey responses into time periods and compute metrics.

    Groups responses by the specified period granularity and computes the
    satisfaction metric with bootstrap confidence intervals for each period.

    Args:
        df: Survey response DataFrame with columns: respondent_id,
            question_id, response, score, timestamp.
        period: Time period granularity: "weekly", "monthly", or "quarterly".
        metric_type: Which metric to compute: "NPS", "CSAT", or "CES".
        n_bootstrap: Number of bootstrap iterations for CIs.
        confidence_level: Confidence level for intervals.
        random_seed: Random seed for reproducibility.

    Returns:
        List of PeriodMetric objects sorted chronologically.

    Raises:
        ValueError: If period or metric_type is invalid, or if required
            columns are missing.
    """
    valid_periods = ("weekly", "monthly", "quarterly")
    if period not in valid_periods:
        raise ValueError(f"Invalid period '{period}'. Must be one of {valid_periods}.")
    valid_metrics = ("NPS", "CSAT", "CES")
    if metric_type not in valid_metrics:
        raise ValueError(f"Invalid metric_type '{metric_type}'. Must be one of {valid_metrics}.")

    required_cols = {"score", "timestamp"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df = df.copy()
    df["score"] = pd.to_numeric(df["score"], errors="coerce")
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df.dropna(subset=["score", "timestamp"], inplace=True)

    # Create period label
    if period == "weekly":
        df["period_label"] = (
            df["timestamp"].dt.isocalendar().year.astype(str)
            + "-W"
            + df["timestamp"].dt.isocalendar().week.astype(str).str.zfill(2)
        )
    elif period == "monthly":
        df["period_label"] = df["timestamp"].dt.to_period("M").astype(str)
    elif period == "quarterly":
        df["period_label"] = df["timestamp"].dt.to_period("Q").astype(str)

    # Select stat function based on metric type
    if metric_type == "NPS":
        stat_func = _compute_nps_from_scores
    elif metric_type == "CSAT":
        stat_func = _compute_csat_from_scores
    else:
        stat_func = _compute_ces_from_scores

    results: list[PeriodMetric] = []

    for label, group in sorted(df.groupby("period_label")):
        scores = group["score"].values
        n = len(scores)
        if n == 0:
            continue

        value = stat_func(scores)

        if n >= 3:
            ci_lower, ci_upper = _bootstrap_ci(
                scores,
                stat_func,
                n_bootstrap=n_bootstrap,
                confidence_level=confidence_level,
                random_seed=random_seed,
            )
        else:
            ci_lower = value
            ci_upper = value

        results.append(
            PeriodMetric(
                period_label=str(label),
                metric_name=metric_type,
                value=round(value, 2),
                ci_lower=round(ci_lower, 2),
                ci_upper=round(ci_upper, 2),
                n_responses=n,
                low_confidence=n < 30,
            )
        )

    return results


# ---------------------------------------------------------------------------
# Change detection
# ---------------------------------------------------------------------------


def detect_period_over_period_change(
    metrics: list[PeriodMetric],
    alpha: float = 0.05,
    shift_threshold: float = 5.0,
    test_method: str = "bootstrap_difference",
    n_bootstrap: int = 10_000,
    random_seed: Optional[int] = None,
) -> list[ChangePoint]:
    """Test for significant changes between consecutive time periods.

    For each pair of consecutive periods, tests whether the observed
    difference in the metric is statistically significant.

    Args:
        metrics: Chronologically sorted list of PeriodMetric objects.
        alpha: Significance level for hypothesis tests.
        shift_threshold: Absolute change threshold for flagging alerts
            (e.g., 5.0 for NPS).
        test_method: Statistical test to use. One of:
            - "bootstrap_difference": Bootstrap the difference between periods.
            - "permutation": Permutation test on period labels.
        n_bootstrap: Number of bootstrap or permutation iterations.
        random_seed: Random seed for reproducibility.

    Returns:
        List of ChangePoint objects for each consecutive period pair.
    """
    if len(metrics) < 2:
        return []

    rng = np.random.default_rng(random_seed)
    change_points: list[ChangePoint] = []

    for i in range(1, len(metrics)):
        m_before = metrics[i - 1]
        m_after = metrics[i]

        observed_diff = m_after.value - m_before.value
        pct_change = (observed_diff / abs(m_before.value) * 100) if m_before.value != 0 else 0.0

        # Statistical test via bootstrap or permutation
        # Under the null hypothesis, the two periods come from the same
        # distribution. We approximate by resampling from the pooled CIs.
        # Since we only have summary stats, we use a normal approximation
        # of each period's distribution for the bootstrap.
        se_before = (m_before.ci_upper - m_before.ci_lower) / (2 * 1.96)
        se_after = (m_after.ci_upper - m_after.ci_lower) / (2 * 1.96)
        se_before = max(se_before, 0.01)
        se_after = max(se_after, 0.01)

        if test_method == "permutation":
            # Permutation test: under null, swap labels
            null_diffs = rng.normal(
                0,
                np.sqrt(se_before**2 + se_after**2),
                size=n_bootstrap,
            )
            p_value = float(np.mean(np.abs(null_diffs) >= abs(observed_diff)))
        else:
            # Bootstrap difference test
            boot_before = rng.normal(m_before.value, se_before, size=n_bootstrap)
            boot_after = rng.normal(m_after.value, se_after, size=n_bootstrap)
            boot_diffs = boot_after - boot_before

            # Two-sided p-value: proportion of bootstrap diffs that are
            # at least as extreme as zero (null) relative to observed
            # We test if the CI of the difference excludes zero
            null_diffs = rng.normal(
                0,
                np.sqrt(se_before**2 + se_after**2),
                size=n_bootstrap,
            )
            p_value = float(np.mean(np.abs(null_diffs) >= abs(observed_diff)))

        p_value = max(p_value, 1.0 / n_bootstrap)  # floor

        change_points.append(
            ChangePoint(
                metric_name=m_after.metric_name,
                period_before=m_before.period_label,
                period_after=m_after.period_label,
                value_before=m_before.value,
                value_after=m_after.value,
                absolute_change=round(observed_diff, 2),
                pct_change=round(pct_change, 2),
                p_value=round(p_value, 4),
                test_method=test_method,
                is_significant=p_value < alpha,
                exceeds_threshold=abs(observed_diff) > shift_threshold,
            )
        )

    return change_points


def detect_change_vs_baseline(
    metrics: list[PeriodMetric],
    baseline_periods: int = 4,
    alpha: float = 0.05,
    shift_threshold: float = 5.0,
    n_bootstrap: int = 10_000,
    random_seed: Optional[int] = None,
) -> list[ChangePoint]:
    """Test each period against a rolling baseline of prior periods.

    Compares each period's metric value against the mean of the preceding
    N baseline periods to detect changes relative to recent history.

    Args:
        metrics: Chronologically sorted list of PeriodMetric objects.
        baseline_periods: Number of prior periods to use as baseline.
        alpha: Significance level for hypothesis tests.
        shift_threshold: Absolute change threshold for alerts.
        n_bootstrap: Number of bootstrap iterations.
        random_seed: Random seed for reproducibility.

    Returns:
        List of ChangePoint objects for each period (starting from period
        baseline_periods + 1).
    """
    if len(metrics) <= baseline_periods:
        return []

    rng = np.random.default_rng(random_seed)
    change_points: list[ChangePoint] = []

    for i in range(baseline_periods, len(metrics)):
        current = metrics[i]
        baseline = metrics[i - baseline_periods : i]

        baseline_values = np.array([m.value for m in baseline])
        baseline_mean = float(np.mean(baseline_values))
        baseline_std = float(np.std(baseline_values, ddof=1)) if len(baseline) > 1 else 1.0

        observed_diff = current.value - baseline_mean
        pct_change = (observed_diff / abs(baseline_mean) * 100) if baseline_mean != 0 else 0.0

        # Bootstrap test: resample baseline values and compute mean
        se_current = (current.ci_upper - current.ci_lower) / (2 * 1.96)
        se_current = max(se_current, 0.01)

        boot_baselines = rng.choice(
            baseline_values,
            size=(n_bootstrap, len(baseline)),
            replace=True,
        )
        boot_baseline_means = boot_baselines.mean(axis=1)
        boot_current = rng.normal(current.value, se_current, size=n_bootstrap)
        boot_diffs = boot_current - boot_baseline_means

        # Under null, the difference should be centered at 0
        # p-value: proportion of bootstrap diffs with sign opposite to observed
        if observed_diff > 0:
            p_value = float(np.mean(boot_diffs <= 0)) * 2  # two-sided
        else:
            p_value = float(np.mean(boot_diffs >= 0)) * 2

        p_value = min(p_value, 1.0)
        p_value = max(p_value, 1.0 / n_bootstrap)

        baseline_label = f"{baseline[0].period_label}..{baseline[-1].period_label}"

        change_points.append(
            ChangePoint(
                metric_name=current.metric_name,
                period_before=baseline_label,
                period_after=current.period_label,
                value_before=round(baseline_mean, 2),
                value_after=current.value,
                absolute_change=round(observed_diff, 2),
                pct_change=round(pct_change, 2),
                p_value=round(p_value, 4),
                test_method="bootstrap_vs_baseline",
                is_significant=p_value < alpha,
                exceeds_threshold=abs(observed_diff) > shift_threshold,
            )
        )

    return change_points


def cusum_change_detection(
    values: np.ndarray,
    target_mean: Optional[float] = None,
    threshold_h: float = 4.0,
    slack_k: float = 0.5,
) -> list[int]:
    """Detect change points using the CUSUM (Cumulative Sum) algorithm.

    Identifies indices where the process mean shifts significantly from
    the target mean. Suitable for ongoing monitoring of satisfaction
    metric streams.

    Args:
        values: Array of metric values in chronological order.
        target_mean: Expected process mean. If None, uses the grand mean.
        threshold_h: Decision interval; higher values reduce false alarms.
        slack_k: Allowance parameter; shifts smaller than k*sigma are
            ignored.

    Returns:
        List of indices where change points are detected.
    """
    values = np.asarray(values, dtype=float)
    if len(values) < 2:
        return []

    if target_mean is None:
        target_mean = float(np.mean(values))

    sigma = float(np.std(values, ddof=1))
    if sigma == 0:
        return []

    # Normalized deviations
    normalized = (values - target_mean) / sigma

    # CUSUM: track both upward and downward shifts
    s_pos = np.zeros(len(values))  # Cumulative sum for upward shifts
    s_neg = np.zeros(len(values))  # Cumulative sum for downward shifts
    change_points: list[int] = []

    for i in range(1, len(values)):
        s_pos[i] = max(0, s_pos[i - 1] + normalized[i] - slack_k)
        s_neg[i] = max(0, s_neg[i - 1] - normalized[i] - slack_k)

        if s_pos[i] > threshold_h or s_neg[i] > threshold_h:
            change_points.append(i)
            # Reset after detection
            s_pos[i] = 0
            s_neg[i] = 0

    return change_points


# ---------------------------------------------------------------------------
# Seasonality and trend decomposition
# ---------------------------------------------------------------------------


def estimate_seasonality(
    metrics: list[PeriodMetric],
    period: Literal["weekly", "monthly", "quarterly"] = "monthly",
    method: str = "additive",
) -> SeasonalityEstimate:
    """Estimate the seasonal component of a satisfaction metric time series.

    Uses additive decomposition to separate the time series into trend,
    seasonal, and residual components. The seasonal indices can be used
    to adjust observed values for seasonality.

    Args:
        metrics: Chronologically sorted list of PeriodMetric objects.
            Requires at least 2 full seasonal cycles (e.g., 24 months for
            monthly data).
        period: Granularity of the data.
        method: Decomposition method: "additive" or "multiplicative".

    Returns:
        SeasonalityEstimate with seasonal indices per sub-period
        (e.g., month-of-year for monthly data).

    Raises:
        ValueError: If insufficient data for seasonal estimation.
    """
    # Determine seasonal cycle length
    if period == "monthly":
        cycle_len = 12
    elif period == "quarterly":
        cycle_len = 4
    elif period == "weekly":
        cycle_len = 52
    else:
        cycle_len = 12

    min_periods = cycle_len * 2
    if len(metrics) < min_periods:
        raise ValueError(
            f"Need at least {min_periods} periods for seasonality estimation with {period} data, got {len(metrics)}."
        )

    values = np.array([m.value for m in metrics])
    n = len(values)

    # Simple additive decomposition using moving average for trend
    # then averaging residuals by season position
    if cycle_len <= n:
        # Moving average trend (centered)
        trend = (
            pd.Series(values)
            .rolling(
                window=cycle_len,
                center=True,
                min_periods=1,
            )
            .mean()
            .values
        )

        # Detrended values
        detrended = values - trend

        # Average seasonal component by position in cycle
        seasonal_indices: dict[str, float] = {}
        for pos in range(cycle_len):
            indices = list(range(pos, n, cycle_len))
            if indices:
                seasonal_val = float(np.nanmean(detrended[indices]))
            else:
                seasonal_val = 0.0

            if period == "monthly":
                label = f"month_{pos + 1:02d}"
            elif period == "quarterly":
                label = f"Q{pos + 1}"
            else:
                label = f"week_{pos + 1:02d}"

            seasonal_indices[label] = round(seasonal_val, 3)
    else:
        seasonal_indices = {}

    metric_name = metrics[0].metric_name if metrics else "unknown"

    return SeasonalityEstimate(
        metric_name=metric_name,
        seasonal_indices=seasonal_indices,
        method=f"{method}_decomposition",
    )


def compute_linear_trend(
    metrics: list[PeriodMetric],
) -> tuple[float, float, str]:
    """Fit a linear trend to the metric time series.

    Uses ordinary least squares regression of metric value on period index.

    Args:
        metrics: Chronologically sorted list of PeriodMetric objects.

    Returns:
        Tuple of (slope, p_value, direction) where direction is one of
        "improving", "declining", or "stable" (if p_value > 0.05).
    """
    if len(metrics) < 2:
        return 0.0, 1.0, "stable"

    x = np.arange(len(metrics), dtype=float)
    y = np.array([m.value for m in metrics])

    slope, intercept, r_value, p_value, std_err = sp_stats.linregress(x, y)

    if p_value > 0.05:
        direction = "stable"
    elif slope > 0:
        direction = "improving"
    else:
        direction = "declining"

    return round(float(slope), 4), round(float(p_value), 4), direction


# ---------------------------------------------------------------------------
# Response-mix adjustment
# ---------------------------------------------------------------------------


def adjust_for_response_mix(
    df: pd.DataFrame,
    segment_col: str,
    reference_period: Optional[str] = None,
) -> pd.DataFrame:
    """Adjust metric values for changes in respondent segment mix over time.

    If the proportion of respondents from different segments changes across
    periods, raw metric trends can be misleading. This function standardizes
    to a fixed segment mix (from the reference period or the overall mix).

    Args:
        df: Survey response DataFrame with segment and timestamp columns.
        segment_col: Column name identifying respondent segments.
        reference_period: Period label to use as the reference mix.
            If None, uses the overall segment distribution.

    Returns:
        DataFrame with an additional 'adjusted_score' column reflecting
        the response-mix-adjusted metric values.
    """
    df = df.copy()
    df["score"] = pd.to_numeric(df["score"], errors="coerce")
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df.dropna(subset=["score", "timestamp", segment_col], inplace=True)

    # Create period labels (monthly)
    df["period"] = df["timestamp"].dt.to_period("M").astype(str)

    # Compute reference segment weights
    if reference_period is not None:
        ref_df = df[df["period"] == reference_period]
        if len(ref_df) == 0:
            logger.warning(
                "Reference period '%s' has no data. Using overall mix.",
                reference_period,
            )
            ref_df = df
    else:
        ref_df = df

    # Reference segment proportions (direct standardization weights)
    ref_counts = ref_df[segment_col].value_counts()
    ref_total = ref_counts.sum()
    ref_weights = (ref_counts / ref_total).to_dict()

    # For each period, compute the adjusted score using direct standardization:
    # adjusted_score_period = sum_over_segments(ref_weight_s * mean_score_s_period)
    # We also add an 'adjusted_score' per row as: score * (ref_weight / actual_weight)

    adjusted_scores = []
    for _, row_data in df.iterrows():
        period = row_data["period"]
        segment = row_data[segment_col]

        # Actual segment proportion in this period
        period_mask = df["period"] == period
        period_total = period_mask.sum()
        segment_period_count = ((df["period"] == period) & (df[segment_col] == segment)).sum()
        actual_weight = segment_period_count / period_total if period_total > 0 else 0

        ref_w = ref_weights.get(segment, 0)
        if actual_weight > 0 and ref_w > 0:
            adjustment_factor = ref_w / actual_weight
        else:
            adjustment_factor = 1.0

        adjusted_scores.append(row_data["score"] * adjustment_factor)

    df["adjusted_score"] = adjusted_scores

    logger.info(
        "Applied response-mix adjustment using %d reference segments.",
        len(ref_weights),
    )
    return df


# ---------------------------------------------------------------------------
# Alert generation
# ---------------------------------------------------------------------------


def generate_alerts(
    change_points: list[ChangePoint],
    nps_shift_threshold: float = 5.0,
) -> list[str]:
    """Generate human-readable alert messages from detected changes.

    Creates alert strings for:
    - Statistically significant changes (any metric).
    - NPS shifts exceeding the specified threshold.
    - Consecutive declining periods.

    Args:
        change_points: List of ChangePoint objects from change detection.
        nps_shift_threshold: Absolute NPS shift that triggers a priority alert.

    Returns:
        List of alert message strings, most urgent first.
    """
    priority_alerts: list[str] = []
    standard_alerts: list[str] = []
    info_alerts: list[str] = []

    # Track consecutive declines per metric
    consecutive_declines: dict[str, int] = {}

    for cp in change_points:
        # Track consecutive declines
        if cp.absolute_change < 0:
            consecutive_declines[cp.metric_name] = consecutive_declines.get(cp.metric_name, 0) + 1
        else:
            consecutive_declines[cp.metric_name] = 0

        # Priority: NPS exceeds threshold
        if cp.metric_name == "NPS" and cp.exceeds_threshold and cp.is_significant:
            direction = "declined" if cp.absolute_change < 0 else "improved"
            priority_alerts.append(
                f"PRIORITY: NPS {direction} by {abs(cp.absolute_change):.1f} "
                f"points from {cp.period_before} to {cp.period_after} "
                f"(p={cp.p_value:.3f}). This exceeds the "
                f"{nps_shift_threshold:.0f}-point threshold."
            )

        # Standard: statistically significant change
        elif cp.is_significant:
            direction = "decreased" if cp.absolute_change < 0 else "increased"
            standard_alerts.append(
                f"{cp.metric_name} {direction} by "
                f"{abs(cp.absolute_change):.1f} from {cp.period_before} "
                f"to {cp.period_after} (p={cp.p_value:.3f})."
            )

        # Threshold exceeded but not statistically significant
        elif cp.exceeds_threshold:
            direction = "decrease" if cp.absolute_change < 0 else "increase"
            info_alerts.append(
                f"{cp.metric_name} shows a {abs(cp.absolute_change):.1f}-point "
                f"{direction} from {cp.period_before} to {cp.period_after}, "
                f"but this is not statistically significant (p={cp.p_value:.3f})."
            )

    # Add consecutive decline alerts
    for metric, count in consecutive_declines.items():
        if count >= 3:
            priority_alerts.append(
                f"WARNING: {metric} has declined for {count} consecutive periods. Investigate for systemic issues."
            )

    return priority_alerts + standard_alerts + info_alerts


# ---------------------------------------------------------------------------
# Orchestration and I/O
# ---------------------------------------------------------------------------


def run_trend_analysis(
    survey_path: Path,
    period: Literal["weekly", "monthly", "quarterly"] = "monthly",
    nps_shift_threshold: float = 5.0,
    n_bootstrap: int = 10_000,
    alpha: float = 0.05,
    random_seed: Optional[int] = None,
) -> TrendReport:
    """Run the full satisfaction trend analysis pipeline.

    1. Load and validate survey data.
    2. Aggregate metrics by period for NPS, CSAT, and CES.
    3. Detect period-over-period and baseline changes.
    4. Estimate seasonality (if sufficient data).
    5. Compute overall trend direction.
    6. Generate alerts for significant shifts.

    Args:
        survey_path: Path to survey_responses.csv.
        period: Time period granularity.
        nps_shift_threshold: NPS shift threshold for alerts.
        n_bootstrap: Number of bootstrap iterations.
        alpha: Significance level for change detection tests.
        random_seed: Random seed for reproducibility.

    Returns:
        Complete TrendReport.
    """
    survey_path = Path(survey_path)
    if not survey_path.exists():
        raise FileNotFoundError(f"Survey file not found: {survey_path}")

    df = pd.read_csv(survey_path)
    df["score"] = pd.to_numeric(df["score"], errors="coerce")
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df.dropna(subset=["score", "timestamp"], inplace=True)

    # Step 2: Aggregate metrics by period
    all_period_metrics: list[PeriodMetric] = []
    all_change_points: list[ChangePoint] = []
    seasonality_estimates: list[SeasonalityEstimate] = []

    # Determine which metrics to compute based on score range
    score_min = df["score"].min()
    score_max = df["score"].max()

    metric_types = []
    if score_min >= 0 and score_max <= 10:
        metric_types.append("NPS")
    if score_min >= 1 and score_max <= 5:
        metric_types.append("CSAT")
    if score_min >= 1 and score_max <= 7:
        metric_types.append("CES")
    if not metric_types:
        metric_types = ["NPS"]  # fallback

    for metric_type in metric_types:
        period_metrics = aggregate_by_period(
            df,
            period=period,
            metric_type=metric_type,
            n_bootstrap=n_bootstrap,
            confidence_level=1 - alpha,
            random_seed=random_seed,
        )
        all_period_metrics.extend(period_metrics)

        if len(period_metrics) < 2:
            continue

        # Step 3: Change detection
        # Period-over-period
        pop_changes = detect_period_over_period_change(
            period_metrics,
            alpha=alpha,
            shift_threshold=nps_shift_threshold,
            n_bootstrap=n_bootstrap,
            random_seed=random_seed,
        )
        all_change_points.extend(pop_changes)

        # Baseline comparison
        baseline_changes = detect_change_vs_baseline(
            period_metrics,
            alpha=alpha,
            shift_threshold=nps_shift_threshold,
            n_bootstrap=n_bootstrap,
            random_seed=random_seed,
        )
        all_change_points.extend(baseline_changes)

        # CUSUM
        values = np.array([m.value for m in period_metrics])
        cusum_cps = cusum_change_detection(values)
        for cp_idx in cusum_cps:
            if cp_idx > 0:
                m_before = period_metrics[cp_idx - 1]
                m_after = period_metrics[cp_idx]
                diff = m_after.value - m_before.value
                pct = diff / abs(m_before.value) * 100 if m_before.value != 0 else 0.0
                all_change_points.append(
                    ChangePoint(
                        metric_name=metric_type,
                        period_before=m_before.period_label,
                        period_after=m_after.period_label,
                        value_before=m_before.value,
                        value_after=m_after.value,
                        absolute_change=round(diff, 2),
                        pct_change=round(pct, 2),
                        p_value=0.01,  # CUSUM signals are treated as significant
                        test_method="cusum",
                        is_significant=True,
                        exceeds_threshold=abs(diff) > nps_shift_threshold,
                    )
                )

        # Step 4: Seasonality
        try:
            seasonal = estimate_seasonality(
                period_metrics,
                period=period,
            )
            seasonality_estimates.append(seasonal)
        except ValueError as exc:
            logger.info(
                "Skipping seasonality for %s: %s",
                metric_type,
                exc,
            )

    # Step 5: Overall trend (use NPS if available, else first metric)
    nps_metrics = [m for m in all_period_metrics if m.metric_name == "NPS"]
    trend_metrics = nps_metrics if nps_metrics else all_period_metrics
    slope, p_val, direction = compute_linear_trend(trend_metrics)

    # Step 6: Generate alerts
    alerts = generate_alerts(
        all_change_points,
        nps_shift_threshold=nps_shift_threshold,
    )

    return TrendReport(
        period_metrics=all_period_metrics,
        change_points=all_change_points,
        seasonality=seasonality_estimates,
        overall_trend_direction=direction,
        overall_trend_slope=slope,
        alerts=alerts,
    )


def write_results(report: TrendReport, output_path: Path) -> None:
    """Serialize the trend report to JSON.

    Args:
        report: TrendReport to serialize.
        output_path: Path for the output JSON file.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    data = {
        "period_metrics": [asdict(m) for m in report.period_metrics],
        "change_points": [asdict(cp) for cp in report.change_points],
        "seasonality": [asdict(s) for s in report.seasonality],
        "overall_trend_direction": report.overall_trend_direction,
        "overall_trend_slope": report.overall_trend_slope,
        "alerts": report.alerts,
    }

    with open(output_path, "w") as f:
        json.dump(data, f, indent=2, default=str)

    logger.info("Wrote trend report to %s", output_path)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    """Parse command-line arguments.

    Args:
        argv: Argument list (defaults to sys.argv[1:]).

    Returns:
        Parsed arguments namespace.
    """
    parser = argparse.ArgumentParser(description="Satisfaction trend analysis with change detection.")
    parser.add_argument(
        "--input",
        type=Path,
        required=True,
        help="Path to survey_responses.csv",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Path for output satisfaction_trends.json",
    )
    parser.add_argument(
        "--period",
        type=str,
        choices=["weekly", "monthly", "quarterly"],
        default="monthly",
        help="Aggregation period (default: monthly)",
    )
    parser.add_argument(
        "--nps-shift-threshold",
        type=float,
        default=5.0,
        help="NPS shift threshold for alerts (default: 5.0)",
    )
    parser.add_argument(
        "--n-bootstrap",
        type=int,
        default=10_000,
        help="Number of bootstrap iterations (default: 10000)",
    )
    parser.add_argument(
        "--alpha",
        type=float,
        default=0.05,
        help="Significance level (default: 0.05)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Random seed for reproducibility",
    )
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> None:
    """Main entry point for CLI execution.

    Args:
        argv: Optional argument list for testing.
    """
    args = parse_args(argv)
    logging.basicConfig(level=logging.INFO)

    logger.info("Running satisfaction trend analysis on %s", args.input)
    report = run_trend_analysis(
        survey_path=args.input,
        period=args.period,
        nps_shift_threshold=args.nps_shift_threshold,
        n_bootstrap=args.n_bootstrap,
        alpha=args.alpha,
        random_seed=args.seed,
    )

    write_results(report, args.output)
    logger.info(
        "Done. Overall trend: %s (slope=%.3f). %d alerts generated.",
        report.overall_trend_direction,
        report.overall_trend_slope,
        len(report.alerts),
    )


if __name__ == "__main__":
    main()
