"""
Holdout Period Prediction Accuracy Assessment for CLV Models.

Implements temporal holdout validation: fit models on a calibration period,
predict into the holdout period, and compare to actual observations.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Literal, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def temporal_split(
    transactions: pd.DataFrame,
    calibration_end: str,
    holdout_end: Optional[str] = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Split transaction data into calibration and holdout periods.

    Parameters
    ----------
    transactions : pd.DataFrame
        Full transaction data with ``customer_id``, ``date``, ``amount``.
    calibration_end : str
        ISO date string for the end of the calibration period.
        Transactions on or before this date go to calibration.
    holdout_end : str or None
        ISO date string for the end of the holdout period.
        If None, all transactions after calibration_end are included.

    Returns
    -------
    tuple[pd.DataFrame, pd.DataFrame]
        (calibration_transactions, holdout_transactions)
    """
    cal_end = pd.Timestamp(calibration_end)
    transactions = transactions.copy()
    transactions["date"] = pd.to_datetime(transactions["date"])

    cal_txns = transactions[transactions["date"] <= cal_end].copy()

    if holdout_end is not None:
        ho_end = pd.Timestamp(holdout_end)
        holdout_txns = transactions[(transactions["date"] > cal_end) & (transactions["date"] <= ho_end)].copy()
    else:
        holdout_txns = transactions[transactions["date"] > cal_end].copy()

    if len(cal_txns) == 0:
        raise ValueError(
            f"No transactions in calibration period (up to {calibration_end}). Check the calibration_end date."
        )
    if len(holdout_txns) == 0:
        raise ValueError(
            f"No transactions in holdout period (after {calibration_end}). "
            "Check the calibration_end / holdout_end dates."
        )

    return cal_txns.reset_index(drop=True), holdout_txns.reset_index(drop=True)


def compute_holdout_actuals(
    holdout_transactions: pd.DataFrame,
    calibration_customers: pd.DataFrame,
) -> pd.DataFrame:
    """Compute actual transaction counts and monetary values in the holdout period.

    Parameters
    ----------
    holdout_transactions : pd.DataFrame
        Transactions occurring in the holdout period.
    calibration_customers : pd.DataFrame
        RFM summary from the calibration period (defines the customer universe).

    Returns
    -------
    pd.DataFrame
        Per-customer holdout actuals with columns: ``customer_id``,
        ``actual_transactions``, ``actual_monetary_value``.
        Customers with no holdout transactions get 0.
    """
    # Aggregate holdout transactions per customer
    if len(holdout_transactions) > 0:
        holdout_agg = (
            holdout_transactions.groupby("customer_id")
            .agg(
                actual_transactions=("date", "count"),
                actual_monetary_value=("amount", "mean"),
            )
            .reset_index()
        )
    else:
        holdout_agg = pd.DataFrame(columns=["customer_id", "actual_transactions", "actual_monetary_value"])

    # Start from the calibration customer universe
    all_customers = calibration_customers[["customer_id"]].copy()
    all_customers["customer_id"] = all_customers["customer_id"].astype(str)

    if len(holdout_agg) > 0:
        holdout_agg["customer_id"] = holdout_agg["customer_id"].astype(str)

    result = all_customers.merge(holdout_agg, on="customer_id", how="left")
    result["actual_transactions"] = result["actual_transactions"].fillna(0).astype(int)
    result["actual_monetary_value"] = result["actual_monetary_value"].fillna(0.0)

    return result


def evaluate_transaction_predictions(
    predictions: pd.DataFrame,
    actuals: pd.DataFrame,
    prediction_col: str = "expected_transactions",
    actual_col: str = "actual_transactions",
) -> dict[str, float]:
    """Evaluate predicted vs. actual transaction counts.

    Parameters
    ----------
    predictions : pd.DataFrame
        Predicted transactions with ``customer_id`` and ``prediction_col``.
    actuals : pd.DataFrame
        Actual holdout transactions with ``customer_id`` and ``actual_col``.
    prediction_col : str
        Column name for predicted values.
    actual_col : str
        Column name for actual values.

    Returns
    -------
    dict
        Metrics:
        - ``mae`` (float): mean absolute error
        - ``rmse`` (float): root mean squared error
        - ``calibration_ratio`` (float): sum(predicted) / sum(actual)
        - ``correlation`` (float): Pearson correlation between predicted and actual
        - ``n_customers`` (int): number of customers evaluated
    """
    # Merge predictions and actuals
    predictions = predictions.copy()
    actuals = actuals.copy()
    predictions["customer_id"] = predictions["customer_id"].astype(str)
    actuals["customer_id"] = actuals["customer_id"].astype(str)

    merged = predictions[["customer_id", prediction_col]].merge(
        actuals[["customer_id", actual_col]],
        on="customer_id",
        how="inner",
    )

    pred = merged[prediction_col].values
    actual = merged[actual_col].values
    n = len(merged)

    errors = pred - actual
    mae = float(np.mean(np.abs(errors)))
    rmse = float(np.sqrt(np.mean(errors**2)))

    sum_actual = actual.sum()
    calibration_ratio = float(pred.sum() / sum_actual) if sum_actual > 0 else np.nan

    # Pearson correlation
    if n > 1 and np.std(actual) > 0 and np.std(pred) > 0:
        correlation = float(np.corrcoef(pred, actual)[0, 1])
    else:
        correlation = np.nan

    return {
        "mae": mae,
        "rmse": rmse,
        "calibration_ratio": calibration_ratio,
        "correlation": correlation,
        "n_customers": int(n),
    }


def evaluate_probability_alive(
    prob_alive: pd.DataFrame,
    holdout_transactions: pd.DataFrame,
    n_bins: int = 10,
) -> pd.DataFrame:
    """Assess calibration of probability-alive predictions.

    Bins customers by predicted probability-alive and compares to the
    observed fraction who made at least one purchase in the holdout period.

    Parameters
    ----------
    prob_alive : pd.DataFrame
        Predictions with ``customer_id`` and ``prob_alive``.
    holdout_transactions : pd.DataFrame
        Holdout period transactions.
    n_bins : int
        Number of bins for calibration assessment.

    Returns
    -------
    pd.DataFrame
        Calibration table with columns: ``bin_midpoint``, ``predicted_alive_rate``,
        ``observed_repurchase_rate``, ``n_customers``.
    """
    pa = prob_alive.copy()
    pa["customer_id"] = pa["customer_id"].astype(str)

    # Determine which customers made at least one purchase in holdout
    holdout_customers = set(holdout_transactions["customer_id"].astype(str).unique())
    pa["repurchased"] = pa["customer_id"].isin(holdout_customers).astype(int)

    # Bin by predicted probability alive
    pa["bin"] = pd.cut(pa["prob_alive"], bins=n_bins, include_lowest=True)

    calibration = (
        pa.groupby("bin", observed=True)
        .agg(
            predicted_alive_rate=("prob_alive", "mean"),
            observed_repurchase_rate=("repurchased", "mean"),
            n_customers=("customer_id", "count"),
        )
        .reset_index()
    )

    # Compute bin midpoints
    calibration["bin_midpoint"] = calibration["bin"].apply(lambda x: (x.left + x.right) / 2 if pd.notna(x) else np.nan)

    return calibration[["bin_midpoint", "predicted_alive_rate", "observed_repurchase_rate", "n_customers"]]


def compare_mle_vs_bayesian(
    mle_predictions: pd.DataFrame,
    bayesian_predictions: pd.DataFrame,
    actuals: pd.DataFrame,
) -> dict[str, Any]:
    """Compare MLE and Bayesian model predictions on holdout data.

    Parameters
    ----------
    mle_predictions : pd.DataFrame
        MLE-based predictions with confidence intervals.
    bayesian_predictions : pd.DataFrame
        Bayesian predictions with credible intervals.
    actuals : pd.DataFrame
        Holdout period actuals.

    Returns
    -------
    dict
        Comparison metrics:
        - ``mle_mae`` (float): MAE of MLE predictions
        - ``bayesian_mae`` (float): MAE of Bayesian predictions
        - ``mle_mean_interval_width`` (float): average CI width for MLE
        - ``bayesian_mean_interval_width`` (float): average CI width for Bayesian
        - ``bayesian_narrower`` (bool): True if Bayesian intervals are tighter
        - ``mle_coverage`` (float): fraction of actuals within MLE CIs
        - ``bayesian_coverage`` (float): fraction of actuals within Bayesian CIs
    """
    # Evaluate MAE for both
    mle_metrics = evaluate_transaction_predictions(mle_predictions, actuals)
    bayes_metrics = evaluate_transaction_predictions(bayesian_predictions, actuals)

    # Interval widths
    mle_ci_lower = "expected_transactions_ci_lower"
    mle_ci_upper = "expected_transactions_ci_upper"

    mle_width = float((mle_predictions[mle_ci_upper] - mle_predictions[mle_ci_lower]).mean())
    bayes_width = float((bayesian_predictions[mle_ci_upper] - bayesian_predictions[mle_ci_lower]).mean())

    # Coverage: fraction of actuals that fall within the predicted intervals
    def _coverage(preds: pd.DataFrame, acts: pd.DataFrame) -> float:
        preds = preds.copy()
        acts = acts.copy()
        preds["customer_id"] = preds["customer_id"].astype(str)
        acts["customer_id"] = acts["customer_id"].astype(str)
        merged = preds.merge(acts[["customer_id", "actual_transactions"]], on="customer_id")
        within = (merged["actual_transactions"] >= merged[mle_ci_lower]) & (
            merged["actual_transactions"] <= merged[mle_ci_upper]
        )
        return float(within.mean()) if len(merged) > 0 else np.nan

    mle_coverage = _coverage(mle_predictions, actuals)
    bayes_coverage = _coverage(bayesian_predictions, actuals)

    return {
        "mle_mae": mle_metrics["mae"],
        "bayesian_mae": bayes_metrics["mae"],
        "mle_mean_interval_width": mle_width,
        "bayesian_mean_interval_width": bayes_width,
        "bayesian_narrower": bayes_width < mle_width,
        "mle_coverage": mle_coverage,
        "bayesian_coverage": bayes_coverage,
    }


def generate_diagnostic_plots(
    predictions: pd.DataFrame,
    actuals: pd.DataFrame,
    prob_alive_calibration: pd.DataFrame,
    output_path: str | Path = "workspace/reports/clv_validation.html",
) -> Path:
    """Generate validation diagnostic plots as an HTML report.

    Includes:
    - Predicted vs. actual transaction scatter plot
    - Cumulative tracking plot (predicted vs. actual over time)
    - Probability-alive calibration chart
    - Residual distribution histogram

    Parameters
    ----------
    predictions : pd.DataFrame
        Customer-level predictions.
    actuals : pd.DataFrame
        Holdout actuals.
    prob_alive_calibration : pd.DataFrame
        Calibration table from ``evaluate_probability_alive``.
    output_path : str or Path
        Path for the HTML report file.

    Returns
    -------
    Path
        Path to the generated HTML report.
    """
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        logger.warning("matplotlib not available; generating text-only report.")
        return _generate_text_report(predictions, actuals, prob_alive_calibration, output_path)

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Merge predictions with actuals for plotting
    predictions = predictions.copy()
    actuals = actuals.copy()
    predictions["customer_id"] = predictions["customer_id"].astype(str)
    actuals["customer_id"] = actuals["customer_id"].astype(str)

    merged = predictions.merge(actuals, on="customer_id", how="inner")

    figures = []

    # 1. Predicted vs Actual scatter
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.scatter(
        merged["actual_transactions"],
        merged["expected_transactions"],
        alpha=0.3,
        s=10,
    )
    max_val = max(
        merged["actual_transactions"].max(),
        merged["expected_transactions"].max(),
    )
    ax.plot([0, max_val], [0, max_val], "r--", label="Perfect prediction")
    ax.set_xlabel("Actual Transactions")
    ax.set_ylabel("Predicted Transactions")
    ax.set_title("Predicted vs Actual Transactions (Holdout)")
    ax.legend()
    figures.append(("Predicted vs Actual Transactions", _fig_to_base64(fig)))
    plt.close(fig)

    # 2. Residual histogram
    fig, ax = plt.subplots(figsize=(8, 6))
    residuals = merged["expected_transactions"] - merged["actual_transactions"]
    ax.hist(residuals, bins=50, edgecolor="black", alpha=0.7)
    ax.axvline(0, color="r", linestyle="--")
    ax.set_xlabel("Residual (Predicted - Actual)")
    ax.set_ylabel("Count")
    ax.set_title("Residual Distribution")
    figures.append(("Residual Distribution", _fig_to_base64(fig)))
    plt.close(fig)

    # 3. Probability-alive calibration
    if len(prob_alive_calibration) > 0:
        fig, ax = plt.subplots(figsize=(8, 6))
        cal = prob_alive_calibration.dropna(subset=["bin_midpoint"])
        ax.plot(
            cal["predicted_alive_rate"],
            cal["observed_repurchase_rate"],
            "bo-",
            label="Model",
        )
        ax.plot([0, 1], [0, 1], "r--", label="Perfect calibration")
        ax.set_xlabel("Predicted P(Alive)")
        ax.set_ylabel("Observed Repurchase Rate")
        ax.set_title("Probability-Alive Calibration")
        ax.legend()
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        figures.append(("P(Alive) Calibration", _fig_to_base64(fig)))
        plt.close(fig)

    # 4. Cumulative predicted vs actual
    fig, ax = plt.subplots(figsize=(8, 6))
    sorted_actual = np.sort(merged["actual_transactions"].values)
    sorted_pred = np.sort(merged["expected_transactions"].values)
    cum_actual = np.cumsum(sorted_actual) / sorted_actual.sum() if sorted_actual.sum() > 0 else sorted_actual
    cum_pred = np.cumsum(sorted_pred) / sorted_pred.sum() if sorted_pred.sum() > 0 else sorted_pred
    x = np.linspace(0, 1, len(cum_actual))
    ax.plot(x, cum_actual, label="Actual (cumulative)")
    ax.plot(x, cum_pred, label="Predicted (cumulative)", linestyle="--")
    ax.set_xlabel("Customer Percentile")
    ax.set_ylabel("Cumulative Transaction Share")
    ax.set_title("Cumulative Tracking: Predicted vs Actual")
    ax.legend()
    figures.append(("Cumulative Tracking", _fig_to_base64(fig)))
    plt.close(fig)

    # Build HTML
    html_parts = [
        "<!DOCTYPE html><html><head>",
        "<title>CLV Validation Report</title>",
        "<style>body{font-family:sans-serif;max-width:900px;margin:auto;padding:20px}",
        "h1{color:#333}h2{color:#555;border-bottom:1px solid #ddd;padding-bottom:5px}",
        "img{max-width:100%;border:1px solid #eee;margin:10px 0}</style>",
        "</head><body>",
        "<h1>CLV Model Validation Report</h1>",
    ]
    for title, img_b64 in figures:
        html_parts.append(f"<h2>{title}</h2>")
        html_parts.append(f'<img src="data:image/png;base64,{img_b64}" />')

    html_parts.append("</body></html>")

    output_path.write_text("\n".join(html_parts))
    return output_path.resolve()


def _fig_to_base64(fig) -> str:
    """Convert a matplotlib figure to a base64-encoded PNG string."""
    import base64
    from io import BytesIO

    buf = BytesIO()
    fig.savefig(buf, format="png", dpi=100, bbox_inches="tight")
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("utf-8")


def _generate_text_report(
    predictions: pd.DataFrame,
    actuals: pd.DataFrame,
    prob_alive_calibration: pd.DataFrame,
    output_path: str | Path,
) -> Path:
    """Fallback: generate a simple HTML report without plots."""
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    metrics = evaluate_transaction_predictions(predictions, actuals)

    html = f"""<!DOCTYPE html><html><head><title>CLV Validation Report</title></head>
<body>
<h1>CLV Validation Report (Text Only)</h1>
<p>matplotlib not available; showing metrics only.</p>
<table border="1" cellpadding="5">
<tr><th>Metric</th><th>Value</th></tr>
<tr><td>MAE</td><td>{metrics["mae"]:.4f}</td></tr>
<tr><td>RMSE</td><td>{metrics["rmse"]:.4f}</td></tr>
<tr><td>Calibration Ratio</td><td>{metrics["calibration_ratio"]:.4f}</td></tr>
<tr><td>Correlation</td><td>{metrics["correlation"]:.4f}</td></tr>
<tr><td>Customers</td><td>{metrics["n_customers"]}</td></tr>
</table>
</body></html>"""

    output_path.write_text(html)
    return output_path.resolve()


def run_validation_pipeline(
    transactions_path: str | Path,
    calibration_end: str,
    holdout_end: Optional[str] = None,
    method: Literal["mle", "bayesian", "both"] = "mle",
    horizon_months: Optional[int] = None,
    output_dir: str | Path = "workspace/reports",
) -> dict[str, Any]:
    """Run the full holdout validation pipeline.

    Steps:
    1. Split transactions into calibration and holdout periods
    2. Build RFM summary on calibration data
    3. Fit BG/NBD and Gamma-Gamma models on calibration data
    4. Predict transactions and monetary value for the holdout period
    5. Compare predictions to holdout actuals
    6. Generate diagnostic plots and metrics

    Parameters
    ----------
    transactions_path : str or Path
        Path to the full transaction data CSV.
    calibration_end : str
        ISO date for end of calibration period.
    holdout_end : str or None
        ISO date for end of holdout period. None uses all remaining data.
    method : {"mle", "bayesian", "both"}
        Which fitting method(s) to validate.
    horizon_months : int or None
        If None, inferred from calibration_end to holdout_end duration.
    output_dir : str or Path
        Directory for validation outputs.

    Returns
    -------
    dict
        Validation results:
        - ``metrics`` (dict): MAE, RMSE, calibration_ratio per method
        - ``prob_alive_calibration`` (pd.DataFrame): calibration table
        - ``comparison`` (dict or None): MLE vs. Bayesian comparison if both
        - ``report_path`` (Path): path to HTML diagnostic report
        - ``pass`` (bool): True if MAE within acceptance threshold
    """
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from rfm_summary import build_rfm_summary, load_transactions  # noqa: E402
    from fit_bgnbd import (  # noqa: E402
        fit_bgnbd_bayesian,
        fit_bgnbd_mle,
        fit_gamma_gamma_bayesian,
        fit_gamma_gamma_mle,
    )
    from predict_clv import (  # noqa: E402
        predict_expected_transactions,
        predict_probability_alive,
    )

    # Load full transactions
    txns = load_transactions(transactions_path)

    # Step 1: Temporal split
    print(f"Splitting data at calibration_end={calibration_end}...")
    cal_txns, ho_txns = temporal_split(txns, calibration_end, holdout_end)
    print(f"  Calibration: {len(cal_txns):,} txns, Holdout: {len(ho_txns):,} txns")

    # Infer horizon if not specified
    if horizon_months is None:
        cal_end_dt = pd.Timestamp(calibration_end)
        if holdout_end is not None:
            ho_end_dt = pd.Timestamp(holdout_end)
        else:
            ho_end_dt = ho_txns["date"].max()
        horizon_months = max(1, int(round((ho_end_dt - cal_end_dt).days / 30.44)))
        print(f"  Inferred holdout horizon: {horizon_months} months")

    # Step 2: Build RFM on calibration data
    rfm_cal = build_rfm_summary(cal_txns, observation_end=calibration_end)
    print(f"  RFM summary: {len(rfm_cal):,} customers")

    # Step 3: Compute holdout actuals
    ho_actuals = compute_holdout_actuals(ho_txns, rfm_cal)

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    methods_to_run = ["mle", "bayesian"] if method == "both" else [method]

    all_metrics = {}
    all_predictions = {}
    prob_alive_calibration = None

    for m in methods_to_run:
        print(f"\n--- Fitting with method: {m} ---")

        # Step 3: Fit models
        if m == "mle":
            bgnbd_result = fit_bgnbd_mle(rfm_cal)
            gg_result = fit_gamma_gamma_mle(rfm_cal)
        else:
            bgnbd_result = fit_bgnbd_bayesian(rfm_cal)
            gg_result = fit_gamma_gamma_bayesian(rfm_cal)

        bg_model = bgnbd_result["model"]

        # Step 4: Predict
        exp_txns = predict_expected_transactions(rfm_cal, bg_model, horizon_months=horizon_months)
        p_alive = predict_probability_alive(rfm_cal, bg_model)

        # Step 5: Evaluate transaction predictions
        metrics = evaluate_transaction_predictions(exp_txns, ho_actuals)
        all_metrics[m] = metrics
        all_predictions[m] = exp_txns
        print(f"  MAE={metrics['mae']:.4f}, RMSE={metrics['rmse']:.4f}, Cal.Ratio={metrics['calibration_ratio']:.4f}")

        # Step 6: Evaluate probability-alive calibration
        pa_cal = evaluate_probability_alive(p_alive, ho_txns)
        if prob_alive_calibration is None:
            prob_alive_calibration = pa_cal

    # Compare MLE vs Bayesian if both were run
    comparison = None
    if method == "both" and "mle" in all_predictions and "bayesian" in all_predictions:
        comparison = compare_mle_vs_bayesian(
            all_predictions["mle"],
            all_predictions["bayesian"],
            ho_actuals,
        )
        print("\n--- MLE vs Bayesian Comparison ---")
        print(f"  MLE MAE: {comparison['mle_mae']:.4f}")
        print(f"  Bayesian MAE: {comparison['bayesian_mae']:.4f}")
        print(f"  Bayesian narrower intervals: {comparison['bayesian_narrower']}")

    # Generate diagnostic plots
    # Use the first method's predictions for the plots
    primary_method = methods_to_run[0]
    report_path = generate_diagnostic_plots(
        all_predictions[primary_method],
        ho_actuals,
        prob_alive_calibration,
        output_path=output_dir / "clv_validation.html",
    )

    # Acceptance criterion: MAE within 20% of calibration period frequency mean
    cal_freq_mean = rfm_cal["frequency"].mean()
    primary_mae = all_metrics[primary_method]["mae"]
    # "MAE within 20% of calibration period error" -- interpret as MAE < 20% of mean frequency
    acceptance_threshold = max(0.2 * cal_freq_mean, 0.5)  # floor at 0.5
    passed = primary_mae <= acceptance_threshold

    print(
        f"\nAcceptance: MAE={primary_mae:.4f} vs threshold={acceptance_threshold:.4f} -> {'PASS' if passed else 'FAIL'}"
    )

    return {
        "metrics": all_metrics,
        "prob_alive_calibration": prob_alive_calibration,
        "comparison": comparison,
        "report_path": report_path,
        "pass": passed,
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Validate CLV model with holdout period")
    parser.add_argument("--transactions", required=True, help="Path to transactions CSV")
    parser.add_argument("--calibration-end", required=True, help="ISO date for calibration end")
    parser.add_argument("--holdout-end", default=None, help="ISO date for holdout end")
    parser.add_argument("--method", default="mle", choices=["mle", "bayesian", "both"])
    parser.add_argument("--output-dir", default="workspace/reports")
    args = parser.parse_args()

    results = run_validation_pipeline(
        transactions_path=args.transactions,
        calibration_end=args.calibration_end,
        holdout_end=args.holdout_end,
        method=args.method,
        output_dir=args.output_dir,
    )
    print(f"Validation pass: {results.get('pass', 'N/A')}")
    for method_name, metrics in results.get("metrics", {}).items():
        print(f"  {method_name}: MAE={metrics.get('mae', 'N/A'):.4f}, RMSE={metrics.get('rmse', 'N/A'):.4f}")
