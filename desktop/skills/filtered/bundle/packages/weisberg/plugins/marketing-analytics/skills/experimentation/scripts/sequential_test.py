"""Sequential testing for continuous monitoring of A/B experiments."""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from enum import Enum
from statistics import NormalDist
from typing import Optional, Sequence, Tuple


class SpendingFunction(Enum):
    OBRIEN_FLEMING = "obrien_fleming"
    POCOCK = "pocock"


@dataclass
class SequentialResult:
    metric_name: str
    current_n: int
    planned_n: int
    information_fraction: float
    effect_estimate: float
    always_valid_ci: Tuple[float, float]
    msprt_statistic: float
    reject_null: bool
    boundary_value: float
    alpha_spent: float
    stop_for_futility: bool
    conditional_power: float


def _variance(values: Sequence[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean_value = statistics.fmean(values)
    return sum((value - mean_value) ** 2 for value in values) / (len(values) - 1)


def compute_msprt_statistic(
    running_mean_diff: float,
    sample_variance: float,
    current_n: int,
    tau_squared: float,
) -> float:
    sigma_sq = max(sample_variance, 1e-12)
    numerator = math.sqrt(sigma_sq / (sigma_sq + current_n * tau_squared))
    exponent = (current_n**2) * (running_mean_diff**2) * tau_squared
    exponent /= max(2 * sigma_sq * (sigma_sq + current_n * tau_squared), 1e-12)
    return numerator * math.exp(exponent)


def compute_always_valid_ci(
    running_mean_diff: float,
    sample_variance: float,
    current_n: int,
    tau_squared: float,
    alpha: float = 0.05,
) -> Tuple[float, float]:
    sigma_sq = max(sample_variance, 1e-12)
    scale_ratio = (sigma_sq + current_n * tau_squared) / max((current_n**2) * tau_squared, 1e-12)
    multiplier = 2 * math.log((1 / alpha) * math.sqrt((sigma_sq + current_n * tau_squared) / sigma_sq))
    half_width = math.sqrt(max(scale_ratio * multiplier, 0.0))
    return running_mean_diff - half_width, running_mean_diff + half_width


def obrien_fleming_spending(
    information_fraction: float,
    alpha: float = 0.05,
) -> float:
    information_fraction = max(min(information_fraction, 1.0), 1e-9)
    z_alpha = NormalDist().inv_cdf(1 - alpha / 2)
    return 2 * (1 - NormalDist().cdf(z_alpha / math.sqrt(information_fraction)))


def pocock_spending(
    information_fraction: float,
    alpha: float = 0.05,
) -> float:
    information_fraction = max(min(information_fraction, 1.0), 0.0)
    return alpha * math.log(1 + (math.e - 1) * information_fraction)


def compute_boundary(
    information_fraction: float,
    spending_function: SpendingFunction = SpendingFunction.OBRIEN_FLEMING,
    alpha: float = 0.05,
    previous_alpha_spent: float = 0.0,
) -> float:
    cumulative = (
        obrien_fleming_spending(information_fraction, alpha)
        if spending_function == SpendingFunction.OBRIEN_FLEMING
        else pocock_spending(information_fraction, alpha)
    )
    alpha_this_look = max(cumulative - previous_alpha_spent, 1e-12)
    return NormalDist().inv_cdf(1 - alpha_this_look / 2)


def compute_conditional_power(
    current_effect: float,
    current_n: int,
    planned_n: int,
    sample_variance: float,
    alpha: float = 0.05,
) -> float:
    if planned_n <= current_n:
        return 1.0
    standard_error_final = math.sqrt(max(2 * sample_variance / planned_n, 1e-12))
    z_critical = NormalDist().inv_cdf(1 - alpha / 2)
    projected_z = current_effect / standard_error_final
    return 1 - NormalDist().cdf(z_critical - projected_z)


def run_sequential_analysis(
    control_values: Sequence[float],
    treatment_values: Sequence[float],
    planned_n_per_group: int,
    tau_squared: Optional[float] = None,
    spending_function: SpendingFunction = SpendingFunction.OBRIEN_FLEMING,
    alpha: float = 0.05,
    futility_threshold: float = 0.10,
    metric_name: str = "metric",
) -> SequentialResult:
    if not control_values or not treatment_values:
        raise ValueError("control and treatment values must be non-empty")
    current_n = min(len(control_values), len(treatment_values))
    information_fraction = min(current_n / planned_n_per_group, 1.0)
    effect_estimate = statistics.fmean(treatment_values) - statistics.fmean(control_values)
    pooled_values = [float(value) for value in control_values] + [float(value) for value in treatment_values]
    sample_variance = _variance(pooled_values)
    tau_squared = tau_squared if tau_squared is not None else max((abs(effect_estimate) or 1.0) ** 2, 1e-4)
    msprt = compute_msprt_statistic(effect_estimate, sample_variance, current_n, tau_squared)
    ci = compute_always_valid_ci(effect_estimate, sample_variance, current_n, tau_squared, alpha=alpha)
    alpha_spent = (
        obrien_fleming_spending(information_fraction, alpha)
        if spending_function == SpendingFunction.OBRIEN_FLEMING
        else pocock_spending(information_fraction, alpha)
    )
    boundary = compute_boundary(information_fraction, spending_function=spending_function, alpha=alpha)
    z_current = effect_estimate / math.sqrt(max(2 * sample_variance / current_n, 1e-12))
    conditional_power = compute_conditional_power(
        effect_estimate, current_n, planned_n_per_group, sample_variance, alpha=alpha
    )
    reject = msprt >= (1 / alpha) or abs(z_current) >= boundary
    return SequentialResult(
        metric_name=metric_name,
        current_n=current_n,
        planned_n=planned_n_per_group,
        information_fraction=information_fraction,
        effect_estimate=effect_estimate,
        always_valid_ci=ci,
        msprt_statistic=msprt,
        reject_null=reject,
        boundary_value=boundary,
        alpha_spent=alpha_spent,
        stop_for_futility=conditional_power < futility_threshold,
        conditional_power=conditional_power,
    )
