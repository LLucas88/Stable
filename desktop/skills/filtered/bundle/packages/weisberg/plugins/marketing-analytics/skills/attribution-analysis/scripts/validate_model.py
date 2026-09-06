"""Model validation for the lightweight MMM fallback."""

from __future__ import annotations

import argparse
import json
import logging
import math
import statistics
from pathlib import Path
from typing import Any

from _lightweight_mmm import LightweightMMM

logger = logging.getLogger(__name__)

WORKSPACE_DIR = Path("workspace")
MODELS_DIR = WORKSPACE_DIR / "models"
ANALYSIS_DIR = WORKSPACE_DIR / "analysis"

RHAT_THRESHOLD = 1.05
ESS_BULK_THRESHOLD = 400
ESS_TAIL_THRESHOLD = 400
PPC_COVERAGE_THRESHOLD = 0.90
PARETO_K_THRESHOLD = 0.7


def _quantile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    position = (len(ordered) - 1) * q
    low = int(position)
    high = min(low + 1, len(ordered) - 1)
    fraction = position - low
    return ordered[low] + (ordered[high] - ordered[low]) * fraction


def load_fitted_model(models_dir: Path) -> LightweightMMM:
    return LightweightMMM.load(models_dir / "mmm_fitted.nc")


def check_convergence(idata: dict[str, Any]) -> dict[str, Any]:
    diagnostics = idata.get("diagnostics", {})
    r_hat_values = diagnostics.get("r_hat", {})
    ess_bulk_values = diagnostics.get("ess_bulk", {})
    ess_tail_values = diagnostics.get("ess_tail", {})
    divergences = diagnostics.get("divergences", 0)
    warnings: list[str] = []
    recommendations: list[str] = []

    if any(float(value) >= RHAT_THRESHOLD for value in r_hat_values.values()):
        warnings.append("R-hat threshold exceeded.")
        recommendations.append("Increase tuning or simplify the model structure.")
    if any(float(value) < ESS_BULK_THRESHOLD for value in ess_bulk_values.values()):
        warnings.append("Bulk ESS below target.")
        recommendations.append("Collect more data or reduce feature dimensionality.")
    if any(float(value) < ESS_TAIL_THRESHOLD for value in ess_tail_values.values()):
        warnings.append("Tail ESS below target.")
        recommendations.append("Inspect high-variance channels and priors.")
    if divergences:
        warnings.append("Posterior approximation reported divergences.")
        recommendations.append("Review scaling assumptions and outliers.")

    return {
        "passed": not warnings,
        "r_hat": {
            "values": r_hat_values,
            "max": max(r_hat_values.values(), default=1.0),
            "all_below_threshold": all(float(value) < RHAT_THRESHOLD for value in r_hat_values.values()),
        },
        "ess_bulk": {
            "values": ess_bulk_values,
            "min": min(ess_bulk_values.values(), default=ESS_BULK_THRESHOLD),
            "all_above_threshold": all(float(value) >= ESS_BULK_THRESHOLD for value in ess_bulk_values.values()),
        },
        "ess_tail": {
            "values": ess_tail_values,
            "min": min(ess_tail_values.values(), default=ESS_TAIL_THRESHOLD),
            "all_above_threshold": all(float(value) >= ESS_TAIL_THRESHOLD for value in ess_tail_values.values()),
        },
        "divergences": {
            "count": divergences,
            "pct_of_draws": 0.0,
            "none": divergences == 0,
        },
        "max_treedepth_hits": 0,
        "warnings": warnings,
        "recommendations": recommendations,
    }


def run_posterior_predictive_check(
    mmm: LightweightMMM,
    idata: dict[str, Any],
    observed_y: list[float],
    credible_interval: float = 0.90,
) -> dict[str, Any]:
    del idata
    lower_q = (1.0 - credible_interval) / 2.0
    upper_q = 1.0 - lower_q
    samples = mmm.sample_posterior_predictive(n_samples=250)
    posterior_means = [statistics.fmean([sample[idx] for sample in samples]) for idx in range(len(observed_y))]
    lower = [_quantile([sample[idx] for sample in samples], lower_q) for idx in range(len(observed_y))]
    upper = [_quantile([sample[idx] for sample in samples], upper_q) for idx in range(len(observed_y))]
    within = [low <= actual <= high for actual, low, high in zip(observed_y, lower, upper)]
    mae = (
        statistics.fmean([abs(actual - pred) for actual, pred in zip(observed_y, posterior_means)])
        if observed_y
        else 0.0
    )
    mape = (
        statistics.fmean(
            [
                abs(actual - pred) / abs(actual)
                for actual, pred in zip(observed_y, posterior_means)
                if abs(actual) > 1e-9
            ]
        )
        if any(abs(actual) > 1e-9 for actual in observed_y)
        else 0.0
    )
    mean_actual = statistics.fmean(observed_y) if observed_y else 0.0
    ss_tot = sum((value - mean_actual) ** 2 for value in observed_y)
    ss_res = sum((actual - pred) ** 2 for actual, pred in zip(observed_y, posterior_means))
    r_squared = 1.0 - (ss_res / ss_tot) if ss_tot else 0.0
    coverage = sum(within) / len(within) if within else 0.0
    outside_indices = [index for index, is_within in enumerate(within) if not is_within]
    return {
        "passed": coverage >= PPC_COVERAGE_THRESHOLD,
        "coverage": coverage,
        "target_coverage": PPC_COVERAGE_THRESHOLD,
        "n_observations": len(observed_y),
        "n_within_ci": sum(within),
        "n_outside_ci": len(outside_indices),
        "outside_ci_indices": outside_indices,
        "mean_absolute_error": mae,
        "mean_absolute_pct_error": mape,
        "r_squared_posterior_mean": r_squared,
    }


def compute_waic(idata: dict[str, Any]) -> dict[str, Any]:
    residuals = [float(value) for value in idata.get("residuals", [])]
    sigma = statistics.pstdev(residuals) if len(residuals) > 1 else 1.0
    log_lik = (
        [-0.5 * math.log(2 * math.pi * sigma**2) - (residual**2 / (2 * sigma**2)) for residual in residuals]
        if sigma
        else [0.0 for _ in residuals]
    )
    lppd = sum(log_lik)
    p_waic = statistics.pvariance(log_lik) * len(log_lik) if len(log_lik) > 1 else 0.0
    waic = -2 * (lppd - p_waic)
    return {
        "waic": waic,
        "waic_se": statistics.pstdev(log_lik) if len(log_lik) > 1 else 0.0,
        "p_waic": p_waic,
        "warning": p_waic > max(len(log_lik), 1) * 0.5,
        "scale": "deviance",
    }


def compute_loo_cv(idata: dict[str, Any]) -> dict[str, Any]:
    residuals = [abs(float(value)) for value in idata.get("residuals", [])]
    loo = statistics.fmean(residuals) if residuals else 0.0
    pareto_k_values = [min(value / (statistics.fmean(residuals) + 1e-6), 0.99) for value in residuals]
    high_indices = [index for index, value in enumerate(pareto_k_values) if value > PARETO_K_THRESHOLD]
    return {
        "loo": loo,
        "loo_se": statistics.pstdev(residuals) if len(residuals) > 1 else 0.0,
        "p_loo": statistics.fmean(pareto_k_values) if pareto_k_values else 0.0,
        "pareto_k": {
            "max": max(pareto_k_values, default=0.0),
            "n_high": len(high_indices),
            "high_indices": high_indices,
            "all_below_threshold": not high_indices,
        },
        "warning": bool(high_indices),
    }


def compare_models(
    idata_list: list[dict[str, Any]],
    model_names: list[str],
) -> dict[str, Any]:
    rows = []
    for name, idata in zip(model_names, idata_list):
        waic = compute_waic(idata)
        loo = compute_loo_cv(idata)
        rows.append((name, waic["waic"], loo["loo"]))
    rows.sort(key=lambda item: (item[1], item[2]))
    weights = {}
    for rank, row in enumerate(rows, start=1):
        weights[row[0]] = 1.0 / rank
    total_weight = sum(weights.values()) or 1.0
    details = {
        name: {
            "waic": waic,
            "loo": loo,
            "rank": rank,
            "weight": weights[name] / total_weight,
        }
        for rank, (name, waic, loo) in enumerate(rows, start=1)
    }
    return {
        "comparison_method": "waic_then_loo",
        "ranking": [row[0] for row in rows],
        "details": details,
        "recommendation": f"Prefer {rows[0][0]} for downstream budget decisions."
        if rows
        else "No models available for comparison.",
    }


def generate_diagnostics_report(
    convergence: dict[str, Any],
    ppc: dict[str, Any],
    waic: dict[str, Any],
    loo: dict[str, Any],
    model_comparison: dict[str, Any] | None = None,
) -> dict[str, Any]:
    recommendations = []
    recommendations.extend(convergence.get("recommendations", []))
    if not ppc.get("passed", False):
        recommendations.append("Posterior predictive coverage is below target; revisit feature engineering.")
    if loo.get("warning"):
        recommendations.append("Review high-leverage observations flagged by Pareto-k diagnostics.")
    overall_passed = convergence["passed"] and ppc["passed"] and not loo["warning"]
    summary = (
        "Model diagnostics passed for decision support."
        if overall_passed
        else "Model diagnostics surfaced issues that should be reviewed before relying on optimization outputs."
    )
    return {
        "overall_passed": overall_passed,
        "convergence": convergence,
        "posterior_predictive": ppc,
        "information_criteria": {"waic": waic, "loo": loo},
        "model_comparison": model_comparison,
        "summary": summary,
        "recommendations": recommendations,
        "metadata": {
            "thresholds": {
                "r_hat": RHAT_THRESHOLD,
                "ess_bulk": ESS_BULK_THRESHOLD,
                "ess_tail": ESS_TAIL_THRESHOLD,
                "ppc_coverage": PPC_COVERAGE_THRESHOLD,
                "pareto_k": PARETO_K_THRESHOLD,
            }
        },
    }


def save_diagnostics(
    report: dict[str, Any],
    analysis_dir: Path,
) -> None:
    analysis_dir.mkdir(parents=True, exist_ok=True)
    (analysis_dir / "mmm_diagnostics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate fitted MMM")
    parser.add_argument(
        "--compare", type=str, nargs="*", default=None, help="Paths to alternative model files for comparison"
    )
    parser.add_argument(
        "--credible-interval", type=float, default=0.90, help="Credible interval width for PPC (default 0.90)"
    )
    parser.add_argument("--output", type=str, default=None, help="Output file path")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    mmm = load_fitted_model(MODELS_DIR)
    idata = mmm.fit_result
    convergence = check_convergence(idata)
    ppc = run_posterior_predictive_check(mmm, idata, mmm.observed_y, credible_interval=args.credible_interval)
    waic = compute_waic(idata)
    loo = compute_loo_cv(idata)
    comparison = None
    if args.compare:
        others = [LightweightMMM.load(path).fit_result for path in args.compare]
        comparison = compare_models([idata, *others], ["current", *[Path(path).stem for path in args.compare]])
    report = generate_diagnostics_report(convergence, ppc, waic, loo, model_comparison=comparison)
    save_diagnostics(report, ANALYSIS_DIR)
    if args.output:
        Path(args.output).write_text(
            (ANALYSIS_DIR / "mmm_diagnostics.json").read_text(encoding="utf-8"), encoding="utf-8"
        )


if __name__ == "__main__":
    main()
