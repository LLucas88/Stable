"""Power analysis: sample size and MDE calculation for A/B experiments."""

from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import NormalDist
from typing import Optional


@dataclass
class PowerAnalysisResult:
    sample_size_per_group: int
    total_sample_size: int
    mde_absolute: float
    mde_relative: float
    estimated_duration_days: Optional[int]
    power: float
    alpha: float
    num_groups: int


def _z_value(alpha: float, power: float, two_sided: bool) -> tuple[float, float]:
    if not 0 < alpha < 1 or not 0 < power < 1:
        raise ValueError("alpha and power must be between 0 and 1")
    normal = NormalDist()
    alpha_tail = alpha / 2 if two_sided else alpha
    return normal.inv_cdf(1 - alpha_tail), normal.inv_cdf(power)


def calculate_sample_size_proportion(
    baseline_rate: float,
    mde_relative: float,
    alpha: float = 0.05,
    power: float = 0.80,
    num_groups: int = 2,
    two_sided: bool = True,
) -> PowerAnalysisResult:
    if not 0 < baseline_rate < 1:
        raise ValueError("baseline_rate must be in (0, 1)")
    if mde_relative <= 0:
        raise ValueError("mde_relative must be positive")
    if num_groups < 2:
        raise ValueError("num_groups must be at least 2")

    delta = baseline_rate * mde_relative
    treatment_rate = min(max(baseline_rate + delta, 1e-9), 1 - 1e-9)
    p_bar = (baseline_rate + treatment_rate) / 2
    z_alpha, z_beta = _z_value(alpha, power, two_sided)
    numerator = (
        z_alpha * math.sqrt(2 * p_bar * (1 - p_bar))
        + z_beta * math.sqrt(baseline_rate * (1 - baseline_rate) + treatment_rate * (1 - treatment_rate))
    ) ** 2
    sample_size = math.ceil(numerator / (delta**2))
    return PowerAnalysisResult(
        sample_size_per_group=sample_size,
        total_sample_size=sample_size * num_groups,
        mde_absolute=delta,
        mde_relative=mde_relative,
        estimated_duration_days=None,
        power=power,
        alpha=alpha,
        num_groups=num_groups,
    )


def calculate_sample_size_continuous(
    baseline_mean: float,
    baseline_std: float,
    mde_relative: float,
    alpha: float = 0.05,
    power: float = 0.80,
    num_groups: int = 2,
    two_sided: bool = True,
) -> PowerAnalysisResult:
    if baseline_std <= 0:
        raise ValueError("baseline_std must be positive")
    if mde_relative <= 0:
        raise ValueError("mde_relative must be positive")
    if num_groups < 2:
        raise ValueError("num_groups must be at least 2")

    delta = abs(baseline_mean) * mde_relative if baseline_mean else mde_relative
    z_alpha, z_beta = _z_value(alpha, power, two_sided)
    sample_size = math.ceil(((z_alpha + z_beta) ** 2) * 2 * (baseline_std**2) / (delta**2))
    return PowerAnalysisResult(
        sample_size_per_group=sample_size,
        total_sample_size=sample_size * num_groups,
        mde_absolute=delta,
        mde_relative=mde_relative,
        estimated_duration_days=None,
        power=power,
        alpha=alpha,
        num_groups=num_groups,
    )


def calculate_mde(
    sample_size_per_group: int,
    baseline_rate: Optional[float] = None,
    baseline_mean: Optional[float] = None,
    baseline_std: Optional[float] = None,
    alpha: float = 0.05,
    power: float = 0.80,
    two_sided: bool = True,
) -> float:
    if sample_size_per_group <= 0:
        raise ValueError("sample_size_per_group must be positive")
    z_alpha, z_beta = _z_value(alpha, power, two_sided)
    if baseline_rate is not None:
        if not 0 < baseline_rate < 1:
            raise ValueError("baseline_rate must be in (0,1)")
        variance_term = 2 * baseline_rate * (1 - baseline_rate)
        delta = math.sqrt(((z_alpha + z_beta) ** 2) * variance_term / sample_size_per_group)
        return delta / baseline_rate
    if baseline_mean is None or baseline_std is None or baseline_std <= 0:
        raise ValueError("continuous metrics require baseline_mean and positive baseline_std")
    delta = math.sqrt(((z_alpha + z_beta) ** 2) * 2 * (baseline_std**2) / sample_size_per_group)
    denominator = abs(baseline_mean) if baseline_mean else 1.0
    return delta / denominator


def estimate_duration(
    required_sample_size_total: int,
    daily_traffic: int,
    traffic_allocation: float = 1.0,
    min_days: int = 7,
    round_to_weeks: bool = True,
) -> int:
    if daily_traffic <= 0:
        raise ValueError("daily_traffic must be positive")
    if not 0 < traffic_allocation <= 1:
        raise ValueError("traffic_allocation must be in (0,1]")
    raw_days = math.ceil(required_sample_size_total / (daily_traffic * traffic_allocation))
    duration = max(raw_days, min_days)
    if round_to_weeks:
        duration = math.ceil(duration / 7) * 7
    return duration
