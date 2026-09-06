"""
Customer-Level CLV Prediction with Configurable Horizon.

Generates per-customer CLV predictions, probability-alive scores,
CLV:CAC ratios, at-risk identification, and CLV-based segmentation.
"""

from __future__ import annotations

import json
import logging
import pickle
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_DAYS_PER_MONTH = 30.44  # average days per month
_WEEKS_PER_MONTH = 4.345  # average weeks per month
_DEFAULT_MONTHLY_DISCOUNT = 0.01  # 0.01 per month ~ 12.7% annualized


def _horizon_to_time_units(horizon_months: int, time_unit: str) -> float:
    """Convert a horizon in months to the time unit used in the RFM data."""
    if time_unit == "W":
        return horizon_months * _WEEKS_PER_MONTH
    return horizon_months * _DAYS_PER_MONTH  # default: days


def _is_bayesian(model: Any) -> bool:
    """Detect whether *model* is a PyMC-Marketing Bayesian model."""
    cls_name = type(model).__name__
    return cls_name in ("BetaGeoModel", "GammaGammaModel")


# ===================================================================
# Transaction prediction
# ===================================================================


def predict_expected_transactions(
    rfm: pd.DataFrame,
    bgnbd_model: Any,
    horizon_months: int = 12,
    time_unit: str = "D",
) -> pd.DataFrame:
    """Predict expected future transactions per customer.

    Parameters
    ----------
    rfm : pd.DataFrame
        RFM summary with customer_id, frequency, recency, T.
    bgnbd_model : Any
        Fitted BG/NBD model (lifetimes BetaGeoFitter or PyMC-Marketing BetaGeoModel).
    horizon_months : int
        Prediction horizon in months. Common values: 6, 12, 24.
    time_unit : str
        Time unit of the RFM data (``"D"`` for days, ``"W"`` for weeks).

    Returns
    -------
    pd.DataFrame
        DataFrame with columns: ``customer_id``, ``expected_transactions``,
        ``expected_transactions_ci_lower``, ``expected_transactions_ci_upper``.
    """
    t = _horizon_to_time_units(horizon_months, time_unit)

    if _is_bayesian(bgnbd_model):
        # PyMC-Marketing returns posterior samples (chains x draws x customers)
        pred = bgnbd_model.expected_purchases(
            customer_id=rfm["customer_id"],
            frequency=rfm["frequency"],
            recency=rfm["recency"],
            T=rfm["T"],
            t=t,
        )
        # pred is an xarray DataArray; collapse chain/draw dims
        pred_vals = pred.values.reshape(-1, len(rfm))
        mean_pred = pred_vals.mean(axis=0)
        ci_lower = np.percentile(pred_vals, 10, axis=0)
        ci_upper = np.percentile(pred_vals, 90, axis=0)
    else:
        # lifetimes BetaGeoFitter -- point estimate, bootstrap for CIs
        mean_pred = bgnbd_model.conditional_expected_number_of_purchases_up_to_time(
            t,
            rfm["frequency"],
            rfm["recency"],
            rfm["T"],
        ).values

        # Bootstrap CIs by perturbing parameters
        ci_lower, ci_upper = _bootstrap_transaction_ci(bgnbd_model, rfm, t, n_boot=200)

    return pd.DataFrame(
        {
            "customer_id": rfm["customer_id"].values,
            "expected_transactions": mean_pred,
            "expected_transactions_ci_lower": ci_lower,
            "expected_transactions_ci_upper": ci_upper,
        }
    )


def _bootstrap_transaction_ci(
    model: Any,
    rfm: pd.DataFrame,
    t: float,
    n_boot: int = 200,
    ci: float = 0.80,
) -> tuple[np.ndarray, np.ndarray]:
    """Bootstrap confidence intervals for MLE transaction predictions.

    Resamples customers with replacement, refits, and predicts. Returns
    the lower and upper percentiles of the bootstrapped predictions.
    """
    from lifetimes import BetaGeoFitter

    preds = []
    n = len(rfm)
    alpha = (1 - ci) / 2

    for _ in range(n_boot):
        idx = np.random.choice(n, size=n, replace=True)
        boot_rfm = rfm.iloc[idx].reset_index(drop=True)
        try:
            bgf = BetaGeoFitter(penalizer_coef=0.001)
            bgf.fit(
                boot_rfm["frequency"],
                boot_rfm["recency"],
                boot_rfm["T"],
            )
            pred = bgf.conditional_expected_number_of_purchases_up_to_time(
                t,
                rfm["frequency"],
                rfm["recency"],
                rfm["T"],
            ).values
            preds.append(pred)
        except Exception:
            # Skip failed bootstrap iterations
            continue

    if len(preds) < 10:
        # Not enough successful bootstraps; return conservative bounds
        logger.warning(
            "Only %d/%d bootstrap iterations succeeded; CIs may be unreliable.",
            len(preds),
            n_boot,
        )
        base = model.conditional_expected_number_of_purchases_up_to_time(
            t, rfm["frequency"], rfm["recency"], rfm["T"]
        ).values
        return base * 0.7, base * 1.3

    preds = np.stack(preds, axis=0)
    return (
        np.percentile(preds, alpha * 100, axis=0),
        np.percentile(preds, (1 - alpha) * 100, axis=0),
    )


# ===================================================================
# Probability alive
# ===================================================================


def predict_probability_alive(
    rfm: pd.DataFrame,
    bgnbd_model: Any,
) -> pd.DataFrame:
    """Compute probability-alive scores for all customers.

    Parameters
    ----------
    rfm : pd.DataFrame
        RFM summary with customer_id, frequency, recency, T.
    bgnbd_model : Any
        Fitted BG/NBD model.

    Returns
    -------
    pd.DataFrame
        DataFrame with columns: ``customer_id``, ``prob_alive``,
        ``prob_alive_ci_lower``, ``prob_alive_ci_upper``.
    """
    if _is_bayesian(bgnbd_model):
        pred = bgnbd_model.expected_probability_alive(
            customer_id=rfm["customer_id"],
            frequency=rfm["frequency"],
            recency=rfm["recency"],
            T=rfm["T"],
        )
        pred_vals = pred.values.reshape(-1, len(rfm))
        mean_alive = pred_vals.mean(axis=0)
        ci_lower = np.percentile(pred_vals, 10, axis=0)
        ci_upper = np.percentile(pred_vals, 90, axis=0)
    else:
        # lifetimes BetaGeoFitter
        mean_alive = bgnbd_model.conditional_probability_alive(
            rfm["frequency"],
            rfm["recency"],
            rfm["T"],
        ).values

        # Bootstrap CIs for probability alive
        ci_lower, ci_upper = _bootstrap_prob_alive_ci(bgnbd_model, rfm, n_boot=200)

    return pd.DataFrame(
        {
            "customer_id": rfm["customer_id"].values,
            "prob_alive": mean_alive,
            "prob_alive_ci_lower": ci_lower,
            "prob_alive_ci_upper": ci_upper,
        }
    )


def _bootstrap_prob_alive_ci(
    model: Any,
    rfm: pd.DataFrame,
    n_boot: int = 200,
    ci: float = 0.80,
) -> tuple[np.ndarray, np.ndarray]:
    """Bootstrap CIs for probability-alive predictions."""
    from lifetimes import BetaGeoFitter

    preds = []
    n = len(rfm)
    alpha = (1 - ci) / 2

    for _ in range(n_boot):
        idx = np.random.choice(n, size=n, replace=True)
        boot_rfm = rfm.iloc[idx].reset_index(drop=True)
        try:
            bgf = BetaGeoFitter(penalizer_coef=0.001)
            bgf.fit(
                boot_rfm["frequency"],
                boot_rfm["recency"],
                boot_rfm["T"],
            )
            pred = bgf.conditional_probability_alive(
                rfm["frequency"],
                rfm["recency"],
                rfm["T"],
            ).values
            preds.append(pred)
        except Exception:
            continue

    if len(preds) < 10:
        base = model.conditional_probability_alive(rfm["frequency"], rfm["recency"], rfm["T"]).values
        return np.clip(base - 0.1, 0, 1), np.clip(base + 0.1, 0, 1)

    preds = np.stack(preds, axis=0)
    return (
        np.clip(np.percentile(preds, alpha * 100, axis=0), 0, 1),
        np.clip(np.percentile(preds, (1 - alpha) * 100, axis=0), 0, 1),
    )


# ===================================================================
# Monetary value prediction
# ===================================================================


def predict_monetary_value(
    rfm: pd.DataFrame,
    gamma_gamma_model: Any,
) -> pd.DataFrame:
    """Predict expected average monetary value per transaction per customer.

    Parameters
    ----------
    rfm : pd.DataFrame
        RFM summary with customer_id, frequency, monetary_value.
        Customers with frequency == 0 receive NaN predictions.
    gamma_gamma_model : Any
        Fitted Gamma-Gamma model (lifetimes or PyMC-Marketing).

    Returns
    -------
    pd.DataFrame
        DataFrame with columns: ``customer_id``, ``expected_monetary_value``.
    """
    # Gamma-Gamma only applies to repeat purchasers (frequency > 0)
    repeat_mask = rfm["frequency"] > 0
    rfm_repeat = rfm[repeat_mask].copy()

    if _is_bayesian(gamma_gamma_model):
        pred = gamma_gamma_model.expected_customer_monetary_value(
            customer_id=rfm_repeat["customer_id"],
            frequency=rfm_repeat["frequency"],
            monetary_value=rfm_repeat["monetary_value"],
        )
        # Collapse posterior to mean
        pred_vals = pred.values.reshape(-1, len(rfm_repeat))
        mean_mv = pred_vals.mean(axis=0)
    else:
        # lifetimes GammaGammaFitter
        mean_mv = gamma_gamma_model.conditional_expected_average_profit(
            rfm_repeat["frequency"],
            rfm_repeat["monetary_value"],
        ).values

    # Build result with NaN for one-time purchasers
    result = pd.DataFrame(
        {
            "customer_id": rfm["customer_id"].values,
            "expected_monetary_value": np.nan,
        }
    )
    result.loc[repeat_mask.values, "expected_monetary_value"] = mean_mv

    return result


# ===================================================================
# Combined CLV
# ===================================================================


def compute_clv(
    expected_transactions: pd.DataFrame,
    expected_monetary: pd.DataFrame,
    prob_alive: pd.DataFrame,
    horizon_months: int = 12,
    discount_rate: float = 0.10,
    margin: float = 1.0,
) -> pd.DataFrame:
    """Compute customer-level CLV from component predictions.

    Formula: CLV = E[transactions] * E[monetary_value] * margin * discount_factor

    Parameters
    ----------
    expected_transactions : pd.DataFrame
        Per-customer expected transactions from ``predict_expected_transactions``.
    expected_monetary : pd.DataFrame
        Per-customer expected monetary value from ``predict_monetary_value``.
    prob_alive : pd.DataFrame
        Per-customer probability-alive from ``predict_probability_alive``.
    horizon_months : int
        Prediction horizon used for the discount factor calculation.
    discount_rate : float
        Annual discount rate (e.g., 0.10 for 10%). Defaults to WACC-like rate.
    margin : float
        Gross margin multiplier applied to revenue (e.g., 0.3 for 30% margin).

    Returns
    -------
    pd.DataFrame
        DataFrame with columns: ``customer_id``, ``predicted_clv``,
        ``clv_ci_lower``, ``clv_ci_upper``, ``prob_alive``,
        ``expected_transactions``, ``expected_monetary_value``,
        ``horizon_months``, ``discount_rate``, ``margin``.
    """
    # Monthly discount rate from annual rate
    monthly_rate = discount_rate / 12.0

    # Discount factor: sum of present-value factors for each month
    discount_factor = sum(1.0 / (1.0 + monthly_rate) ** m for m in range(1, horizon_months + 1))
    # Normalize: divide by horizon so CLV = E[txns] * E[mv] * margin * adj_factor
    # Actually the standard approach: CLV = E[txns] * E[mv] * margin
    # The discount factor adjusts the time-value. Since E[txns] already
    # accounts for the horizon, we apply a ratio-based discount.
    # Per-period discount: discount_factor / horizon_months
    discount_adj = discount_factor / horizon_months if horizon_months > 0 else 1.0

    # Merge all component predictions on customer_id
    merged = expected_transactions[
        ["customer_id", "expected_transactions", "expected_transactions_ci_lower", "expected_transactions_ci_upper"]
    ].copy()
    merged = merged.merge(
        expected_monetary[["customer_id", "expected_monetary_value"]],
        on="customer_id",
        how="left",
    )
    merged = merged.merge(
        prob_alive[["customer_id", "prob_alive", "prob_alive_ci_lower", "prob_alive_ci_upper"]],
        on="customer_id",
        how="left",
    )

    # CLV = E[transactions] * E[monetary_value] * margin * discount_adj
    merged["predicted_clv"] = (
        merged["expected_transactions"] * merged["expected_monetary_value"] * margin * discount_adj
    )

    # CI bounds: use component CIs for lower/upper
    merged["clv_ci_lower"] = (
        merged["expected_transactions_ci_lower"]
        * merged["expected_monetary_value"]  # monetary is point est
        * margin
        * discount_adj
    )
    merged["clv_ci_upper"] = (
        merged["expected_transactions_ci_upper"] * merged["expected_monetary_value"] * margin * discount_adj
    )

    # Add metadata columns
    merged["horizon_months"] = horizon_months
    merged["discount_rate"] = discount_rate
    merged["margin"] = margin

    # Select and reorder output columns
    out_cols = [
        "customer_id",
        "predicted_clv",
        "clv_ci_lower",
        "clv_ci_upper",
        "prob_alive",
        "expected_transactions",
        "expected_monetary_value",
        "horizon_months",
        "discount_rate",
        "margin",
    ]
    return merged[out_cols]


# ===================================================================
# CLV:CAC ratio
# ===================================================================


def compute_clv_cac_ratio(
    clv_predictions: pd.DataFrame,
    acquisition_costs_path: Optional[str | Path] = None,
) -> pd.DataFrame:
    """Calculate CLV:CAC ratios when acquisition cost data is available.

    Parameters
    ----------
    clv_predictions : pd.DataFrame
        Customer-level CLV predictions with ``customer_id`` and ``predicted_clv``.
    acquisition_costs_path : str, Path, or None
        Path to ``acquisition_costs.json`` from the paid-media skill.
        Expected format: list of {customer_id, cac} or {segment, cac}.
        If None or file missing, ratio columns are filled with NaN and
        a warning flag is set.

    Returns
    -------
    pd.DataFrame
        Input DataFrame with added columns: ``cac``, ``clv_cac_ratio``,
        ``cac_data_available`` (bool).
    """
    result = clv_predictions.copy()

    cac_loaded = False
    if acquisition_costs_path is not None:
        cac_path = Path(acquisition_costs_path)
        if cac_path.exists():
            try:
                with open(cac_path) as f:
                    cac_data = json.load(f)

                cac_df = pd.DataFrame(cac_data)

                if "customer_id" in cac_df.columns and "cac" in cac_df.columns:
                    cac_df["customer_id"] = cac_df["customer_id"].astype(str)
                    cac_df["cac"] = pd.to_numeric(cac_df["cac"], errors="coerce")
                    result = result.merge(
                        cac_df[["customer_id", "cac"]],
                        on="customer_id",
                        how="left",
                    )
                    cac_loaded = True
                elif "segment" in cac_df.columns and "cac" in cac_df.columns:
                    # Segment-level CAC: requires clv_segment in predictions
                    if "clv_segment" in result.columns:
                        cac_df = cac_df.rename(columns={"segment": "clv_segment"})
                        cac_df["cac"] = pd.to_numeric(cac_df["cac"], errors="coerce")
                        result = result.merge(
                            cac_df[["clv_segment", "cac"]],
                            on="clv_segment",
                            how="left",
                        )
                        cac_loaded = True
                    else:
                        logger.warning(
                            "CAC data is segment-level but predictions lack "
                            "'clv_segment' column. Assign segments first."
                        )
            except (json.JSONDecodeError, KeyError) as exc:
                logger.warning("Failed to load CAC data: %s", exc)

    if not cac_loaded:
        result["cac"] = np.nan
        if acquisition_costs_path is not None:
            logger.warning(
                "Acquisition cost data not available at '%s'. "
                "CLV:CAC ratios will be NaN. Provide a valid "
                "acquisition_costs.json to enable this metric.",
                acquisition_costs_path,
            )

    # Compute ratio (avoid division by zero)
    result["clv_cac_ratio"] = np.where(
        result["cac"].notna() & (result["cac"] > 0),
        result["predicted_clv"] / result["cac"],
        np.nan,
    )
    result["cac_data_available"] = result["cac"].notna()

    return result


# ===================================================================
# At-risk identification
# ===================================================================


def identify_at_risk_customers(
    clv_predictions: pd.DataFrame,
    clv_percentile_threshold: float = 0.90,
    prob_alive_threshold: float = 0.50,
) -> pd.DataFrame:
    """Identify high-value customers at risk of churning.

    Criteria:
    - High-value: predicted CLV in the top percentile (default: top 10%)
    - At-risk: probability-alive below threshold (default: 50%)

    Parameters
    ----------
    clv_predictions : pd.DataFrame
        Customer-level predictions with ``predicted_clv`` and ``prob_alive``.
    clv_percentile_threshold : float
        Percentile cutoff for high-value classification (0.90 = top 10%).
    prob_alive_threshold : float
        Probability-alive below which a customer is considered at-risk.

    Returns
    -------
    pd.DataFrame
        Subset of at-risk high-value customers with columns:
        ``customer_id``, ``predicted_clv``, ``prob_alive``,
        ``expected_transactions``, ``days_since_last_purchase``,
        ``risk_priority`` (ranked by CLV descending).
    """
    df = clv_predictions.copy()

    # Determine high-value threshold
    clv_cutoff = df["predicted_clv"].quantile(clv_percentile_threshold)

    # Filter: high CLV AND low probability alive
    mask = (df["predicted_clv"] >= clv_cutoff) & (df["prob_alive"] < prob_alive_threshold)
    at_risk = df[mask].copy()

    if at_risk.empty:
        # Return empty DataFrame with expected columns
        return pd.DataFrame(
            columns=[
                "customer_id",
                "predicted_clv",
                "prob_alive",
                "expected_transactions",
                "days_since_last_purchase",
                "risk_priority",
            ]
        )

    # Rank by CLV descending (1 = highest CLV at-risk customer)
    at_risk = at_risk.sort_values("predicted_clv", ascending=False).reset_index(drop=True)
    at_risk["risk_priority"] = range(1, len(at_risk) + 1)

    # Include days_since_last_purchase if recency and T are available
    if "recency" in at_risk.columns and "T" in at_risk.columns:
        at_risk["days_since_last_purchase"] = at_risk["T"] - at_risk["recency"]
    elif "days_since_last_purchase" not in at_risk.columns:
        at_risk["days_since_last_purchase"] = np.nan

    out_cols = [
        "customer_id",
        "predicted_clv",
        "prob_alive",
        "expected_transactions",
        "days_since_last_purchase",
        "risk_priority",
    ]
    # Only include columns that exist
    out_cols = [c for c in out_cols if c in at_risk.columns]
    return at_risk[out_cols]


# ===================================================================
# CLV segmentation
# ===================================================================


def assign_clv_segments(
    clv_predictions: pd.DataFrame,
    tiers: Optional[dict[str, float]] = None,
) -> pd.DataFrame:
    """Assign customers to CLV-based value tiers.

    Parameters
    ----------
    clv_predictions : pd.DataFrame
        Customer-level predictions with ``predicted_clv``.
    tiers : dict or None
        Mapping of tier name to percentile threshold. Defaults to:
        ``{"Platinum": 0.90, "Gold": 0.75, "Silver": 0.50, "Bronze": 0.0}``.

    Returns
    -------
    pd.DataFrame
        Input DataFrame with added ``clv_segment`` column.
    """
    if tiers is None:
        tiers = {"Platinum": 0.90, "Gold": 0.75, "Silver": 0.50, "Bronze": 0.0}

    result = clv_predictions.copy()

    # Compute percentile rank (0-1) for each customer's CLV
    pct_rank = result["predicted_clv"].rank(pct=True, na_option="bottom")

    # Sort tiers by threshold descending so we assign highest tier first
    sorted_tiers = sorted(tiers.items(), key=lambda x: x[1], reverse=True)

    result["clv_segment"] = sorted_tiers[-1][0]  # default to lowest tier
    for tier_name, threshold in sorted_tiers:
        result.loc[pct_rank >= threshold, "clv_segment"] = tier_name

    return result


# ===================================================================
# Save outputs
# ===================================================================


def save_predictions(
    clv_predictions: pd.DataFrame,
    at_risk: pd.DataFrame,
    segments: pd.DataFrame,
    output_dir: str | Path = "workspace/analysis",
) -> dict[str, Path]:
    """Save all prediction outputs to JSON files.

    Saves:
    - ``clv_predictions.json`` -- full customer-level predictions
    - ``at_risk_customers.json`` -- high-value at-risk subset
    - ``clv_segments.json`` -- CLV tier assignments

    Parameters
    ----------
    clv_predictions : pd.DataFrame
        Full prediction DataFrame.
    at_risk : pd.DataFrame
        At-risk customer DataFrame.
    segments : pd.DataFrame
        Segment assignment DataFrame.
    output_dir : str or Path
        Output directory.

    Returns
    -------
    dict[str, Path]
        Mapping of output name to saved file path.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    paths = {}

    pred_path = output_dir / "clv_predictions.json"
    clv_predictions.to_json(pred_path, orient="records", indent=2, default_handler=str)
    paths["clv_predictions"] = pred_path.resolve()

    risk_path = output_dir / "at_risk_customers.json"
    at_risk.to_json(risk_path, orient="records", indent=2, default_handler=str)
    paths["at_risk_customers"] = risk_path.resolve()

    seg_path = output_dir / "clv_segments.json"
    segments.to_json(seg_path, orient="records", indent=2, default_handler=str)
    paths["clv_segments"] = seg_path.resolve()

    return paths


# ===================================================================
# Full pipeline
# ===================================================================


def run_prediction_pipeline(
    rfm_path: str | Path,
    bgnbd_model_path: str | Path,
    gamma_gamma_model_path: str | Path,
    horizon_months: int = 12,
    discount_rate: float = 0.10,
    margin: float = 1.0,
    acquisition_costs_path: Optional[str | Path] = None,
    output_dir: str | Path = "workspace/analysis",
) -> dict[str, pd.DataFrame]:
    """Run the full CLV prediction pipeline.

    Parameters
    ----------
    rfm_path : str or Path
        Path to RFM summary CSV.
    bgnbd_model_path : str or Path
        Path to serialized BG/NBD model.
    gamma_gamma_model_path : str or Path
        Path to serialized Gamma-Gamma model.
    horizon_months : int
        Prediction horizon in months.
    discount_rate : float
        Annual discount rate.
    margin : float
        Gross margin multiplier.
    acquisition_costs_path : str, Path, or None
        Path to acquisition cost data.
    output_dir : str or Path
        Directory for output files.

    Returns
    -------
    dict
        Keys: ``"predictions"``, ``"at_risk"``, ``"segments"``.
        Values: corresponding DataFrames.
    """
    # Load data and models
    rfm = pd.read_csv(rfm_path)
    rfm["customer_id"] = rfm["customer_id"].astype(str)

    with open(bgnbd_model_path, "rb") as f:
        bgnbd_model = pickle.load(f)
    with open(gamma_gamma_model_path, "rb") as f:
        gg_model = pickle.load(f)

    # Determine time unit from RFM data heuristic:
    # if median T < 100, likely weeks; otherwise days
    time_unit = "W" if rfm["T"].median() < 100 else "D"

    # Step 1: Predict expected transactions
    print(f"Predicting expected transactions (horizon={horizon_months}mo)...")
    exp_txns = predict_expected_transactions(rfm, bgnbd_model, horizon_months=horizon_months, time_unit=time_unit)

    # Step 2: Predict probability alive
    print("Computing probability-alive scores...")
    p_alive = predict_probability_alive(rfm, bgnbd_model)

    # Step 3: Predict monetary value
    print("Predicting expected monetary values...")
    exp_mv = predict_monetary_value(rfm, gg_model)

    # Step 4: Compute CLV
    print("Computing combined CLV...")
    clv = compute_clv(
        exp_txns,
        exp_mv,
        p_alive,
        horizon_months=horizon_months,
        discount_rate=discount_rate,
        margin=margin,
    )

    # Step 5: CLV:CAC ratio
    clv = compute_clv_cac_ratio(clv, acquisition_costs_path=acquisition_costs_path)

    # Step 6: Identify at-risk customers
    # Merge recency/T for days_since_last_purchase computation
    clv_with_rfm = clv.merge(rfm[["customer_id", "recency", "T"]], on="customer_id", how="left")
    at_risk = identify_at_risk_customers(clv_with_rfm)

    # Step 7: Assign segments
    segments = assign_clv_segments(clv)

    # Save outputs
    save_predictions(clv, at_risk, segments, output_dir=output_dir)

    return {
        "predictions": clv,
        "at_risk": at_risk,
        "segments": segments,
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate customer-level CLV predictions")
    parser.add_argument("--rfm", required=True, help="Path to RFM summary CSV")
    parser.add_argument("--bgnbd-model", required=True, help="Path to fitted BG/NBD model")
    parser.add_argument("--gg-model", required=True, help="Path to fitted Gamma-Gamma model")
    parser.add_argument("--horizon", type=int, default=12, help="Horizon in months")
    parser.add_argument("--discount-rate", type=float, default=0.10)
    parser.add_argument("--margin", type=float, default=1.0)
    parser.add_argument("--cac-data", default=None, help="Path to acquisition costs JSON")
    parser.add_argument("--output-dir", default="workspace/analysis")
    args = parser.parse_args()

    results = run_prediction_pipeline(
        rfm_path=args.rfm,
        bgnbd_model_path=args.bgnbd_model,
        gamma_gamma_model_path=args.gg_model,
        horizon_months=args.horizon,
        discount_rate=args.discount_rate,
        margin=args.margin,
        acquisition_costs_path=args.cac_data,
        output_dir=args.output_dir,
    )
    for name, df in results.items():
        print(f"{name}: {len(df)} rows")
