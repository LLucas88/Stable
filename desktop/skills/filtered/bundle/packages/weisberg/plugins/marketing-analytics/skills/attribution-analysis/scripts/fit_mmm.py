"""Core MMM fitting pipeline with a lightweight fallback model."""

from __future__ import annotations

import argparse
import json
import logging
import math
from pathlib import Path
from typing import Any

try:
    import pandas as pd
except ModuleNotFoundError:  # pragma: no cover - dependency optional in this workspace
    pd = None  # type: ignore[assignment]

from _lightweight_mmm import LightweightMMM

logger = logging.getLogger(__name__)

DEFAULT_CONFIG = {
    "draws": 400,
    "chains": 4,
    "target_accept": 0.9,
    "random_seed": 42,
    "adstock": "geometric",
    "saturation": "logistic",
    "adstock_max_lag": 8,
    "yearly_seasonality": 6,
    "data_grain": "weekly",
    "gradient_iterations": 2500,
    "learning_rate": 0.03,
    "ridge_alpha": 0.01,
}

WORKSPACE_DIR = Path("workspace")
RAW_DIR = WORKSPACE_DIR / "raw"
ANALYSIS_DIR = WORKSPACE_DIR / "analysis"
MODELS_DIR = WORKSPACE_DIR / "models"


def _require_pandas() -> Any:
    if pd is None:
        raise ImportError("pandas is required for the MMM data pipeline")
    return pd


def load_spend_data(raw_dir: Path) -> Any:
    pandas = _require_pandas()
    files = sorted(raw_dir.glob("campaign_spend_*.csv"))
    if not files:
        raise FileNotFoundError(f"No campaign spend files found in {raw_dir}")

    frames: list[Any] = []
    for file_path in files:
        frame = pandas.read_csv(file_path)
        if "date" not in frame.columns or "spend" not in frame.columns:
            raise ValueError(f"{file_path.name} must include at least date and spend columns")
        if "channel" not in frame.columns:
            frame["channel"] = file_path.stem.removeprefix("campaign_spend_")
        frame["date"] = pandas.to_datetime(frame["date"])
        for optional_column in ("impressions", "clicks", "campaign_id"):
            if optional_column not in frame.columns:
                frame[optional_column] = 0
        frames.append(frame[["date", "channel", "spend", "impressions", "clicks", "campaign_id"]])

    spend_df = pandas.concat(frames, ignore_index=True).drop_duplicates()
    spend_df["spend"] = pandas.to_numeric(spend_df["spend"], errors="coerce").fillna(0.0)
    spend_df = spend_df.sort_values(["date", "channel"]).reset_index(drop=True)
    return spend_df


def load_conversions(raw_dir: Path) -> Any:
    pandas = _require_pandas()
    file_path = raw_dir / "conversions.csv"
    if not file_path.exists():
        raise FileNotFoundError(f"Missing conversions file at {file_path}")
    frame = pandas.read_csv(file_path)
    if "date" not in frame.columns:
        raise ValueError("conversions.csv must include a date column")
    if "conversions" not in frame.columns and "revenue" not in frame.columns:
        raise ValueError("conversions.csv must include conversions or revenue")
    frame["date"] = pandas.to_datetime(frame["date"])
    for column in ("conversions", "revenue"):
        if column in frame.columns:
            frame[column] = pandas.to_numeric(frame[column], errors="coerce").fillna(0.0)
    return frame.sort_values("date").reset_index(drop=True)


def load_external_factors(raw_dir: Path) -> Any | None:
    pandas = _require_pandas()
    file_path = raw_dir / "external_factors.csv"
    if not file_path.exists():
        return None
    frame = pandas.read_csv(file_path)
    frame["date"] = pandas.to_datetime(frame["date"])
    if {"factor_name", "value"}.issubset(frame.columns):
        frame = frame.pivot_table(index="date", columns="factor_name", values="value", aggfunc="mean").reset_index()
    return frame.sort_values("date").reset_index(drop=True)


def validate_data(
    spend_df: Any,
    conversions_df: Any,
    external_df: Any | None = None,
) -> dict[str, Any]:
    pandas = _require_pandas()
    warnings: list[str] = []
    errors: list[str] = []
    channels = sorted(spend_df["channel"].astype(str).unique().tolist())
    spend_dates = pandas.Index(spend_df["date"].drop_duplicates().sort_values())
    conversion_dates = pandas.Index(conversions_df["date"].drop_duplicates().sort_values())
    common_dates = spend_dates.intersection(conversion_dates)
    if common_dates.empty:
        errors.append("Spend and conversion data do not overlap on any dates.")
    diffs = (
        common_dates.to_series().diff().dropna().dt.days if len(common_dates) > 1 else pandas.Series(dtype="float64")
    )
    median_diff = diffs.median() if not diffs.empty else 1
    grain = "weekly" if median_diff and median_diff >= 7 else "daily"

    if (spend_df["spend"] < 0).any():
        errors.append("Spend data contains negative values.")
    if "conversions" in conversions_df.columns and (conversions_df["conversions"] < 0).any():
        errors.append("Conversion data contains negative values.")

    missing_periods: list[str] = []
    if not common_dates.empty:
        frequency = "W" if grain == "weekly" else "D"
        expected = pandas.date_range(common_dates.min(), common_dates.max(), freq=frequency)
        missing_periods = [str(value.date()) for value in expected.difference(common_dates)]
        if missing_periods:
            warnings.append(f"Detected {len(missing_periods)} missing {grain} period(s).")

    if external_df is not None:
        external_dates = pandas.Index(external_df["date"].drop_duplicates().sort_values())
        if not common_dates.intersection(external_dates).equals(common_dates):
            warnings.append("External factors do not fully cover the modeling date range.")

    return {
        "valid": not errors,
        "grain": grain,
        "date_range": {
            "start": str(common_dates.min().date()) if not common_dates.empty else None,
            "end": str(common_dates.max().date()) if not common_dates.empty else None,
        },
        "n_periods": int(len(common_dates)),
        "channels": channels,
        "missing_periods": missing_periods,
        "warnings": warnings,
        "errors": errors,
    }


def generate_fourier_features(
    dates: Any,
    n_terms: int = 6,
    period: float = 365.25,
) -> Any:
    pandas = _require_pandas()
    series = pandas.to_datetime(dates)
    if series.empty:
        return pandas.DataFrame(index=series.index)
    base = (series - series.min()).dt.days.astype(float)
    payload: dict[str, Any] = {}
    for harmonic in range(1, n_terms + 1):
        radians = 2 * math.pi * harmonic * base / period
        payload[f"sin_{harmonic}"] = radians.map(math.sin)
        payload[f"cos_{harmonic}"] = radians.map(math.cos)
    return pandas.DataFrame(payload, index=series.index)


def prepare_features(
    spend_df: Any,
    conversions_df: Any,
    external_df: Any | None = None,
    grain: str = "weekly",
    n_fourier_terms: int = 6,
) -> tuple[Any, Any]:
    pandas = _require_pandas()
    frequency = "W-MON" if grain == "weekly" else "D"

    spend = spend_df.copy()
    conversions = conversions_df.copy()
    spend["date"] = pandas.to_datetime(spend["date"])
    conversions["date"] = pandas.to_datetime(conversions["date"])

    spend = spend.set_index("date").groupby("channel")["spend"].resample(frequency).sum().reset_index()
    pivoted = (
        spend.pivot_table(index="date", columns="channel", values="spend", aggfunc="sum").fillna(0.0).reset_index()
    )

    metric_columns = [column for column in ("conversions", "revenue") if column in conversions.columns]
    target_column = "revenue" if "revenue" in metric_columns else metric_columns[0]
    conversions = conversions.set_index("date")[metric_columns].resample(frequency).sum().reset_index()
    dataset = pivoted.merge(conversions, on="date", how="inner")

    if external_df is not None:
        external = external_df.copy()
        external["date"] = pandas.to_datetime(external["date"])
        external = external.set_index("date").resample(frequency).mean().reset_index()
        dataset = dataset.merge(external, on="date", how="left")

    fourier = generate_fourier_features(dataset["date"], n_terms=n_fourier_terms)
    dataset = pandas.concat([dataset.reset_index(drop=True), fourier.reset_index(drop=True)], axis=1)
    dataset["trend"] = range(len(dataset))
    dataset = dataset.sort_values("date").fillna(method="ffill").fillna(0.0)

    y = dataset[target_column].copy()
    X = dataset.drop(
        columns=[
            column for column in ("conversions", "revenue") if column in dataset.columns and column == target_column
        ]
    )
    return X, y


def load_calibration_priors(
    analysis_dir: Path,
) -> dict[str, dict[str, float]] | None:
    file_path = analysis_dir / "incrementality_results.json"
    if not file_path.exists():
        return None
    payload = json.loads(file_path.read_text(encoding="utf-8"))
    priors: dict[str, dict[str, float]] = {}
    channels = payload.get("channels", payload)
    if isinstance(channels, dict):
        iterable = channels.items()
    else:
        iterable = ((entry.get("channel"), entry) for entry in channels)
    for channel, details in iterable:
        if not channel or not isinstance(details, dict):
            continue
        lift = float(details.get("lift", details.get("mean_lift", 0.0)))
        ci_low = float(details.get("ci_lower", lift))
        ci_high = float(details.get("ci_upper", lift))
        sigma = max(abs(ci_high - ci_low) / 4.0, 0.05)
        priors[str(channel)] = {"mu": lift, "sigma": sigma * 1.25}
    return priors or None


def build_mmm(
    channel_columns: list[str],
    control_columns: list[str],
    config: dict[str, Any],
    calibration_priors: dict[str, dict[str, float]] | None = None,
) -> LightweightMMM:
    return LightweightMMM(
        channel_columns=channel_columns,
        control_columns=control_columns,
        config=config,
        calibration_priors=calibration_priors,
    )


def fit_model(
    mmm: LightweightMMM,
    X: Any,
    y: Any,
    config: dict[str, Any],
) -> dict[str, Any]:
    mmm.config.update(config)
    return mmm.fit(X, y)


def extract_diagnostics(idata: dict[str, Any]) -> dict[str, Any]:
    diagnostics = dict(idata.get("diagnostics", {}))
    warnings: list[str] = []
    r_hat = diagnostics.get("r_hat", {})
    ess_bulk = diagnostics.get("ess_bulk", {})
    if any(float(value) >= 1.05 for value in r_hat.values()):
        warnings.append("One or more parameters exceed the R-hat threshold of 1.05.")
    if any(float(value) < 400 for value in ess_bulk.values()):
        warnings.append("Effective sample size fell below the 400-observation threshold.")
    diagnostics["warnings"] = warnings
    diagnostics["converged"] = not warnings and diagnostics.get("divergences", 0) == 0
    return diagnostics


def save_results(
    mmm: LightweightMMM,
    idata: dict[str, Any],
    diagnostics: dict[str, Any],
    models_dir: Path,
    analysis_dir: Path,
) -> None:
    models_dir.mkdir(parents=True, exist_ok=True)
    analysis_dir.mkdir(parents=True, exist_ok=True)
    mmm.save(models_dir / "mmm_fitted.nc")
    output = {
        "model_type": "lightweight_mmm_fallback",
        "target_name": mmm.target_name,
        "n_observations": len(mmm.observed_y),
        "diagnostics": diagnostics,
        "fit_summary": {
            "coefficients": mmm.coefficients,
            "intercept": mmm.intercept,
        },
    }
    (analysis_dir / "mmm_diagnostics.json").write_text(json.dumps(output, indent=2), encoding="utf-8")


def run_prior_sensitivity(
    X: Any,
    y: Any,
    channel_columns: list[str],
    control_columns: list[str],
    config: dict[str, Any],
) -> dict[str, Any]:
    vague = build_mmm(channel_columns, control_columns, {**config, "ridge_alpha": 0.001})
    informative = build_mmm(channel_columns, control_columns, {**config, "ridge_alpha": 0.1})
    vague.fit(X, y)
    informative.fit(X, y)
    shifts: dict[str, float] = {}
    for column in channel_columns + control_columns:
        base = vague.coefficients.get(column, 0.0)
        compare = informative.coefficients.get(column, 0.0)
        shifts[column] = abs(compare - base)
    sensitive = [column for column, shift in shifts.items() if shift > 0.15]
    return {
        "prior_sensitive_params": sensitive,
        "max_posterior_shift": max(shifts.values(), default=0.0),
        "recommendation": (
            "Prior sensitivity is elevated; review calibration inputs."
            if sensitive
            else "Posterior estimates are stable across prior strengths."
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Fit Marketing Mix Model")
    parser.add_argument("--validate", action="store_true", help="Run data validation only")
    parser.add_argument("--calibrate", action="store_true", help="Use calibrated priors from lift tests")
    parser.add_argument("--fit", action="store_true", help="Fit the model")
    parser.add_argument("--prior-sensitivity", action="store_true", help="Run prior sensitivity analysis")
    parser.add_argument("--config", type=str, default=None, help="Path to JSON config file")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    config = DEFAULT_CONFIG.copy()
    if args.config:
        config.update(json.loads(Path(args.config).read_text(encoding="utf-8")))

    spend_df = load_spend_data(RAW_DIR)
    conversions_df = load_conversions(RAW_DIR)
    external_df = load_external_factors(RAW_DIR)
    validation = validate_data(spend_df, conversions_df, external_df)
    logger.info("Validation summary: %s", validation)
    if args.validate and not args.fit:
        print(json.dumps(validation, indent=2))
        return
    if not validation["valid"]:
        raise ValueError(f"Validation failed: {validation['errors']}")

    X, y = prepare_features(
        spend_df,
        conversions_df,
        external_df=external_df,
        grain=validation["grain"],
        n_fourier_terms=int(config.get("yearly_seasonality", 6)),
    )
    channel_columns = sorted(spend_df["channel"].astype(str).unique().tolist())
    control_columns = [column for column in X.columns if column not in {"date", *channel_columns}]

    priors = load_calibration_priors(ANALYSIS_DIR) if args.calibrate else None
    mmm = build_mmm(channel_columns, control_columns, config, calibration_priors=priors)
    idata = fit_model(mmm, X, y, config)
    diagnostics = extract_diagnostics(idata)
    save_results(mmm, idata, diagnostics, MODELS_DIR, ANALYSIS_DIR)

    if args.prior_sensitivity:
        sensitivity = run_prior_sensitivity(X, y, channel_columns, control_columns, config)
        (ANALYSIS_DIR / "mmm_prior_sensitivity.json").write_text(json.dumps(sensitivity, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
