"""CUPED (Controlled-experiment Using Pre-Experiment Data) implementation."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Sequence, Tuple

import math
import statistics


@dataclass
class CUPEDResult:
    metric_name: str
    covariate_name: str
    theta: float
    correlation: float
    variance_original: float
    variance_adjusted: float
    variance_reduction_pct: float
    adjusted_values: Dict[str, list[float]]


def _variance(values: Sequence[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean_value = statistics.fmean(values)
    return sum((value - mean_value) ** 2 for value in values) / (len(values) - 1)


def _quantile(values: Sequence[float], q: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    position = (len(ordered) - 1) * q
    low = int(position)
    high = min(low + 1, len(ordered) - 1)
    fraction = position - low
    return ordered[low] + (ordered[high] - ordered[low]) * fraction


def _winsorize(values: Sequence[float], percentile: Optional[float]) -> list[float]:
    values = [float(value) for value in values]
    if percentile is None:
        return values
    lower = _quantile(values, percentile)
    upper = _quantile(values, 1 - percentile)
    return [min(max(value, lower), upper) for value in values]


def _solve_linear_system(matrix: list[list[float]], vector: list[float]) -> list[float]:
    size = len(vector)
    augmented = [row[:] + [vector[index]] for index, row in enumerate(matrix)]
    for pivot in range(size):
        best_row = max(range(pivot, size), key=lambda idx: abs(augmented[idx][pivot]))
        augmented[pivot], augmented[best_row] = augmented[best_row], augmented[pivot]
        pivot_value = augmented[pivot][pivot]
        if abs(pivot_value) < 1e-12:
            raise ValueError("Covariate matrix is rank-deficient")
        for column in range(pivot, size + 1):
            augmented[pivot][column] /= pivot_value
        for row in range(size):
            if row == pivot:
                continue
            factor = augmented[row][pivot]
            for column in range(pivot, size + 1):
                augmented[row][column] -= factor * augmented[pivot][column]
    return [row[-1] for row in augmented]


def validate_covariate_timing(
    covariate_timestamps: Sequence[object],
    experiment_start_date: object,
) -> bool:
    start = datetime.fromisoformat(str(experiment_start_date).replace("Z", "+00:00"))
    violations = [
        str(timestamp)
        for timestamp in covariate_timestamps
        if datetime.fromisoformat(str(timestamp).replace("Z", "+00:00")) >= start
    ]
    if violations:
        raise ValueError(f"Found post-treatment covariates: {violations[:5]}")
    return True


def estimate_theta(
    metric_values: Sequence[float],
    covariate_values: Sequence[float],
    winsorize_percentile: Optional[float] = None,
) -> Tuple[float, float]:
    if len(metric_values) != len(covariate_values):
        raise ValueError("metric_values and covariate_values must have the same length")
    metric = _winsorize(metric_values, winsorize_percentile)
    covariate = _winsorize(covariate_values, winsorize_percentile)
    covariate_variance = _variance(covariate)
    if covariate_variance <= 0:
        raise ValueError("covariate must have non-zero variance")
    metric_mean = statistics.fmean(metric)
    covariate_mean = statistics.fmean(covariate)
    covariance = sum((m - metric_mean) * (c - covariate_mean) for m, c in zip(metric, covariate)) / max(
        len(metric) - 1, 1
    )
    theta = covariance / covariate_variance
    correlation = covariance / math.sqrt(max(_variance(metric) * covariate_variance, 1e-12))
    return theta, correlation


def compute_adjusted_metric(
    metric_values: Sequence[float],
    covariate_values: Sequence[float],
    theta: float,
    covariate_mean: float,
) -> list[float]:
    return [
        float(metric) - theta * (float(covariate) - covariate_mean)
        for metric, covariate in zip(metric_values, covariate_values)
    ]


def estimate_theta_multivariate(
    metric_values: Sequence[float],
    covariate_matrix: Sequence[Sequence[float]],
    winsorize_percentile: Optional[float] = None,
) -> list[float]:
    metric = _winsorize(metric_values, winsorize_percentile)
    matrix = [[float(value) for value in row] for row in covariate_matrix]
    if not matrix or len(matrix) != len(metric):
        raise ValueError("covariate_matrix must align with metric_values")
    for column_index in range(len(matrix[0])):
        column = _winsorize([row[column_index] for row in matrix], winsorize_percentile)
        for row_index, value in enumerate(column):
            matrix[row_index][column_index] = value
    xtx = [[0.0 for _ in range(len(matrix[0]))] for _ in range(len(matrix[0]))]
    xty = [0.0 for _ in range(len(matrix[0]))]
    for row, target in zip(matrix, metric):
        for i in range(len(row)):
            xty[i] += row[i] * target
            for j in range(len(row)):
                xtx[i][j] += row[i] * row[j]
    return _solve_linear_system(xtx, xty)


def run_cuped_adjustment(
    experiment_data: Dict[str, Dict[str, Sequence[float]]],
    covariate_data: Dict[str, Sequence[float]],
    metric_covariate_mapping: Dict[str, str],
    winsorize_percentile: Optional[float] = 0.01,
) -> List[CUPEDResult]:
    results: list[CUPEDResult] = []
    for metric_name, variants in experiment_data.items():
        covariate_name = metric_covariate_mapping[metric_name]
        pooled_metric = []
        pooled_covariate = []
        adjusted_values: dict[str, list[float]] = {}
        for variant_name, metric_values in variants.items():
            covariates = covariate_data[variant_name]
            pooled_metric.extend(float(value) for value in metric_values)
            pooled_covariate.extend(float(value) for value in covariates)
        theta, correlation = estimate_theta(pooled_metric, pooled_covariate, winsorize_percentile=winsorize_percentile)
        covariate_mean = statistics.fmean(pooled_covariate)
        for variant_name, metric_values in variants.items():
            adjusted_values[variant_name] = compute_adjusted_metric(
                metric_values,
                covariate_data[variant_name],
                theta,
                covariate_mean,
            )
        variance_original = _variance(pooled_metric)
        adjusted_pooled = [value for values in adjusted_values.values() for value in values]
        variance_adjusted = _variance(adjusted_pooled)
        reduction = ((variance_original - variance_adjusted) / variance_original * 100) if variance_original else 0.0
        results.append(
            CUPEDResult(
                metric_name=metric_name,
                covariate_name=covariate_name,
                theta=theta,
                correlation=correlation,
                variance_original=variance_original,
                variance_adjusted=variance_adjusted,
                variance_reduction_pct=reduction,
                adjusted_values=adjusted_values,
            )
        )
    return results
