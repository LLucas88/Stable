"""Channel-level contribution decomposition from the lightweight MMM fallback."""

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
    position = (len(ordered) - 1) * q
    low = int(position)
    high = min(low + 1, len(ordered) - 1)
    fraction = position - low
    return ordered[low] + (ordered[high] - ordered[low]) * fraction


def load_fitted_model(models_dir: Path) -> LightweightMMM:
    return LightweightMMM.load(models_dir / "mmm_fitted.nc")


def compute_channel_contributions(
    mmm: LightweightMMM,
    credible_interval: float = 0.90,
) -> dict[str, dict[str, Any]]:
    lower_q = (1.0 - credible_interval) / 2.0
    upper_q = 1.0 - lower_q
    contributions = mmm.compute_channel_contributions()
    total_mean = sum(sum(values) for values in contributions.values()) + sum(mmm.compute_baseline())
    results: dict[str, dict[str, Any]] = {}
    for channel, values in contributions.items():
        draws = mmm.posterior_samples.get(channel, [mmm.coefficients.get(channel, 0.0)])
        sampled_totals = [
            sum(value * draw / (mmm.coefficients.get(channel, 1.0) or 1.0) for value in values) for draw in draws
        ]
        results[channel] = {
            "mean_contribution": statistics.fmean(values) if values else 0.0,
            "median_contribution": statistics.median(values) if values else 0.0,
            "ci_lower": _quantile(sampled_totals, lower_q),
            "ci_upper": _quantile(sampled_totals, upper_q),
            "share_of_total_mean": (sum(values) / total_mean) if total_mean else 0.0,
            "time_series": {
                "dates": mmm.dates,
                "mean": values,
                "ci_lower": [value * 0.9 for value in values],
                "ci_upper": [value * 1.1 for value in values],
            },
        }
    return results


def compute_baseline_contribution(
    mmm: LightweightMMM,
    credible_interval: float = 0.90,
) -> dict[str, Any]:
    baseline = mmm.compute_baseline()
    lower_q = (1.0 - credible_interval) / 2.0
    upper_q = 1.0 - lower_q
    intercept_draws = mmm.posterior_samples.get("intercept", [mmm.intercept])
    baseline_totals = [draw * len(baseline) for draw in intercept_draws]
    total_mean = sum(mmm.observed_y) or 1.0
    return {
        "mean_contribution": statistics.fmean(baseline) if baseline else 0.0,
        "ci_lower": _quantile(baseline_totals, lower_q),
        "ci_upper": _quantile(baseline_totals, upper_q),
        "share_of_total_mean": (sum(baseline) / total_mean) if total_mean else 0.0,
        "components": {
            "intercept": mmm.intercept,
            "seasonality": sum(
                mmm.coefficients.get(column, 0.0)
                for column in mmm.control_columns
                if str(column).startswith(("sin_", "cos_"))
            ),
            "trend": mmm.coefficients.get("trend", 0.0),
            "other_controls": sum(
                mmm.coefficients.get(column, 0.0)
                for column in mmm.control_columns
                if column not in {"trend"} and not str(column).startswith(("sin_", "cos_"))
            ),
        },
    }


def validate_decomposition(
    channel_contributions: dict[str, dict[str, Any]],
    baseline_contribution: dict[str, Any],
    observed_total: float,
    tolerance: float = 0.02,
) -> dict[str, Any]:
    total_contributions = (
        sum(item["mean_contribution"] for item in channel_contributions.values())
        + baseline_contribution["mean_contribution"]
    )
    relative_difference = abs(total_contributions - observed_total) / observed_total if observed_total else 0.0
    return {
        "total_contributions": total_contributions,
        "observed_total": observed_total,
        "relative_difference": relative_difference,
        "within_tolerance": relative_difference <= tolerance,
    }


def compute_contribution_summary(
    channel_contributions: dict[str, dict[str, Any]],
    baseline_contribution: dict[str, Any],
) -> Any:
    rows = [
        {
            "component": "baseline",
            "contribution_mean": baseline_contribution["mean_contribution"],
            "ci_lower": baseline_contribution["ci_lower"],
            "ci_upper": baseline_contribution["ci_upper"],
            "share_pct": baseline_contribution["share_of_total_mean"],
        }
    ]
    for channel, details in channel_contributions.items():
        rows.append(
            {
                "component": channel,
                "contribution_mean": details["mean_contribution"],
                "ci_lower": details["ci_lower"],
                "ci_upper": details["ci_upper"],
                "share_pct": details["share_of_total_mean"],
            }
        )
    rows.sort(key=lambda row: row["contribution_mean"], reverse=True)
    cumulative = 0.0
    for row in rows:
        cumulative += row["contribution_mean"]
        row["cumulative"] = cumulative
    rows.append(
        {
            "component": "total",
            "contribution_mean": cumulative,
            "ci_lower": None,
            "ci_upper": None,
            "share_pct": 1.0,
            "cumulative": cumulative,
        }
    )
    if pd is None:
        return rows
    return pd.DataFrame(rows)


def compute_roi_by_channel(
    channel_contributions: dict[str, dict[str, Any]],
    channel_spend: dict[str, float],
    credible_interval: float = 0.90,
) -> dict[str, dict[str, float]]:
    del credible_interval
    roi: dict[str, dict[str, float]] = {}
    for channel, contribution in channel_contributions.items():
        spend = float(channel_spend.get(channel, 0.0))
        if spend <= 0:
            roi[channel] = {
                "total_spend": 0.0,
                "roas_mean": 0.0,
                "roas_ci_lower": 0.0,
                "roas_ci_upper": 0.0,
                "roi_pct_mean": 0.0,
                "roi_pct_ci_lower": 0.0,
                "roi_pct_ci_upper": 0.0,
            }
            continue
        roas_mean = contribution["mean_contribution"] / spend
        roi_pct_mean = (contribution["mean_contribution"] - spend) / spend
        roi[channel] = {
            "total_spend": spend,
            "roas_mean": roas_mean,
            "roas_ci_lower": contribution["ci_lower"] / spend,
            "roas_ci_upper": contribution["ci_upper"] / spend,
            "roi_pct_mean": roi_pct_mean,
            "roi_pct_ci_lower": (contribution["ci_lower"] - spend) / spend,
            "roi_pct_ci_upper": (contribution["ci_upper"] - spend) / spend,
        }
    return roi


def save_contributions(
    channel_contributions: dict[str, dict[str, Any]],
    baseline_contribution: dict[str, Any],
    validation: dict[str, Any],
    roi_by_channel: dict[str, dict[str, float]],
    analysis_dir: Path,
) -> None:
    analysis_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "channel_contributions": channel_contributions,
        "baseline_contribution": baseline_contribution,
        "validation": validation,
        "roi_by_channel": roi_by_channel,
    }
    (analysis_dir / "mmm_channel_contributions.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Compute MMM channel contributions")
    parser.add_argument("--credible-interval", type=float, default=0.90, help="Credible interval width (default 0.90)")
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output file path (default: workspace/analysis/mmm_channel_contributions.json)",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    mmm = load_fitted_model(MODELS_DIR)
    channel_contributions = compute_channel_contributions(mmm, credible_interval=args.credible_interval)
    baseline = compute_baseline_contribution(mmm, credible_interval=args.credible_interval)
    validation = validate_decomposition(channel_contributions, baseline, observed_total=sum(mmm.observed_y))
    roi = compute_roi_by_channel(
        channel_contributions, mmm.training_spend_totals, credible_interval=args.credible_interval
    )
    save_contributions(channel_contributions, baseline, validation, roi, ANALYSIS_DIR)
    if args.output:
        Path(args.output).write_text(
            (ANALYSIS_DIR / "mmm_channel_contributions.json").read_text(encoding="utf-8"), encoding="utf-8"
        )


if __name__ == "__main__":
    main()
