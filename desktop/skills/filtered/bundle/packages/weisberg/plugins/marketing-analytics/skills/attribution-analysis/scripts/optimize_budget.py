"""Constrained budget optimization using the lightweight MMM fallback."""

from __future__ import annotations

import argparse
import json
import logging
import statistics
from pathlib import Path
from typing import Any

try:
    import pandas as pd
except ModuleNotFoundError:  # pragma: no cover
    pd = None  # type: ignore[assignment]

from _lightweight_mmm import LightweightMMM

logger = logging.getLogger(__name__)

WORKSPACE_DIR = Path("workspace")
MODELS_DIR = WORKSPACE_DIR / "models"
ANALYSIS_DIR = WORKSPACE_DIR / "analysis"


def _quantile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * q
    low = int(position)
    high = min(low + 1, len(ordered) - 1)
    fraction = position - low
    return ordered[low] + (ordered[high] - ordered[low]) * fraction


def load_fitted_model(models_dir: Path) -> LightweightMMM:
    model_path = models_dir / "mmm_fitted.nc"
    if not model_path.exists():
        raise FileNotFoundError(f"No fitted model found at {model_path}")
    return LightweightMMM.load(model_path)


def extract_response_curves(
    mmm: LightweightMMM,
    channel_columns: list[str],
    spend_range: dict[str, tuple[float, float]] | None = None,
    n_points: int = 100,
    n_posterior_samples: int = 500,
) -> dict[str, list[list[float]]]:
    curves: dict[str, list[list[float]]] = {}
    for channel in channel_columns:
        bounds = spend_range.get(channel) if spend_range else None
        maximum = (
            bounds[1]
            if bounds
            else max(mmm.training_spend_totals.get(channel, 0.0) * 0.5, mmm.channel_scales.get(channel, 1.0) * 2)
        )
        spends = [maximum * index / max(n_points - 1, 1) for index in range(n_points)]
        curves[channel] = mmm.response_curve(channel, spends, n_samples=n_posterior_samples)
    return curves


def compute_marginal_roas(
    mmm: LightweightMMM,
    current_spend: dict[str, float],
    channel_columns: list[str],
    delta: float = 1000.0,
    n_posterior_samples: int = 500,
) -> dict[str, dict[str, float]]:
    payload: dict[str, dict[str, float]] = {}
    for channel in channel_columns:
        base = current_spend.get(channel, 0.0)
        curves = mmm.response_curve(channel, [base, base + delta], n_samples=n_posterior_samples)
        marginals = [max((sample[1] - sample[0]) / delta, 0.0) for sample in curves]
        average_roas = (mmm.predict_allocation({channel: base}) / base) if base > 0 else 0.0
        payload[channel] = {
            "marginal_roas_mean": statistics.fmean(marginals) if marginals else 0.0,
            "marginal_roas_median": statistics.median(marginals) if marginals else 0.0,
            "marginal_roas_ci_lower": _quantile(marginals, 0.05),
            "marginal_roas_ci_upper": _quantile(marginals, 0.95),
            "near_saturation": (statistics.fmean(marginals) if marginals else 0.0) < average_roas,
        }
    return payload


def optimize_allocation(
    mmm: LightweightMMM,
    total_budget: float,
    channel_columns: list[str],
    budget_bounds: dict[str, tuple[float, float]] | None = None,
    n_posterior_samples: int = 200,
    method: str = "SLSQP",
) -> dict[str, Any]:
    del method
    budget_bounds = budget_bounds or {channel: (0.0, total_budget) for channel in channel_columns}
    allocation = {channel: max(budget_bounds[channel][0], 0.0) for channel in channel_columns}
    allocated = sum(allocation.values())
    remaining = max(total_budget - allocated, 0.0)
    step = max(total_budget / 100.0, 1.0)

    while remaining > 1e-6:
        eligible = []
        for channel in channel_columns:
            lower, upper = budget_bounds[channel]
            if allocation[channel] + 1e-6 >= upper:
                continue
            current = mmm.response_value(channel, allocation[channel])
            proposed = mmm.response_value(channel, min(allocation[channel] + step, upper))
            gain = proposed - current
            eligible.append((gain, channel))
        if not eligible:
            break
        _, best_channel = max(eligible, key=lambda item: item[0])
        increment = min(step, remaining, budget_bounds[best_channel][1] - allocation[best_channel])
        allocation[best_channel] += increment
        remaining -= increment

    samples = []
    for sample_index in range(max(1, min(n_posterior_samples, len(mmm.posterior_samples.get("intercept", [0.0]))))):
        outcome = mmm.posterior_samples.get("intercept", [mmm.intercept])[sample_index]
        for channel in channel_columns:
            draws = mmm.posterior_samples.get(channel, [mmm.coefficients.get(channel, 0.0)])
            outcome += mmm.response_value(channel, allocation[channel], coefficient=draws[sample_index % len(draws)])
        samples.append(outcome)

    current_allocation = {channel: float(mmm.training_allocation.get(channel, 0.0)) for channel in channel_columns}
    current_outcome = mmm.predict_allocation(current_allocation)
    expected_outcome_mean = statistics.fmean(samples) if samples else 0.0

    channel_details = {}
    optimal_marginal = compute_marginal_roas(mmm, allocation, channel_columns, n_posterior_samples=n_posterior_samples)
    for channel in channel_columns:
        current_value = current_allocation.get(channel, 0.0)
        optimal_value = allocation[channel]
        change_pct = ((optimal_value - current_value) / current_value) if current_value else 0.0
        channel_details[channel] = {
            "optimal_spend": optimal_value,
            "current_spend": current_value,
            "change_pct": change_pct,
            "marginal_roas_at_optimal": optimal_marginal[channel]["marginal_roas_mean"],
        }

    return {
        "optimal_allocation": allocation,
        "expected_outcome_mean": expected_outcome_mean,
        "expected_outcome_ci": [_quantile(samples, 0.05), _quantile(samples, 0.95)],
        "current_allocation": current_allocation,
        "expected_lift_vs_current": expected_outcome_mean - current_outcome,
        "channel_details": channel_details,
    }


def run_scenario_analysis(
    mmm: LightweightMMM,
    scenarios: list[dict[str, Any]],
    channel_columns: list[str],
    n_posterior_samples: int = 500,
) -> list[dict[str, Any]]:
    baseline = mmm.predict_allocation(mmm.training_allocation)
    results: list[dict[str, Any]] = []
    for scenario in scenarios:
        allocation = {channel: float(scenario.get("allocation", {}).get(channel, 0.0)) for channel in channel_columns}
        samples = []
        for sample_index in range(max(1, min(n_posterior_samples, len(mmm.posterior_samples.get("intercept", [0.0]))))):
            total = mmm.posterior_samples.get("intercept", [mmm.intercept])[sample_index]
            channel_contributions = {}
            for channel in channel_columns:
                draws = mmm.posterior_samples.get(channel, [mmm.coefficients.get(channel, 0.0)])
                contribution = mmm.response_value(
                    channel, allocation[channel], coefficient=draws[sample_index % len(draws)]
                )
                channel_contributions[channel] = contribution
                total += contribution
            samples.append((total, channel_contributions))
        totals = [sample[0] for sample in samples]
        mean_contributions = {
            channel: statistics.fmean([sample[1][channel] for sample in samples]) if samples else 0.0
            for channel in channel_columns
        }
        mean_total = statistics.fmean(totals) if totals else 0.0
        results.append(
            {
                "name": scenario.get("name", "scenario"),
                "description": scenario.get("description", ""),
                "allocation": allocation,
                "total_spend": sum(allocation.values()),
                "expected_outcome_mean": mean_total,
                "expected_outcome_ci": [_quantile(totals, 0.05), _quantile(totals, 0.95)],
                "channel_contributions": mean_contributions,
                "vs_current_lift_pct": ((mean_total - baseline) / baseline) if baseline else 0.0,
            }
        )
    return results


def generate_reallocation_table(
    optimization_result: dict[str, Any],
    scenario_results: list[dict[str, Any]],
) -> Any:
    rows: list[dict[str, Any]] = []
    current = optimization_result["current_allocation"]
    for channel, details in optimization_result["channel_details"].items():
        rows.append(
            {
                "scenario_name": "optimal",
                "channel": channel,
                "current_spend": current.get(channel, 0.0),
                "recommended_spend": details["optimal_spend"],
                "change_pct": details["change_pct"],
                "expected_outcome": optimization_result["expected_outcome_mean"],
                "lift_pct": optimization_result["expected_lift_vs_current"],
            }
        )
    for scenario in scenario_results:
        for channel, spend in scenario["allocation"].items():
            current_spend = current.get(channel, 0.0)
            rows.append(
                {
                    "scenario_name": scenario["name"],
                    "channel": channel,
                    "current_spend": current_spend,
                    "recommended_spend": spend,
                    "change_pct": ((spend - current_spend) / current_spend) if current_spend else 0.0,
                    "expected_outcome": scenario["expected_outcome_mean"],
                    "lift_pct": scenario["vs_current_lift_pct"],
                }
            )
    rows.sort(key=lambda row: row["lift_pct"], reverse=True)
    if pd is None:
        return rows
    return pd.DataFrame(rows)


def save_optimization_results(
    optimization_result: dict[str, Any],
    scenario_results: list[dict[str, Any]],
    marginal_roas: dict[str, dict[str, float]],
    analysis_dir: Path,
) -> None:
    analysis_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "optimization_result": optimization_result,
        "scenario_results": scenario_results,
        "marginal_roas": marginal_roas,
    }
    (analysis_dir / "mmm_budget_optimization.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Optimize marketing budget allocation")
    parser.add_argument("--total-budget", type=float, required=True, help="Total budget to allocate")
    parser.add_argument("--constraints", type=str, default=None, help="Path to JSON file with per-channel bounds")
    parser.add_argument("--scenario", type=str, default=None, help="Path to JSON file with scenario definitions")
    parser.add_argument("--n-samples", type=int, default=500, help="Number of posterior samples to use")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    mmm = load_fitted_model(MODELS_DIR)
    constraints = json.loads(Path(args.constraints).read_text(encoding="utf-8")) if args.constraints else None
    scenarios = json.loads(Path(args.scenario).read_text(encoding="utf-8")) if args.scenario else []
    marginal_roas = compute_marginal_roas(
        mmm, mmm.training_allocation, mmm.channel_columns, n_posterior_samples=args.n_samples
    )
    optimization = optimize_allocation(
        mmm,
        total_budget=args.total_budget,
        channel_columns=mmm.channel_columns,
        budget_bounds=constraints,
        n_posterior_samples=args.n_samples,
    )
    scenario_results = (
        run_scenario_analysis(mmm, scenarios, mmm.channel_columns, n_posterior_samples=args.n_samples)
        if scenarios
        else []
    )
    _ = generate_reallocation_table(optimization, scenario_results)
    save_optimization_results(optimization, scenario_results, marginal_roas, ANALYSIS_DIR)


if __name__ == "__main__":
    main()
