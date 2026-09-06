"""Frequentist hypothesis tests for A/B experiments."""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum
from statistics import NormalDist, fmean
from typing import Dict, List, Optional, Sequence, Tuple


class TestType(Enum):
    Z_TEST = "z_test"
    T_TEST = "t_test"
    WELCH_T_TEST = "welch_t_test"
    CHI_SQUARED = "chi_squared"
    PROPORTION_Z = "proportion_z"


@dataclass
class FrequentistResult:
    test_type: TestType
    metric_name: str
    control_mean: float
    treatment_mean: float
    effect_size_absolute: float
    effect_size_relative: float
    confidence_interval: Tuple[float, float]
    p_value: float
    adjusted_p_value: Optional[float]
    test_statistic: float
    degrees_of_freedom: Optional[float]
    is_significant: bool
    alpha: float


def _variance(values: Sequence[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean_value = fmean(values)
    return sum((value - mean_value) ** 2 for value in values) / (len(values) - 1)


def _normal_p_value(z_score: float, two_sided: bool = True) -> float:
    normal = NormalDist()
    tail = 1 - normal.cdf(abs(z_score))
    return min(1.0, 2 * tail if two_sided else tail)


def _chi_square_p_value(statistic: float, degrees_of_freedom: int) -> float:
    if degrees_of_freedom <= 0:
        return 1.0
    # Wilson-Hilferty approximation keeps us dependency-light.
    z_score = (((statistic / degrees_of_freedom) ** (1 / 3)) - (1 - 2 / (9 * degrees_of_freedom))) / math.sqrt(
        2 / (9 * degrees_of_freedom)
    )
    return 1 - NormalDist().cdf(z_score)


def run_proportion_z_test(
    control_successes: int,
    control_total: int,
    treatment_successes: int,
    treatment_total: int,
    alpha: float = 0.05,
    two_sided: bool = True,
    metric_name: str = "conversion_rate",
) -> FrequentistResult:
    if min(control_successes, treatment_successes) < 0:
        raise ValueError("success counts must be non-negative")
    if control_total <= 0 or treatment_total <= 0:
        raise ValueError("totals must be positive")
    if control_successes > control_total or treatment_successes > treatment_total:
        raise ValueError("successes cannot exceed totals")

    p_control = control_successes / control_total
    p_treatment = treatment_successes / treatment_total
    pooled = (control_successes + treatment_successes) / (control_total + treatment_total)
    standard_error = math.sqrt(max(pooled * (1 - pooled) * ((1 / control_total) + (1 / treatment_total)), 1e-12))
    z_stat = (p_treatment - p_control) / standard_error
    unpooled_se = math.sqrt(
        max(
            (p_control * (1 - p_control) / control_total) + (p_treatment * (1 - p_treatment) / treatment_total),
            1e-12,
        )
    )
    z_critical = NormalDist().inv_cdf(1 - (alpha / 2 if two_sided else alpha))
    ci = (
        (p_treatment - p_control) - z_critical * unpooled_se,
        (p_treatment - p_control) + z_critical * unpooled_se,
    )
    effect_relative = (p_treatment - p_control) / p_control if p_control else 0.0
    p_value = _normal_p_value(z_stat, two_sided=two_sided)
    return FrequentistResult(
        test_type=TestType.PROPORTION_Z,
        metric_name=metric_name,
        control_mean=p_control,
        treatment_mean=p_treatment,
        effect_size_absolute=p_treatment - p_control,
        effect_size_relative=effect_relative,
        confidence_interval=ci,
        p_value=p_value,
        adjusted_p_value=None,
        test_statistic=z_stat,
        degrees_of_freedom=None,
        is_significant=p_value < alpha,
        alpha=alpha,
    )


def run_t_test(
    control_values: Sequence[float],
    treatment_values: Sequence[float],
    alpha: float = 0.05,
    two_sided: bool = True,
    equal_variance: bool = False,
    metric_name: str = "metric",
) -> FrequentistResult:
    if not control_values or not treatment_values:
        raise ValueError("input arrays must be non-empty")
    control = [float(value) for value in control_values]
    treatment = [float(value) for value in treatment_values]
    control_mean = fmean(control)
    treatment_mean = fmean(treatment)
    control_var = _variance(control)
    treatment_var = _variance(treatment)
    n_control = len(control)
    n_treatment = len(treatment)
    diff = treatment_mean - control_mean

    if equal_variance:
        pooled_variance = (((n_control - 1) * control_var) + ((n_treatment - 1) * treatment_var)) / max(
            n_control + n_treatment - 2, 1
        )
        standard_error = math.sqrt(max(pooled_variance * ((1 / n_control) + (1 / n_treatment)), 1e-12))
        degrees_of_freedom = float(n_control + n_treatment - 2)
        test_type = TestType.T_TEST
    else:
        standard_error = math.sqrt(max((control_var / n_control) + (treatment_var / n_treatment), 1e-12))
        numerator = ((control_var / n_control) + (treatment_var / n_treatment)) ** 2
        denominator = 0.0
        if n_control > 1:
            denominator += ((control_var / n_control) ** 2) / (n_control - 1)
        if n_treatment > 1:
            denominator += ((treatment_var / n_treatment) ** 2) / (n_treatment - 1)
        degrees_of_freedom = numerator / denominator if denominator else float(n_control + n_treatment - 2)
        test_type = TestType.WELCH_T_TEST

    t_stat = diff / standard_error
    # Normal approximation keeps this dependency-light; acceptable for ranking and summary use.
    p_value = _normal_p_value(t_stat, two_sided=two_sided)
    z_critical = NormalDist().inv_cdf(1 - (alpha / 2 if two_sided else alpha))
    ci = (diff - z_critical * standard_error, diff + z_critical * standard_error)
    effect_relative = diff / control_mean if control_mean else 0.0
    return FrequentistResult(
        test_type=test_type,
        metric_name=metric_name,
        control_mean=control_mean,
        treatment_mean=treatment_mean,
        effect_size_absolute=diff,
        effect_size_relative=effect_relative,
        confidence_interval=ci,
        p_value=p_value,
        adjusted_p_value=None,
        test_statistic=t_stat,
        degrees_of_freedom=degrees_of_freedom,
        is_significant=p_value < alpha,
        alpha=alpha,
    )


def run_chi_squared_test(
    observed_table: Sequence[Sequence[float]],
    alpha: float = 0.05,
    metric_name: str = "categorical_metric",
) -> FrequentistResult:
    rows = [[float(value) for value in row] for row in observed_table]
    if len(rows) < 2 or len(rows[0]) < 2:
        raise ValueError("table must have at least 2 rows and 2 columns")
    row_totals = [sum(row) for row in rows]
    col_totals = [sum(row[index] for row in rows) for index in range(len(rows[0]))]
    grand_total = sum(row_totals)
    chi_sq = 0.0
    for row_index, row in enumerate(rows):
        for col_index, observed in enumerate(row):
            expected = row_totals[row_index] * col_totals[col_index] / grand_total
            if expected > 0:
                chi_sq += ((observed - expected) ** 2) / expected
    dof = (len(rows) - 1) * (len(rows[0]) - 1)
    p_value = _chi_square_p_value(chi_sq, dof)
    min_dim = min(len(rows) - 1, len(rows[0]) - 1)
    cramers_v = math.sqrt(chi_sq / (grand_total * max(min_dim, 1))) if grand_total else 0.0
    return FrequentistResult(
        test_type=TestType.CHI_SQUARED,
        metric_name=metric_name,
        control_mean=row_totals[0] / grand_total if grand_total else 0.0,
        treatment_mean=row_totals[1] / grand_total if grand_total and len(row_totals) > 1 else 0.0,
        effect_size_absolute=cramers_v,
        effect_size_relative=cramers_v,
        confidence_interval=(max(0.0, cramers_v - 0.1), min(1.0, cramers_v + 0.1)),
        p_value=p_value,
        adjusted_p_value=None,
        test_statistic=chi_sq,
        degrees_of_freedom=float(dof),
        is_significant=p_value < alpha,
        alpha=alpha,
    )


def apply_bh_correction(
    results: List[FrequentistResult],
    alpha: float = 0.05,
) -> List[FrequentistResult]:
    if not results:
        return results
    indexed = sorted(enumerate(results), key=lambda item: item[1].p_value)
    total = len(results)
    adjusted = [0.0] * total
    running_min = 1.0
    for reverse_rank, (original_index, result) in enumerate(reversed(indexed), start=1):
        rank = total - reverse_rank + 1
        candidate = min(result.p_value * total / rank, 1.0)
        running_min = min(running_min, candidate)
        adjusted[original_index] = running_min
    updated = []
    for index, result in enumerate(results):
        result.adjusted_p_value = adjusted[index]
        result.is_significant = adjusted[index] < alpha
        updated.append(result)
    return updated


def run_experiment_analysis(
    experiment_data: Dict[str, Dict[str, Sequence[float]]],
    metric_types: Dict[str, str],
    alpha: float = 0.05,
    two_sided: bool = True,
    apply_correction: bool = True,
) -> List[FrequentistResult]:
    results: list[FrequentistResult] = []
    for metric_name, variants in experiment_data.items():
        control = variants.get("control")
        treatment = variants.get("treatment")
        if control is None or treatment is None:
            continue
        metric_type = metric_types.get(metric_name, "continuous")
        if metric_type == "proportion":
            control_successes = sum(1 for value in control if float(value) > 0)
            treatment_successes = sum(1 for value in treatment if float(value) > 0)
            results.append(
                run_proportion_z_test(
                    control_successes,
                    len(control),
                    treatment_successes,
                    len(treatment),
                    alpha=alpha,
                    two_sided=two_sided,
                    metric_name=metric_name,
                )
            )
        elif metric_type == "categorical":
            results.append(run_chi_squared_test([control, treatment], alpha=alpha, metric_name=metric_name))
        else:
            results.append(
                run_t_test(
                    control,
                    treatment,
                    alpha=alpha,
                    two_sided=two_sided,
                    equal_variance=False,
                    metric_name=metric_name,
                )
            )
    return apply_bh_correction(results, alpha=alpha) if apply_correction else results
