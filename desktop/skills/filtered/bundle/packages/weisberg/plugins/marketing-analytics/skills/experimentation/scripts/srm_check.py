"""Sample Ratio Mismatch (SRM) detection for A/B experiments."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from statistics import NormalDist
from typing import Dict, List, Optional, Sequence, Tuple

import math


@dataclass
class SRMResult:
    observed_counts: Dict[str, int]
    expected_ratios: Dict[str, float]
    expected_counts: Dict[str, float]
    chi_squared_statistic: float
    p_value: float
    has_mismatch: bool
    threshold: float
    diagnostic_breakdowns: Optional[Dict[str, "SRMResult"]]


def _chi_square_p_value(statistic: float, degrees_of_freedom: int) -> float:
    if degrees_of_freedom <= 0:
        return 1.0
    z_score = (((statistic / degrees_of_freedom) ** (1 / 3)) - (1 - 2 / (9 * degrees_of_freedom))) / math.sqrt(
        2 / (9 * degrees_of_freedom)
    )
    return 1 - NormalDist().cdf(z_score)


def run_srm_check(
    observed_counts: Dict[str, int],
    expected_ratios: Optional[Dict[str, float]] = None,
    threshold: float = 0.001,
) -> SRMResult:
    if not observed_counts:
        raise ValueError("observed_counts cannot be empty")
    if any(count < 0 for count in observed_counts.values()):
        raise ValueError("observed counts must be non-negative")
    variants = list(observed_counts.keys())
    if expected_ratios is None:
        expected_ratios = {variant: 1 / len(variants) for variant in variants}
    total_ratio = sum(expected_ratios.values())
    if abs(total_ratio - 1.0) > 1e-6:
        raise ValueError("expected_ratios must sum to 1.0")
    total_observed = sum(observed_counts.values())
    expected_counts = {variant: total_observed * expected_ratios[variant] for variant in variants}
    chi_sq = 0.0
    for variant in variants:
        expected = expected_counts[variant]
        if expected > 0:
            chi_sq += ((observed_counts[variant] - expected) ** 2) / expected
    p_value = _chi_square_p_value(chi_sq, len(variants) - 1)
    return SRMResult(
        observed_counts=observed_counts,
        expected_ratios=expected_ratios,
        expected_counts=expected_counts,
        chi_squared_statistic=chi_sq,
        p_value=p_value,
        has_mismatch=p_value < threshold,
        threshold=threshold,
        diagnostic_breakdowns=None,
    )


def run_srm_diagnostic_breakdown(
    user_data: Dict[str, Sequence[object]],
    variant_assignments: Sequence[str],
    variant_names: List[str],
    breakdown_dimensions: List[str],
    expected_ratios: Optional[Dict[str, float]] = None,
    threshold: float = 0.001,
) -> Dict[str, Dict[str, SRMResult]]:
    results: dict[str, dict[str, SRMResult]] = {}
    for dimension in breakdown_dimensions:
        values = user_data[dimension]
        dimension_results: dict[str, SRMResult] = {}
        for unique_value in sorted({str(value) for value in values}):
            counts = {variant: 0 for variant in variant_names}
            for value, variant in zip(values, variant_assignments):
                if str(value) == unique_value:
                    counts[variant] += 1
            dimension_results[unique_value] = run_srm_check(
                counts, expected_ratios=expected_ratios, threshold=threshold
            )
        results[dimension] = dimension_results
    return results


def detect_temporal_srm(
    timestamps: Sequence[object],
    variant_assignments: Sequence[str],
    variant_names: List[str],
    expected_ratios: Optional[Dict[str, float]] = None,
    time_granularity: str = "day",
    threshold: float = 0.001,
) -> List[Tuple[str, SRMResult]]:
    buckets: dict[str, dict[str, int]] = {}
    for timestamp, variant in zip(timestamps, variant_assignments):
        moment = datetime.fromisoformat(str(timestamp).replace("Z", "+00:00"))
        label = moment.strftime("%Y-%m-%d %H:00") if time_granularity == "hour" else moment.strftime("%Y-%m-%d")
        buckets.setdefault(label, {variant_name: 0 for variant_name in variant_names})
        buckets[label][variant] += 1
    return [
        (bucket, run_srm_check(counts, expected_ratios=expected_ratios, threshold=threshold))
        for bucket, counts in sorted(buckets.items())
    ]


def generate_srm_report(
    srm_result: SRMResult,
    diagnostic_breakdowns: Optional[Dict[str, Dict[str, SRMResult]]] = None,
    temporal_results: Optional[List[Tuple[str, SRMResult]]] = None,
) -> Dict[str, object]:
    summary = (
        f"SRM detected (chi-square={srm_result.chi_squared_statistic:.2f}, p={srm_result.p_value:.4g})."
        if srm_result.has_mismatch
        else f"No SRM detected (chi-square={srm_result.chi_squared_statistic:.2f}, p={srm_result.p_value:.4g})."
    )
    recommendations = []
    if srm_result.has_mismatch:
        recommendations.append("Audit assignment logic and event logging for affected variants.")
    if diagnostic_breakdowns:
        flagged_segments = [
            f"{dimension}:{segment}"
            for dimension, segments in diagnostic_breakdowns.items()
            for segment, result in segments.items()
            if result.has_mismatch
        ]
        if flagged_segments:
            recommendations.append(f"Investigate these mismatched segments first: {', '.join(flagged_segments[:5])}.")
    if temporal_results:
        mismatched_buckets = [label for label, result in temporal_results if result.has_mismatch]
        if mismatched_buckets:
            recommendations.append(f"Mismatch appears in these time buckets: {', '.join(mismatched_buckets[:5])}.")
    return {
        "summary": summary,
        "overall_result": srm_result,
        "breakdowns": diagnostic_breakdowns or {},
        "temporal_pattern": temporal_results or [],
        "recommendations": recommendations or ["No action needed beyond routine monitoring."],
    }
