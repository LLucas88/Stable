"""Statistical analysis for funnel conversion data.

This module computes conversion rates with Wilson score confidence intervals,
performs chi-squared tests for cohort comparison, and calculates composite
bottleneck scores for prioritizing optimization efforts.

Typical usage:
    from build_funnel import FunnelResult
    stats = compute_funnel_stats(funnel_result, confidence_level=0.95)
    bottlenecks = rank_bottlenecks(stats)
    save_bottleneck_ranking(bottlenecks, "workspace/analysis/bottleneck_ranking.json")
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from itertools import combinations
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from scipy import stats


@dataclass
class WilsonInterval:
    """Wilson score confidence interval for a proportion.

    Attributes:
        point_estimate: The observed proportion (k / n).
        lower: Lower bound of the confidence interval.
        upper: Upper bound of the confidence interval.
        confidence_level: The nominal confidence level (e.g., 0.95).
        n: Total number of trials.
        k: Number of successes.
    """

    point_estimate: float
    lower: float
    upper: float
    confidence_level: float
    n: int
    k: int


@dataclass
class StageStats:
    """Statistical summary for a single funnel stage.

    Attributes:
        stage_index: Zero-based index of this stage.
        stage_name: Human-readable stage name.
        entered: Number of users/sessions entering this stage.
        converted: Number proceeding to the next stage.
        dropped: Number who did not proceed.
        conversion_rate: Wilson interval for the conversion rate.
        drop_off_rate: Wilson interval for the drop-off rate.
        median_time_to_next: Median time in seconds to reach the next stage.
            None for the final stage.
        time_to_next_percentiles: Dict of percentile -> seconds for time to
            next stage (e.g., {25: 120, 50: 300, 75: 900}).
    """

    stage_index: int
    stage_name: str
    entered: int
    converted: int
    dropped: int
    conversion_rate: WilsonInterval
    drop_off_rate: WilsonInterval
    median_time_to_next: Optional[float] = None
    time_to_next_percentiles: dict[int, float] = field(default_factory=dict)


@dataclass
class FunnelStats:
    """Complete statistical summary for a funnel.

    Attributes:
        funnel_name: Name of the analyzed funnel.
        stages: Per-stage statistical summaries.
        overall_conversion: Wilson interval for end-to-end conversion.
        total_entered: Total users/sessions entering stage 0.
        total_completed: Total completing the final stage.
    """

    funnel_name: str
    stages: list[StageStats]
    overall_conversion: WilsonInterval
    total_entered: int
    total_completed: int


@dataclass
class BottleneckScore:
    """Bottleneck ranking entry for a single funnel stage.

    Attributes:
        stage_index: Zero-based index of this stage.
        stage_name: Human-readable stage name.
        drop_off_rate: Observed drop-off rate.
        volume: Number of users entering this stage.
        revenue_proximity: Weight reflecting closeness to final conversion.
        composite_score: The computed bottleneck score:
            drop_off_rate * sqrt(volume) * revenue_proximity.
        rank: Priority rank (1 = highest-priority bottleneck).
    """

    stage_index: int
    stage_name: str
    drop_off_rate: float
    volume: int
    revenue_proximity: float
    composite_score: float
    rank: int


@dataclass
class CohortComparison:
    """Result of comparing funnel performance between two cohorts.

    Attributes:
        stage_index: The funnel stage being compared.
        stage_name: Human-readable stage name.
        cohort_a_name: Name of the first cohort.
        cohort_b_name: Name of the second cohort.
        cohort_a_rate: Conversion rate for cohort A.
        cohort_b_rate: Conversion rate for cohort B.
        chi_squared_statistic: Chi-squared test statistic.
        p_value: P-value from the chi-squared test.
        significant: Whether the difference is statistically significant.
        relative_difference: (rate_b - rate_a) / rate_a as a fraction.
    """

    stage_index: int
    stage_name: str
    cohort_a_name: str
    cohort_b_name: str
    cohort_a_rate: float
    cohort_b_rate: float
    chi_squared_statistic: float
    p_value: float
    significant: bool
    relative_difference: float


def wilson_score_interval(
    k: int,
    n: int,
    confidence_level: float = 0.95,
) -> WilsonInterval:
    """Compute Wilson score confidence interval for a proportion.

    More accurate than the normal (Wald) approximation, especially for
    proportions near 0 or 1. Guaranteed to stay within [0, 1].

    Args:
        k: Number of successes (conversions).
        n: Total number of trials (users entering stage).
        confidence_level: Nominal confidence level (default 0.95).

    Returns:
        A WilsonInterval with point estimate, lower bound, and upper bound.

    Raises:
        ValueError: If k > n or n <= 0 or k < 0.
    """
    if n <= 0:
        raise ValueError(f"n must be positive, got {n}")
    if k < 0:
        raise ValueError(f"k must be non-negative, got {k}")
    if k > n:
        raise ValueError(f"k ({k}) cannot exceed n ({n})")

    z = stats.norm.ppf(1 - (1 - confidence_level) / 2)
    p_hat = k / n

    denominator = 1 + z**2 / n
    center = (p_hat + z**2 / (2 * n)) / denominator
    margin = z / denominator * np.sqrt(p_hat * (1 - p_hat) / n + z**2 / (4 * n**2))

    lower = max(0.0, center - margin)
    upper = min(1.0, center + margin)
    # Snap near-boundary floats to exact 0/1 — k=0 should give lower=0 exactly,
    # not 3e-18, which breaks downstream equality checks and looks ugly in reports.
    if lower < 1e-12:
        lower = 0.0
    if upper > 1 - 1e-12:
        upper = 1.0

    return WilsonInterval(
        point_estimate=p_hat,
        lower=lower,
        upper=upper,
        confidence_level=confidence_level,
        n=n,
        k=k,
    )


def compute_funnel_stats(
    funnel_result: "FunnelResult",
    confidence_level: float = 0.95,
) -> FunnelStats:
    """Compute statistical summaries for all funnel stages.

    Calculates Wilson score confidence intervals for conversion and drop-off
    rates at each stage, plus the overall end-to-end conversion rate.

    Args:
        funnel_result: A FunnelResult from build_funnel.py containing stage
            counts and per-user results.
        confidence_level: Nominal confidence level for intervals (default 0.95).

    Returns:
        A FunnelStats with per-stage and overall statistical summaries.
    """
    num_stages = len(funnel_result.steps)
    stages: list[StageStats] = []

    for i in range(num_stages):
        entered = funnel_result.stage_counts[i]

        if i < num_stages - 1:
            converted = funnel_result.stage_counts[i + 1]
        else:
            # Final stage: "converted" means completed (no next stage)
            converted = funnel_result.stage_counts[i]

        dropped = entered - converted

        # Wilson CIs for conversion and drop-off
        if entered > 0:
            conversion_ci = wilson_score_interval(converted, entered, confidence_level)
            drop_off_ci = WilsonInterval(
                point_estimate=1 - conversion_ci.point_estimate,
                lower=max(0.0, 1 - conversion_ci.upper),
                upper=min(1.0, 1 - conversion_ci.lower),
                confidence_level=confidence_level,
                n=entered,
                k=dropped,
            )
        else:
            conversion_ci = WilsonInterval(0.0, 0.0, 0.0, confidence_level, 0, 0)
            drop_off_ci = WilsonInterval(0.0, 0.0, 0.0, confidence_level, 0, 0)

        # Compute time-to-next-stage from user_results
        median_time = None
        time_percentiles: dict[int, float] = {}

        if i < num_stages - 1:
            times: list[float] = []
            for ur in funnel_result.user_results:
                if i in ur.stage_timestamps and (i + 1) in ur.stage_timestamps:
                    ts_current = pd.Timestamp(ur.stage_timestamps[i])
                    ts_next = pd.Timestamp(ur.stage_timestamps[i + 1])
                    elapsed = (ts_next - ts_current).total_seconds()
                    if elapsed >= 0:
                        times.append(elapsed)

            if times:
                times_arr = np.array(times)
                median_time = float(np.median(times_arr))
                for p in [25, 50, 75, 90]:
                    time_percentiles[p] = float(np.percentile(times_arr, p))

        stages.append(
            StageStats(
                stage_index=i,
                stage_name=funnel_result.steps[i],
                entered=entered,
                converted=converted,
                dropped=dropped,
                conversion_rate=conversion_ci,
                drop_off_rate=drop_off_ci,
                median_time_to_next=median_time,
                time_to_next_percentiles=time_percentiles,
            )
        )

    # Overall conversion
    total_entered = funnel_result.total_entered
    total_completed = funnel_result.total_completed

    if total_entered > 0:
        overall_ci = wilson_score_interval(total_completed, total_entered, confidence_level)
    else:
        overall_ci = WilsonInterval(0.0, 0.0, 0.0, confidence_level, 0, 0)

    return FunnelStats(
        funnel_name=funnel_result.funnel_name,
        stages=stages,
        overall_conversion=overall_ci,
        total_entered=total_entered,
        total_completed=total_completed,
    )


def compute_time_to_convert(
    funnel_result: "FunnelResult",
    percentiles: list[int] | None = None,
    handle_censored: bool = True,
) -> list[dict[str, float | None]]:
    """Compute time-to-convert distributions between consecutive stages.

    Analyzes the time elapsed between consecutive funnel steps for each user.
    Handles right-censored data (users still in funnel at analysis time) using
    Kaplan-Meier estimation when enabled.

    Args:
        funnel_result: A FunnelResult with per-user stage timestamps.
        percentiles: List of percentiles to compute (default [25, 50, 75, 90]).
        handle_censored: Whether to apply Kaplan-Meier for censored
            observations (default True).

    Returns:
        A list of dicts, one per stage transition, each containing:
            - "from_stage": stage index
            - "to_stage": next stage index
            - "median_seconds": median time in seconds
            - "percentiles": dict of percentile -> seconds
            - "n_observed": count of users who completed transition
            - "n_censored": count of users censored at this transition
    """
    if percentiles is None:
        percentiles = [25, 50, 75, 90]

    num_stages = len(funnel_result.steps)
    results: list[dict] = []

    for i in range(num_stages - 1):
        observed_times: list[float] = []
        n_censored = 0

        for ur in funnel_result.user_results:
            if i not in ur.stage_timestamps:
                # User didn't reach this stage, skip
                continue

            ts_current = pd.Timestamp(ur.stage_timestamps[i])

            if (i + 1) in ur.stage_timestamps:
                # Observed: user made it to the next stage
                ts_next = pd.Timestamp(ur.stage_timestamps[i + 1])
                elapsed = (ts_next - ts_current).total_seconds()
                if elapsed >= 0:
                    observed_times.append(elapsed)
            else:
                # Censored: user reached stage i but not i+1
                n_censored += 1

        n_observed = len(observed_times)

        if n_observed == 0:
            results.append(
                {
                    "from_stage": i,
                    "to_stage": i + 1,
                    "median_seconds": None,
                    "percentiles": {p: None for p in percentiles},
                    "n_observed": 0,
                    "n_censored": n_censored,
                }
            )
            continue

        times_arr = np.array(sorted(observed_times))

        if handle_censored and n_censored > 0:
            # Kaplan-Meier estimation for censored data
            # Combine observed and censored into a sorted event list
            # For censored observations, we don't know exact time; use max
            # observed time as conservative censoring time
            max_observed = times_arr[-1] if len(times_arr) > 0 else 0.0

            # Build KM survival curve from observed times only, adjusting
            # the risk set to account for censored observations
            total_at_risk = n_observed + n_censored
            unique_times = np.unique(times_arr)
            survival = 1.0
            km_times: list[float] = [0.0]
            km_survival: list[float] = [1.0]

            remaining_censored = n_censored
            events_processed = 0

            for t in unique_times:
                events_at_t = int(np.sum(times_arr == t))

                # Risk set: total - events already processed - censored
                # distributed proportionally
                risk_set = total_at_risk - events_processed
                if risk_set <= 0:
                    break

                survival *= 1 - events_at_t / risk_set
                km_times.append(float(t))
                km_survival.append(survival)
                events_processed += events_at_t

            # Compute percentiles from KM curve
            km_times_arr = np.array(km_times)
            km_survival_arr = np.array(km_survival)

            pct_results: dict[int, float | None] = {}
            for p in percentiles:
                target_survival = 1 - p / 100.0
                indices = np.where(km_survival_arr <= target_survival)[0]
                if len(indices) > 0:
                    pct_results[p] = float(km_times_arr[indices[0]])
                else:
                    # Survival never drops below target; use max observed
                    pct_results[p] = float(max_observed)

            median_seconds = pct_results.get(50)
        else:
            # No censoring adjustment, use observed times directly
            pct_results = {}
            for p in percentiles:
                pct_results[p] = float(np.percentile(times_arr, p))
            median_seconds = float(np.median(times_arr))

        results.append(
            {
                "from_stage": i,
                "to_stage": i + 1,
                "median_seconds": median_seconds,
                "percentiles": pct_results,
                "n_observed": n_observed,
                "n_censored": n_censored,
            }
        )

    return results


def chi_squared_comparison(
    stage_name: str,
    stage_index: int,
    cohort_a_name: str,
    cohort_a_converted: int,
    cohort_a_total: int,
    cohort_b_name: str,
    cohort_b_converted: int,
    cohort_b_total: int,
    alpha: float = 0.05,
) -> CohortComparison:
    """Compare conversion rates between two cohorts using chi-squared test.

    Constructs a 2x2 contingency table and performs a chi-squared test of
    independence. Applies Yates continuity correction when any expected cell
    count is below 5.

    Args:
        stage_name: Human-readable name of the stage being compared.
        stage_index: Zero-based index of the stage.
        cohort_a_name: Label for the first cohort.
        cohort_a_converted: Conversions in cohort A.
        cohort_a_total: Total users in cohort A at this stage.
        cohort_b_name: Label for the second cohort.
        cohort_b_converted: Conversions in cohort B.
        cohort_b_total: Total users in cohort B at this stage.
        alpha: Significance threshold (default 0.05).

    Returns:
        A CohortComparison with test statistic, p-value, and significance flag.

    Raises:
        ValueError: If any count is negative or converted > total.
    """
    if cohort_a_converted < 0 or cohort_b_converted < 0:
        raise ValueError("Converted counts must be non-negative")
    if cohort_a_total < 0 or cohort_b_total < 0:
        raise ValueError("Total counts must be non-negative")
    if cohort_a_converted > cohort_a_total:
        raise ValueError(f"Cohort A converted ({cohort_a_converted}) > total ({cohort_a_total})")
    if cohort_b_converted > cohort_b_total:
        raise ValueError(f"Cohort B converted ({cohort_b_converted}) > total ({cohort_b_total})")

    # Build 2x2 contingency table
    # [[converted_A, not_converted_A], [converted_B, not_converted_B]]
    table = np.array(
        [
            [cohort_a_converted, cohort_a_total - cohort_a_converted],
            [cohort_b_converted, cohort_b_total - cohort_b_converted],
        ]
    )

    # Determine whether to use Yates correction: check expected cell counts
    row_totals = table.sum(axis=1)
    col_totals = table.sum(axis=0)
    grand_total = table.sum()

    if grand_total == 0:
        return CohortComparison(
            stage_index=stage_index,
            stage_name=stage_name,
            cohort_a_name=cohort_a_name,
            cohort_b_name=cohort_b_name,
            cohort_a_rate=0.0,
            cohort_b_rate=0.0,
            chi_squared_statistic=0.0,
            p_value=1.0,
            significant=False,
            relative_difference=0.0,
        )

    expected = np.outer(row_totals, col_totals) / grand_total
    use_yates = bool(np.any(expected < 5))

    chi2_stat, p_value, _, _ = stats.chi2_contingency(table, correction=use_yates)

    rate_a = cohort_a_converted / cohort_a_total if cohort_a_total > 0 else 0.0
    rate_b = cohort_b_converted / cohort_b_total if cohort_b_total > 0 else 0.0

    relative_diff = (rate_b - rate_a) / rate_a if rate_a > 0 else 0.0

    return CohortComparison(
        stage_index=stage_index,
        stage_name=stage_name,
        cohort_a_name=cohort_a_name,
        cohort_b_name=cohort_b_name,
        cohort_a_rate=rate_a,
        cohort_b_rate=rate_b,
        chi_squared_statistic=float(chi2_stat),
        p_value=float(p_value),
        significant=bool(p_value < alpha),
        relative_difference=relative_diff,
    )


def compare_cohort_funnels(
    cohort_funnels: dict[str, "FunnelResult"],
    alpha: float = 0.05,
    correction: str = "bonferroni",
) -> list[CohortComparison]:
    """Compare funnel performance across multiple cohorts at each stage.

    Performs pairwise chi-squared comparisons between all cohort pairs at each
    funnel stage. Applies multiple-comparison correction.

    Args:
        cohort_funnels: Mapping of cohort name to FunnelResult.
        alpha: Family-wise significance threshold (default 0.05).
        correction: Multiple comparison correction method. One of
            "bonferroni" or "none" (default "bonferroni").

    Returns:
        A list of CohortComparison results for all pairwise stage comparisons.
    """
    cohort_names = list(cohort_funnels.keys())
    if len(cohort_names) < 2:
        return []

    # Get number of stages from first cohort
    first_funnel = next(iter(cohort_funnels.values()))
    num_stages = len(first_funnel.steps)

    # Count total pairwise comparisons for Bonferroni correction
    num_pairs = len(list(combinations(cohort_names, 2)))
    num_comparisons = num_pairs * num_stages

    if correction == "bonferroni" and num_comparisons > 0:
        adjusted_alpha = alpha / num_comparisons
    else:
        adjusted_alpha = alpha

    results: list[CohortComparison] = []

    for i in range(num_stages):
        for name_a, name_b in combinations(cohort_names, 2):
            funnel_a = cohort_funnels[name_a]
            funnel_b = cohort_funnels[name_b]

            entered_a = funnel_a.stage_counts[i]
            entered_b = funnel_b.stage_counts[i]

            if i < num_stages - 1:
                converted_a = funnel_a.stage_counts[i + 1]
                converted_b = funnel_b.stage_counts[i + 1]
            else:
                # Final stage: use the count itself as converted
                converted_a = funnel_a.stage_counts[i]
                converted_b = funnel_b.stage_counts[i]

            # Skip if both cohorts have zero entries
            if entered_a == 0 and entered_b == 0:
                continue

            comparison = chi_squared_comparison(
                stage_name=funnel_a.steps[i],
                stage_index=i,
                cohort_a_name=name_a,
                cohort_a_converted=converted_a,
                cohort_a_total=entered_a,
                cohort_b_name=name_b,
                cohort_b_converted=converted_b,
                cohort_b_total=entered_b,
                alpha=adjusted_alpha,
            )
            results.append(comparison)

    return results


def rank_bottlenecks(
    funnel_stats: FunnelStats,
    total_stages: Optional[int] = None,
    weight_dropoff: float = 1.0,
    weight_volume_exp: float = 0.5,
    weight_proximity: float = 1.0,
) -> list[BottleneckScore]:
    """Rank funnel stages by bottleneck severity.

    Computes a composite bottleneck score for each stage using the formula:
        score = drop_off_rate^weight_dropoff * volume^weight_volume_exp
                * revenue_proximity^weight_proximity

    Default formula: drop_off_rate * sqrt(volume) * revenue_proximity
    where revenue_proximity = 1 / (total_stages - stage_index).

    Args:
        funnel_stats: Statistical summary of the funnel.
        total_stages: Total number of stages. Defaults to len(funnel_stats.stages).
        weight_dropoff: Exponent for drop-off rate (default 1.0).
        weight_volume_exp: Exponent for volume (default 0.5 for sqrt).
        weight_proximity: Exponent for revenue proximity (default 1.0).

    Returns:
        A list of BottleneckScore entries sorted by composite score descending,
        with rank 1 being the highest-priority bottleneck.
    """
    if total_stages is None:
        total_stages = len(funnel_stats.stages)

    scores: list[BottleneckScore] = []

    for stage in funnel_stats.stages:
        i = stage.stage_index

        # Skip the final stage (no drop-off from funnel perspective)
        if i >= total_stages - 1:
            continue

        drop_off = stage.drop_off_rate.point_estimate
        volume = stage.entered

        # revenue_proximity = 1 / (total_stages - stage_index)
        distance_to_end = total_stages - i
        if distance_to_end <= 0:
            revenue_proximity = 1.0
        else:
            revenue_proximity = 1.0 / distance_to_end

        # Composite score with configurable exponents
        composite = (drop_off**weight_dropoff) * (volume**weight_volume_exp) * (revenue_proximity**weight_proximity)

        scores.append(
            BottleneckScore(
                stage_index=i,
                stage_name=stage.stage_name,
                drop_off_rate=drop_off,
                volume=volume,
                revenue_proximity=revenue_proximity,
                composite_score=composite,
                rank=0,  # Will be assigned after sorting
            )
        )

    # Sort by composite score descending
    scores.sort(key=lambda s: s.composite_score, reverse=True)

    # Assign ranks
    for rank, score in enumerate(scores, start=1):
        score.rank = rank

    return scores


def save_bottleneck_ranking(
    bottlenecks: list[BottleneckScore],
    filepath: str | Path,
) -> None:
    """Save bottleneck ranking to a JSON file.

    Serializes the ranked bottleneck list in the output contract format.

    Args:
        bottlenecks: Ranked list of BottleneckScore entries.
        filepath: Output path for the JSON file.
    """
    filepath = Path(filepath)
    filepath.parent.mkdir(parents=True, exist_ok=True)

    output = [
        {
            "rank": b.rank,
            "stage_index": b.stage_index,
            "stage_name": b.stage_name,
            "drop_off_rate": b.drop_off_rate,
            "volume": b.volume,
            "revenue_proximity": b.revenue_proximity,
            "composite_score": b.composite_score,
        }
        for b in bottlenecks
    ]

    with open(filepath, "w") as f:
        json.dump(output, f, indent=2)


def save_funnel_stats(
    funnel_stats: FunnelStats,
    filepath: str | Path,
) -> None:
    """Save funnel statistics to a JSON file.

    Serializes the complete funnel statistical summary in the output contract
    format expected by downstream skills.

    Args:
        funnel_stats: The complete statistical summary.
        filepath: Output path for the JSON file.
    """
    filepath = Path(filepath)
    filepath.parent.mkdir(parents=True, exist_ok=True)

    def _wilson_to_dict(wi: WilsonInterval) -> dict:
        return {
            "point_estimate": wi.point_estimate,
            "lower": wi.lower,
            "upper": wi.upper,
            "confidence_level": wi.confidence_level,
            "n": wi.n,
            "k": wi.k,
        }

    output = {
        "funnel_name": funnel_stats.funnel_name,
        "total_entered": funnel_stats.total_entered,
        "total_completed": funnel_stats.total_completed,
        "overall_conversion": _wilson_to_dict(funnel_stats.overall_conversion),
        "stages": [
            {
                "stage_index": s.stage_index,
                "stage_name": s.stage_name,
                "entered": s.entered,
                "converted": s.converted,
                "dropped": s.dropped,
                "conversion_rate": _wilson_to_dict(s.conversion_rate),
                "drop_off_rate": _wilson_to_dict(s.drop_off_rate),
                "median_time_to_next": s.median_time_to_next,
                "time_to_next_percentiles": {str(k): v for k, v in s.time_to_next_percentiles.items()},
            }
            for s in funnel_stats.stages
        ],
    }

    with open(filepath, "w") as f:
        json.dump(output, f, indent=2)


if __name__ == "__main__":
    import argparse
    from build_funnel import FunnelResult, UserFunnelResult

    parser = argparse.ArgumentParser(
        description="Compute funnel conversion confidence intervals and bottleneck rankings."
    )
    parser.add_argument(
        "funnel_results_path",
        nargs="?",
        default="workspace/analysis/funnel_results.json",
        help="Path to funnel_results.json from build_funnel.py.",
    )
    parser.add_argument(
        "bottleneck_output_path",
        nargs="?",
        default="workspace/analysis/bottleneck_ranking.json",
        help="Path for the generated bottleneck ranking JSON.",
    )
    parser.add_argument(
        "stats_output_path",
        nargs="?",
        default="workspace/analysis/funnel_stats.json",
        help="Path for the generated funnel stats JSON.",
    )
    args = parser.parse_args()

    # Load FunnelResult from JSON
    with open(args.funnel_results_path, "r") as f:
        raw = json.load(f)

    user_results = [
        UserFunnelResult(
            entity_id=ur["entity_id"],
            furthest_stage=ur["furthest_stage"],
            stage_timestamps={int(k): v for k, v in ur["stage_timestamps"].items()},
            completed=ur["completed"],
        )
        for ur in raw["user_results"]
    ]

    funnel_result = FunnelResult(
        funnel_name=raw["funnel_name"],
        steps=raw["steps"],
        stage_counts=raw["stage_counts"],
        stage_conversion_rates=raw["stage_conversion_rates"],
        stage_drop_off_rates=raw["stage_drop_off_rates"],
        total_entered=raw["total_entered"],
        total_completed=raw["total_completed"],
        overall_conversion_rate=raw["overall_conversion_rate"],
        user_results=user_results,
    )

    funnel_stats = compute_funnel_stats(funnel_result)
    bottlenecks = rank_bottlenecks(funnel_stats)

    save_funnel_stats(funnel_stats, args.stats_output_path)
    save_bottleneck_ranking(bottlenecks, args.bottleneck_output_path)

    print(f"Funnel stats computed for '{funnel_stats.funnel_name}'")
    print(
        f"Overall conversion: {funnel_stats.overall_conversion.point_estimate:.2%} "
        f"[{funnel_stats.overall_conversion.lower:.2%}, "
        f"{funnel_stats.overall_conversion.upper:.2%}]"
    )
    if bottlenecks:
        print(f"Top bottleneck: {bottlenecks[0].stage_name} (score: {bottlenecks[0].composite_score:.2f})")
