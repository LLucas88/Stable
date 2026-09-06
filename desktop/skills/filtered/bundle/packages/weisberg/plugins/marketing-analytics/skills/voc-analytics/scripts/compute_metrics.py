"""
NPS, CSAT, and CES computation with bootstrap confidence intervals.

This module provides deterministic computation of customer satisfaction
metrics from survey response data. All confidence intervals use bootstrap
resampling (not normal approximation) because NPS is bounded and
non-Gaussian.

Usage:
    python compute_metrics.py \
        --input workspace/raw/survey_responses.csv \
        --output workspace/analysis/satisfaction_metrics.json \
        --n-bootstrap 10000 \
        --confidence-level 0.95

Dependencies:
    numpy, scipy, pandas
"""

from __future__ import annotations

import argparse
import json
import logging
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class ConfidenceInterval:
    """Represents a confidence interval with lower and upper bounds."""

    lower: float
    upper: float
    confidence_level: float
    method: str  # e.g. "bootstrap_percentile", "bca", "wilson"


@dataclass
class MetricResult:
    """Result of a satisfaction metric computation."""

    metric_name: str  # "NPS", "CSAT", or "CES"
    value: float
    ci: ConfidenceInterval
    n_responses: int
    period: Optional[str] = None
    segment: Optional[str] = None
    low_confidence: bool = False  # True if n_responses < 30


@dataclass
class NPSBreakdown:
    """Detailed NPS breakdown showing Promoter/Passive/Detractor counts."""

    promoters: int
    passives: int
    detractors: int
    pct_promoters: float
    pct_passives: float
    pct_detractors: float
    nps: float


# ---------------------------------------------------------------------------
# NPS computation
# ---------------------------------------------------------------------------


def classify_nps_responses(
    scores: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Classify NPS responses into Promoter, Passive, and Detractor arrays.

    Args:
        scores: Array of integer scores on a 0-10 scale.

    Returns:
        Tuple of boolean arrays (is_promoter, is_passive, is_detractor).

    Raises:
        ValueError: If scores contain values outside the 0-10 range.
    """
    scores = np.asarray(scores)
    if scores.size == 0:
        raise ValueError("Scores array must not be empty.")
    if np.any((scores < 0) | (scores > 10)):
        raise ValueError(f"All scores must be in the 0-10 range. Found min={scores.min()}, max={scores.max()}.")
    is_promoter = scores >= 9
    is_passive = (scores >= 7) & (scores <= 8)
    is_detractor = scores <= 6
    return is_promoter, is_passive, is_detractor


def compute_nps(scores: np.ndarray) -> NPSBreakdown:
    """Compute Net Promoter Score from an array of 0-10 ratings.

    NPS = (% Promoters) - (% Detractors)
    - Promoters: scores 9-10
    - Passives: scores 7-8
    - Detractors: scores 0-6

    Args:
        scores: Array of integer scores on a 0-10 scale.

    Returns:
        NPSBreakdown with counts, percentages, and the NPS value.

    Raises:
        ValueError: If scores array is empty or contains invalid values.
    """
    scores = np.asarray(scores)
    if scores.size == 0:
        raise ValueError("Scores array must not be empty.")
    is_promoter, is_passive, is_detractor = classify_nps_responses(scores)
    n = len(scores)
    promoters = int(is_promoter.sum())
    passives = int(is_passive.sum())
    detractors = int(is_detractor.sum())
    pct_promoters = promoters / n * 100
    pct_passives = passives / n * 100
    pct_detractors = detractors / n * 100
    nps = pct_promoters - pct_detractors
    return NPSBreakdown(
        promoters=promoters,
        passives=passives,
        detractors=detractors,
        pct_promoters=round(pct_promoters, 2),
        pct_passives=round(pct_passives, 2),
        pct_detractors=round(pct_detractors, 2),
        nps=round(nps, 2),
    )


def _compute_nps_from_scores(scores: np.ndarray) -> float:
    """Helper: compute raw NPS float from score array."""
    n = len(scores)
    if n == 0:
        return 0.0
    promoters = np.sum(scores >= 9)
    detractors = np.sum(scores <= 6)
    return (promoters - detractors) / n * 100


def bootstrap_nps_ci(
    scores: np.ndarray,
    n_bootstrap: int = 10_000,
    confidence_level: float = 0.95,
    random_seed: Optional[int] = None,
    method: str = "percentile",
) -> ConfidenceInterval:
    """Compute bootstrap confidence interval for NPS.

    Uses resampling with replacement to generate a distribution of NPS
    values and extracts percentile-based confidence bounds.

    Args:
        scores: Array of integer scores on a 0-10 scale.
        n_bootstrap: Number of bootstrap iterations (>= 10,000 recommended).
        confidence_level: Confidence level for the interval (e.g., 0.95).
        random_seed: Optional seed for reproducibility.
        method: Bootstrap CI method. One of "percentile" or "bca"
            (bias-corrected and accelerated). BCa is preferred for small
            samples (n < 100).

    Returns:
        ConfidenceInterval with lower/upper bounds and metadata.

    Raises:
        ValueError: If n_bootstrap < 1000 or confidence_level not in (0, 1).
    """
    if n_bootstrap < 1000:
        raise ValueError(f"n_bootstrap must be >= 1000, got {n_bootstrap}.")
    if not (0 < confidence_level < 1):
        raise ValueError(f"confidence_level must be in (0, 1), got {confidence_level}.")

    scores = np.asarray(scores)
    n = len(scores)
    rng = np.random.default_rng(random_seed)
    alpha = 1 - confidence_level

    # Generate bootstrap NPS distribution
    boot_indices = rng.integers(0, n, size=(n_bootstrap, n))
    boot_nps = np.array([_compute_nps_from_scores(scores[idx]) for idx in boot_indices])

    if method == "bca":
        # Bias-corrected and accelerated bootstrap
        from scipy import stats as sp_stats

        # Observed statistic
        theta_hat = _compute_nps_from_scores(scores)

        # Bias correction factor z0
        prop_less = np.mean(boot_nps < theta_hat)
        # Clamp to avoid infinite z-scores
        prop_less = np.clip(prop_less, 1e-10, 1 - 1e-10)
        z0 = sp_stats.norm.ppf(prop_less)

        # Acceleration factor a (jackknife)
        jackknife_nps = np.empty(n)
        for i in range(n):
            jack_sample = np.concatenate([scores[:i], scores[i + 1 :]])
            jackknife_nps[i] = _compute_nps_from_scores(jack_sample)
        jack_mean = jackknife_nps.mean()
        jack_diff = jack_mean - jackknife_nps
        numerator = np.sum(jack_diff**3)
        denominator = 6.0 * (np.sum(jack_diff**2)) ** 1.5
        a = numerator / denominator if denominator != 0 else 0.0

        # Adjusted percentiles
        z_alpha_low = sp_stats.norm.ppf(alpha / 2)
        z_alpha_high = sp_stats.norm.ppf(1 - alpha / 2)

        def _bca_percentile(z_alpha: float) -> float:
            num = z0 + z_alpha
            adjusted = z0 + num / (1 - a * num)
            return sp_stats.norm.cdf(adjusted)

        p_low = _bca_percentile(z_alpha_low)
        p_high = _bca_percentile(z_alpha_high)

        # Clamp percentiles to valid range
        p_low = np.clip(p_low, 0, 1)
        p_high = np.clip(p_high, 0, 1)

        lower = float(np.percentile(boot_nps, p_low * 100))
        upper = float(np.percentile(boot_nps, p_high * 100))
        ci_method = "bca"
    else:
        # Simple percentile method
        lower = float(np.percentile(boot_nps, alpha / 2 * 100))
        upper = float(np.percentile(boot_nps, (1 - alpha / 2) * 100))
        ci_method = "bootstrap_percentile"

    return ConfidenceInterval(
        lower=round(lower, 2),
        upper=round(upper, 2),
        confidence_level=confidence_level,
        method=ci_method,
    )


# ---------------------------------------------------------------------------
# CSAT computation
# ---------------------------------------------------------------------------


def compute_csat(
    scores: np.ndarray,
    scale_max: int = 5,
    top_box: int = 2,
) -> float:
    """Compute Customer Satisfaction Score as a percentage.

    CSAT = (number of top-box responses / total responses) * 100

    Args:
        scores: Array of integer satisfaction scores.
        scale_max: Maximum value on the rating scale (e.g., 5 for 1-5 scale).
        top_box: Number of top scale points considered "satisfied."
            E.g., top_box=2 on a 5-point scale counts scores 4 and 5.

    Returns:
        CSAT as a percentage (0-100).

    Raises:
        ValueError: If scores are empty or top_box exceeds scale_max.
    """
    scores = np.asarray(scores)
    if scores.size == 0:
        raise ValueError("Scores array must not be empty.")
    if top_box >= scale_max:
        raise ValueError(f"top_box ({top_box}) must be less than scale_max ({scale_max}).")
    threshold = scale_max - top_box + 1
    satisfied = np.sum(scores >= threshold)
    return float(satisfied / len(scores) * 100)


def bootstrap_csat_ci(
    scores: np.ndarray,
    scale_max: int = 5,
    top_box: int = 2,
    n_bootstrap: int = 10_000,
    confidence_level: float = 0.95,
    random_seed: Optional[int] = None,
) -> ConfidenceInterval:
    """Compute bootstrap confidence interval for CSAT.

    Args:
        scores: Array of integer satisfaction scores.
        scale_max: Maximum value on the rating scale.
        top_box: Number of top scale points considered "satisfied."
        n_bootstrap: Number of bootstrap iterations.
        confidence_level: Confidence level for the interval.
        random_seed: Optional seed for reproducibility.

    Returns:
        ConfidenceInterval for the CSAT percentage.
    """
    scores = np.asarray(scores)
    n = len(scores)
    rng = np.random.default_rng(random_seed)
    alpha = 1 - confidence_level

    boot_indices = rng.integers(0, n, size=(n_bootstrap, n))
    threshold = scale_max - top_box + 1

    boot_csat = np.array([np.sum(scores[idx] >= threshold) / n * 100 for idx in boot_indices])

    lower = float(np.percentile(boot_csat, alpha / 2 * 100))
    upper = float(np.percentile(boot_csat, (1 - alpha / 2) * 100))

    return ConfidenceInterval(
        lower=round(lower, 2),
        upper=round(upper, 2),
        confidence_level=confidence_level,
        method="bootstrap_percentile",
    )


# ---------------------------------------------------------------------------
# CES computation
# ---------------------------------------------------------------------------


def compute_ces(scores: np.ndarray) -> float:
    """Compute Customer Effort Score as the arithmetic mean.

    CES is measured on a 1-7 Likert scale where higher scores indicate
    lower effort (i.e., better experience).

    Args:
        scores: Array of effort scores (typically 1-7 scale).

    Returns:
        Mean effort score.

    Raises:
        ValueError: If scores array is empty.
    """
    scores = np.asarray(scores, dtype=float)
    if scores.size == 0:
        raise ValueError("Scores array must not be empty.")
    return float(np.mean(scores))


def bootstrap_ces_ci(
    scores: np.ndarray,
    n_bootstrap: int = 10_000,
    confidence_level: float = 0.95,
    random_seed: Optional[int] = None,
) -> ConfidenceInterval:
    """Compute bootstrap confidence interval for CES.

    Args:
        scores: Array of effort scores.
        n_bootstrap: Number of bootstrap iterations.
        confidence_level: Confidence level for the interval.
        random_seed: Optional seed for reproducibility.

    Returns:
        ConfidenceInterval for the CES mean.
    """
    scores = np.asarray(scores, dtype=float)
    n = len(scores)
    rng = np.random.default_rng(random_seed)
    alpha = 1 - confidence_level

    boot_indices = rng.integers(0, n, size=(n_bootstrap, n))
    boot_ces = np.array([np.mean(scores[idx]) for idx in boot_indices])

    lower = float(np.percentile(boot_ces, alpha / 2 * 100))
    upper = float(np.percentile(boot_ces, (1 - alpha / 2) * 100))

    return ConfidenceInterval(
        lower=round(lower, 4),
        upper=round(upper, 4),
        confidence_level=confidence_level,
        method="bootstrap_percentile",
    )


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def load_survey_data(filepath: Path) -> pd.DataFrame:
    """Load and validate survey response data from CSV.

    Expected columns: respondent_id, question_id, response, score, timestamp.

    Args:
        filepath: Path to the survey_responses.csv file.

    Returns:
        Validated DataFrame with parsed timestamps and typed scores.

    Raises:
        FileNotFoundError: If the file does not exist.
        ValueError: If required columns are missing or data is malformed.
    """
    filepath = Path(filepath)
    if not filepath.exists():
        raise FileNotFoundError(f"Survey data file not found: {filepath}")

    df = pd.read_csv(filepath)

    required_cols = {"respondent_id", "question_id", "response", "score", "timestamp"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}. Found columns: {list(df.columns)}")

    # Parse timestamps
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    if df["timestamp"].isna().all():
        raise ValueError("All timestamp values are unparseable.")

    # Coerce scores to numeric
    df["score"] = pd.to_numeric(df["score"], errors="coerce")

    logger.info(
        "Loaded %d survey responses from %d respondents.",
        len(df),
        df["respondent_id"].nunique(),
    )

    return df


def _compute_metric_for_group(
    scores: np.ndarray,
    metric_name: str,
    n_bootstrap: int,
    confidence_level: float,
    random_seed: Optional[int],
    period: Optional[str] = None,
    segment: Optional[str] = None,
) -> MetricResult:
    """Compute a single metric with CI for a group of scores."""
    scores = scores[~np.isnan(scores)]
    n = len(scores)
    low_confidence = n < 30

    if metric_name == "NPS":
        breakdown = compute_nps(scores)
        value = breakdown.nps
        # Use BCa for small samples
        method = "bca" if n < 100 else "percentile"
        ci = bootstrap_nps_ci(
            scores,
            n_bootstrap=n_bootstrap,
            confidence_level=confidence_level,
            random_seed=random_seed,
            method=method,
        )
    elif metric_name == "CSAT":
        value = round(compute_csat(scores), 2)
        ci = bootstrap_csat_ci(
            scores,
            n_bootstrap=n_bootstrap,
            confidence_level=confidence_level,
            random_seed=random_seed,
        )
    elif metric_name == "CES":
        value = round(compute_ces(scores), 4)
        ci = bootstrap_ces_ci(
            scores,
            n_bootstrap=n_bootstrap,
            confidence_level=confidence_level,
            random_seed=random_seed,
        )
    else:
        raise ValueError(f"Unknown metric: {metric_name}")

    return MetricResult(
        metric_name=metric_name,
        value=value,
        ci=ci,
        n_responses=n,
        period=period,
        segment=segment,
        low_confidence=low_confidence,
    )


def compute_all_metrics(
    df: pd.DataFrame,
    n_bootstrap: int = 10_000,
    confidence_level: float = 0.95,
    random_seed: Optional[int] = None,
    segment_col: Optional[str] = None,
    period_col: Optional[str] = None,
) -> list[MetricResult]:
    """Compute NPS, CSAT, and CES for the full dataset and optionally by
    segment and/or period.

    Args:
        df: Survey response DataFrame with columns: respondent_id,
            question_id, response, score, timestamp.
        n_bootstrap: Number of bootstrap iterations for CIs.
        confidence_level: Confidence level for intervals.
        random_seed: Optional seed for reproducibility.
        segment_col: Optional column name to group by segment.
        period_col: Optional column name to group by time period.

    Returns:
        List of MetricResult objects for each metric/segment/period
        combination. Results with fewer than 30 responses are flagged
        as low_confidence.
    """
    results: list[MetricResult] = []

    # Determine which metrics can be computed based on question_id conventions.
    # NPS: scores 0-10; CSAT: scores 1-5; CES: scores 1-7
    # We attempt all three on the score column, using question_id to filter
    # if the column contains a known type, otherwise compute on all scores.

    # Identify NPS questions (0-10 scale)
    nps_mask = df["score"].between(0, 10)
    csat_mask = df["score"].between(1, 5)
    ces_mask = df["score"].between(1, 7)

    # Try to detect metric types from question_id
    has_question_types = False
    if "question_id" in df.columns:
        qids = df["question_id"].astype(str).str.lower()
        nps_q = qids.str.contains("nps", na=False)
        csat_q = qids.str.contains("csat|satisfaction", na=False)
        ces_q = qids.str.contains("ces|effort", na=False)
        if nps_q.any() or csat_q.any() or ces_q.any():
            has_question_types = True

    metric_configs = []
    if has_question_types:
        if nps_q.any():
            metric_configs.append(("NPS", df[nps_q]))
        if csat_q.any():
            metric_configs.append(("CSAT", df[csat_q]))
        if ces_q.any():
            metric_configs.append(("CES", df[ces_q]))
    else:
        # Fallback: compute all three on the full score column.
        # NPS if scores are 0-10 range, CSAT if 1-5, CES if 1-7.
        score_min = df["score"].min()
        score_max = df["score"].max()
        if score_min >= 0 and score_max <= 10:
            metric_configs.append(("NPS", df))
        if score_min >= 1 and score_max <= 5:
            metric_configs.append(("CSAT", df))
        if score_min >= 1 and score_max <= 7:
            metric_configs.append(("CES", df))
        # If nothing matched, default to NPS
        if not metric_configs:
            metric_configs.append(("NPS", df))

    def _process_group(
        metric_name: str,
        group_df: pd.DataFrame,
        period: Optional[str] = None,
        segment: Optional[str] = None,
    ) -> None:
        scores = group_df["score"].dropna().values
        if len(scores) < 2:
            return
        try:
            result = _compute_metric_for_group(
                scores,
                metric_name=metric_name,
                n_bootstrap=n_bootstrap,
                confidence_level=confidence_level,
                random_seed=random_seed,
                period=period,
                segment=segment,
            )
            results.append(result)
        except (ValueError, Exception) as exc:
            logger.warning(
                "Skipping %s for period=%s, segment=%s: %s",
                metric_name,
                period,
                segment,
                exc,
            )

    for metric_name, metric_df in metric_configs:
        # Overall
        _process_group(metric_name, metric_df)

        # By segment
        if segment_col and segment_col in metric_df.columns:
            for seg_name, seg_df in metric_df.groupby(segment_col):
                _process_group(metric_name, seg_df, segment=str(seg_name))

        # By period
        if period_col and period_col in metric_df.columns:
            for per_name, per_df in metric_df.groupby(period_col):
                _process_group(metric_name, per_df, period=str(per_name))

        # By segment x period
        if segment_col and period_col and segment_col in metric_df.columns and period_col in metric_df.columns:
            for (seg, per), grp_df in metric_df.groupby([segment_col, period_col]):
                _process_group(
                    metric_name,
                    grp_df,
                    period=str(per),
                    segment=str(seg),
                )

    return results


def write_results(results: list[MetricResult], output_path: Path) -> None:
    """Serialize metric results to JSON.

    Args:
        results: List of MetricResult objects to serialize.
        output_path: Path for the output JSON file.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    serialized = []
    for r in results:
        d = asdict(r)
        serialized.append(d)

    with open(output_path, "w") as f:
        json.dump(serialized, f, indent=2, default=str)

    logger.info("Wrote %d metric results to %s", len(results), output_path)


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
    parser = argparse.ArgumentParser(description="Compute NPS, CSAT, and CES with bootstrap CIs.")
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
        help="Path for output satisfaction_metrics.json",
    )
    parser.add_argument(
        "--n-bootstrap",
        type=int,
        default=10_000,
        help="Number of bootstrap iterations (default: 10000)",
    )
    parser.add_argument(
        "--confidence-level",
        type=float,
        default=0.95,
        help="Confidence level for intervals (default: 0.95)",
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

    logger.info("Loading survey data from %s", args.input)
    df = load_survey_data(args.input)

    logger.info("Computing metrics with %d bootstrap iterations", args.n_bootstrap)
    results = compute_all_metrics(
        df,
        n_bootstrap=args.n_bootstrap,
        confidence_level=args.confidence_level,
        random_seed=args.seed,
    )

    logger.info("Writing results to %s", args.output)
    write_results(results, args.output)

    logger.info("Done. Computed %d metric results.", len(results))


if __name__ == "__main__":
    main()
