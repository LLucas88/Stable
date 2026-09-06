"""
BG/NBD and Gamma-Gamma Model Fitting.

Fits the BG/NBD model for purchase frequency prediction and the
Gamma-Gamma model for monetary value estimation. Supports both
MLE (lifetimes library) and Bayesian (PyMC-Marketing) fitting methods.
"""

from __future__ import annotations

import logging
import pickle
from pathlib import Path
from typing import Any, Literal, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def fit_bgnbd_mle(
    rfm: pd.DataFrame,
    penalizer_coef: float = 0.0,
    frequency_col: str = "frequency",
    recency_col: str = "recency",
    T_col: str = "T",
) -> dict[str, Any]:
    """Fit BG/NBD model using maximum likelihood estimation via lifetimes.

    Parameters
    ----------
    rfm : pd.DataFrame
        RFM summary with frequency, recency, and T columns.
    penalizer_coef : float
        L2 regularization penalty. Increase from 0.0 if convergence fails.
    frequency_col : str
        Column name for purchase frequency.
    recency_col : str
        Column name for recency.
    T_col : str
        Column name for customer tenure.

    Returns
    -------
    dict
        Fitted model results with keys:
        - ``model``: fitted ``BetaGeoFitter`` instance
        - ``params`` (dict): {r, alpha, a, b} parameter estimates
        - ``log_likelihood`` (float): maximized log-likelihood
        - ``converged`` (bool): whether optimization converged
    """
    from lifetimes import BetaGeoFitter

    bgf = BetaGeoFitter(penalizer_coef=penalizer_coef)
    bgf.fit(
        rfm[frequency_col],
        rfm[recency_col],
        rfm[T_col],
    )

    params = {
        "r": bgf.params_["r"],
        "alpha": bgf.params_["alpha"],
        "a": bgf.params_["a"],
        "b": bgf.params_["b"],
    }

    # Check convergence: lifetimes raises if it fails outright, but we can
    # verify the log-likelihood is finite as a secondary check.
    ll = bgf._negative_log_likelihood_
    converged = np.isfinite(ll)

    return {
        "model": bgf,
        "params": params,
        "log_likelihood": float(-ll),  # stored as negative LL internally
        "converged": bool(converged),
    }


def fit_bgnbd_bayesian(
    rfm: pd.DataFrame,
    tune: int = 1000,
    draws: int = 1000,
    chains: int = 4,
    target_accept: float = 0.9,
    model_config: Optional[dict] = None,
    random_seed: int = 42,
) -> dict[str, Any]:
    """Fit BG/NBD model using Bayesian MCMC via PyMC-Marketing.

    Parameters
    ----------
    rfm : pd.DataFrame
        RFM summary with customer_id, frequency, recency, T columns.
    tune : int
        Number of MCMC tuning steps.
    draws : int
        Number of posterior draws per chain.
    chains : int
        Number of MCMC chains.
    target_accept : float
        Target acceptance probability for NUTS sampler.
    model_config : dict or None
        Prior distribution overrides. See PyMC-Marketing docs for keys.
    random_seed : int
        Random seed for reproducibility.

    Returns
    -------
    dict
        Fitted model results with keys:
        - ``model``: fitted ``BetaGeoModel`` instance
        - ``idata``: ArviZ InferenceData with posterior samples
        - ``convergence`` (dict): R-hat and ESS diagnostics per parameter
        - ``converged`` (bool): True if all R-hat < 1.01 and ESS > 400
    """
    import arviz as az
    from pymc_marketing.clv import BetaGeoModel

    # Ensure customer_id column exists and is properly typed
    model_data = rfm[["customer_id", "frequency", "recency", "T"]].copy()
    model_data["customer_id"] = model_data["customer_id"].astype(str)

    kwargs = {}
    if model_config is not None:
        kwargs["model_config"] = model_config

    sampler_config = {
        "tune": tune,
        "draws": draws,
        "chains": chains,
        "target_accept": target_accept,
        "random_seed": random_seed,
    }

    model = BetaGeoModel(
        data=model_data,
        sampler_config=sampler_config,
        **kwargs,
    )
    model.fit()

    idata = model.idata

    # Convergence diagnostics
    var_names = [v for v in ["alpha", "r", "a_", "b_"] if v in idata.posterior]
    if not var_names:
        # Fallback: use whatever variables are present
        var_names = list(idata.posterior.data_vars)

    summary = az.summary(idata, var_names=var_names)
    convergence = {}
    for param in summary.index:
        convergence[param] = {
            "r_hat": float(summary.loc[param, "r_hat"]),
            "ess_bulk": float(summary.loc[param, "ess_bulk"]),
        }

    all_rhat_ok = all(v["r_hat"] < 1.01 for v in convergence.values())
    all_ess_ok = all(v["ess_bulk"] > 400 for v in convergence.values())

    return {
        "model": model,
        "idata": idata,
        "convergence": convergence,
        "converged": bool(all_rhat_ok and all_ess_ok),
    }


def fit_gamma_gamma_mle(
    rfm: pd.DataFrame,
    penalizer_coef: float = 0.0,
    frequency_col: str = "frequency",
    monetary_col: str = "monetary_value",
) -> dict[str, Any]:
    """Fit Gamma-Gamma model for monetary value using MLE via lifetimes.

    Only customers with frequency > 0 are included. Validates the
    independence assumption between frequency and monetary value.

    Parameters
    ----------
    rfm : pd.DataFrame
        RFM summary. Customers with frequency == 0 are automatically excluded.
    penalizer_coef : float
        L2 regularization penalty.
    frequency_col : str
        Column name for purchase frequency.
    monetary_col : str
        Column name for average monetary value.

    Returns
    -------
    dict
        Fitted model results with keys:
        - ``model``: fitted ``GammaGammaFitter`` instance
        - ``params`` (dict): {p, q, v} parameter estimates
        - ``freq_monetary_correlation`` (float): Pearson correlation
        - ``independence_ok`` (bool): True if correlation < 0.3
        - ``customers_excluded`` (int): count of one-time purchasers dropped
    """
    from lifetimes import GammaGammaFitter

    # Filter to repeat purchasers only (frequency > 0 required by Gamma-Gamma)
    total_customers = len(rfm)
    repeat_mask = rfm[frequency_col] > 0
    rfm_repeat = rfm[repeat_mask].copy()
    customers_excluded = int(total_customers - len(rfm_repeat))

    if len(rfm_repeat) == 0:
        raise ValueError("No customers with frequency > 0. Gamma-Gamma requires repeat purchasers.")

    # Drop rows with missing monetary value
    rfm_repeat = rfm_repeat.dropna(subset=[monetary_col])

    # Validate independence assumption
    corr = rfm_repeat[[frequency_col, monetary_col]].corr().iloc[0, 1]
    independence_ok = abs(corr) < 0.3

    if not independence_ok:
        logger.warning(
            "Frequency-monetary correlation is %.4f (threshold: 0.3). "
            "Gamma-Gamma independence assumption may be violated. "
            "Consider log-transforming monetary value or documenting the limitation.",
            corr,
        )

    ggf = GammaGammaFitter(penalizer_coef=penalizer_coef)
    ggf.fit(rfm_repeat[frequency_col], rfm_repeat[monetary_col])

    params = {
        "p": ggf.params_["p"],
        "q": ggf.params_["q"],
        "v": ggf.params_["v"],
    }

    return {
        "model": ggf,
        "params": params,
        "freq_monetary_correlation": float(corr),
        "independence_ok": bool(independence_ok),
        "customers_excluded": customers_excluded,
    }


def fit_gamma_gamma_bayesian(
    rfm: pd.DataFrame,
    tune: int = 1000,
    draws: int = 1000,
    chains: int = 4,
    target_accept: float = 0.9,
    model_config: Optional[dict] = None,
    random_seed: int = 42,
) -> dict[str, Any]:
    """Fit Gamma-Gamma model using Bayesian MCMC via PyMC-Marketing.

    Parameters
    ----------
    rfm : pd.DataFrame
        RFM summary with customer_id, frequency, monetary_value columns.
        Customers with frequency == 0 are automatically excluded.
    tune : int
        Number of MCMC tuning steps.
    draws : int
        Number of posterior draws per chain.
    chains : int
        Number of MCMC chains.
    target_accept : float
        Target acceptance probability.
    model_config : dict or None
        Prior distribution overrides.
    random_seed : int
        Random seed for reproducibility.

    Returns
    -------
    dict
        Fitted model results with keys:
        - ``model``: fitted ``GammaGammaModel`` instance
        - ``idata``: ArviZ InferenceData
        - ``convergence`` (dict): R-hat and ESS diagnostics
        - ``converged`` (bool): all diagnostics pass
    """
    import arviz as az
    from pymc_marketing.clv import GammaGammaModel

    # Filter to repeat purchasers only (Gamma-Gamma requires frequency > 0)
    repeat_mask = rfm["frequency"] > 0
    rfm_repeat = rfm[repeat_mask].copy()
    rfm_repeat = rfm_repeat.dropna(subset=["monetary_value"])

    if len(rfm_repeat) == 0:
        raise ValueError("No customers with frequency > 0 and non-null monetary_value.")

    model_data = rfm_repeat[["customer_id", "frequency", "monetary_value"]].copy()
    model_data["customer_id"] = model_data["customer_id"].astype(str)

    kwargs = {}
    if model_config is not None:
        kwargs["model_config"] = model_config

    sampler_config = {
        "tune": tune,
        "draws": draws,
        "chains": chains,
        "target_accept": target_accept,
        "random_seed": random_seed,
    }

    model = GammaGammaModel(
        data=model_data,
        sampler_config=sampler_config,
        **kwargs,
    )
    model.fit()

    idata = model.idata

    # Convergence diagnostics
    var_names = [v for v in ["p", "q", "v"] if v in idata.posterior]
    if not var_names:
        var_names = list(idata.posterior.data_vars)

    summary = az.summary(idata, var_names=var_names)
    convergence = {}
    for param in summary.index:
        convergence[param] = {
            "r_hat": float(summary.loc[param, "r_hat"]),
            "ess_bulk": float(summary.loc[param, "ess_bulk"]),
        }

    all_rhat_ok = all(v["r_hat"] < 1.01 for v in convergence.values())
    all_ess_ok = all(v["ess_bulk"] > 400 for v in convergence.values())

    return {
        "model": model,
        "idata": idata,
        "convergence": convergence,
        "converged": bool(all_rhat_ok and all_ess_ok),
    }


def fit_beta_geometric(
    subscriptions: pd.DataFrame,
    customer_col: str = "customer_id",
    start_col: str = "start_date",
    end_col: str = "end_date",
    period: str = "M",
) -> dict[str, Any]:
    """Fit Beta-Geometric model for contractual/subscription churn.

    Converts subscription data to renewal-period survival format and fits
    a Beta-Geometric model to estimate per-period churn probabilities.

    Parameters
    ----------
    subscriptions : pd.DataFrame
        Subscription data with customer_id, start_date, end_date (null if active).
    customer_col : str
        Column name for customer identifier.
    start_col : str
        Column name for subscription start date.
    end_col : str
        Column name for subscription end date (null/NaT if still active).
    period : str
        Renewal period granularity: ``"M"`` (month), ``"Q"`` (quarter), ``"Y"`` (year).

    Returns
    -------
    dict
        Fitted model results with keys:
        - ``params`` (dict): {alpha, beta} of the Beta distribution on churn
        - ``mean_churn_rate`` (float): alpha / (alpha + beta)
        - ``retention_curve`` (list[float]): survival probabilities by period
        - ``expected_lifetime`` (dict): per-customer expected remaining periods
    """
    from scipy.optimize import minimize

    subs = subscriptions.copy()
    subs[start_col] = pd.to_datetime(subs[start_col])
    subs[end_col] = pd.to_datetime(subs[end_col])

    now = pd.Timestamp.now()

    # Compute number of periods each customer survived
    # For active customers (end_date is NaT), use current date
    subs["_end"] = subs[end_col].fillna(now)
    subs["_churned"] = subs[end_col].notna()

    # Compute tenure in periods
    if period == "M":
        subs["_periods"] = (subs["_end"].dt.year - subs[start_col].dt.year) * 12 + (
            subs["_end"].dt.month - subs[start_col].dt.month
        )
    elif period == "Q":
        subs["_periods"] = (subs["_end"].dt.year - subs[start_col].dt.year) * 4 + (
            subs["_end"].dt.to_period("Q").astype(int) - subs[start_col].dt.to_period("Q").astype(int)
        )
    elif period == "Y":
        subs["_periods"] = subs["_end"].dt.year - subs[start_col].dt.year
    else:
        raise ValueError(f"Unsupported period: {period}. Use 'M', 'Q', or 'Y'.")

    subs["_periods"] = subs["_periods"].clip(lower=0).astype(int)

    # Build survival data: for each period t, count how many survived and how many churned
    max_period = int(subs["_periods"].max())
    if max_period == 0:
        max_period = 1

    # BG model log-likelihood using Beta-Geometric
    # For each customer: if churned at period n, P(churn at n) = B(alpha+1, beta+n-1)/B(alpha, beta)
    # If still active after n periods, P(survive n) = B(alpha, beta+n)/B(alpha, beta)
    periods = subs["_periods"].values
    churned = subs["_churned"].values.astype(int)

    def neg_log_likelihood(params):
        alpha, beta_param = np.exp(params)  # ensure positive
        ll = 0.0
        for i in range(len(periods)):
            n = periods[i]
            if n == 0:
                if churned[i]:
                    # Churned immediately: P = alpha / (alpha + beta)
                    ll += np.log(alpha) - np.log(alpha + beta_param)
                else:
                    # Active with 0 periods: trivially 1 (just started)
                    pass
            else:
                if churned[i]:
                    # Churned at period n: P = B(alpha+1, beta+n-1)/B(alpha, beta)
                    from scipy.special import betaln

                    ll += betaln(alpha + 1, beta_param + n - 1) - betaln(alpha, beta_param)
                else:
                    # Survived n periods: P = B(alpha, beta+n)/B(alpha, beta)
                    from scipy.special import betaln

                    ll += betaln(alpha, beta_param + n) - betaln(alpha, beta_param)
        return -ll

    # Optimize
    result = minimize(neg_log_likelihood, x0=[0.0, 0.0], method="Nelder-Mead")
    alpha_hat, beta_hat = np.exp(result.x)

    mean_churn_rate = alpha_hat / (alpha_hat + beta_hat)

    # Retention curve: S(n) = B(alpha, beta+n) / B(alpha, beta)
    from scipy.special import betaln

    retention_curve = []
    for n in range(max_period + 1):
        survival_prob = np.exp(betaln(alpha_hat, beta_hat + n) - betaln(alpha_hat, beta_hat))
        retention_curve.append(float(survival_prob))

    # Expected remaining lifetime per customer
    # For a customer active at period n:
    # E[remaining] = sum_{j=1}^{inf} S(n+j)/S(n)
    # Approximate with a large upper bound
    expected_lifetime = {}
    for _, row in subs.iterrows():
        if not row["_churned"]:
            n = int(row["_periods"])
            s_n = np.exp(betaln(alpha_hat, beta_hat + n) - betaln(alpha_hat, beta_hat))
            if s_n > 0:
                remaining = 0.0
                for j in range(1, 200):
                    s_nj = np.exp(betaln(alpha_hat, beta_hat + n + j) - betaln(alpha_hat, beta_hat))
                    increment = s_nj / s_n
                    if increment < 1e-8:
                        break
                    remaining += increment
                expected_lifetime[str(row[customer_col])] = float(remaining)
            else:
                expected_lifetime[str(row[customer_col])] = 0.0

    return {
        "params": {"alpha": float(alpha_hat), "beta": float(beta_hat)},
        "mean_churn_rate": float(mean_churn_rate),
        "retention_curve": retention_curve,
        "expected_lifetime": expected_lifetime,
    }


def save_model(
    model_result: dict[str, Any],
    output_dir: str | Path = "workspace/models",
    model_name: str = "bgnbd",
) -> Path:
    """Serialize a fitted model to disk.

    Saves the model object (pickle) and inference data (NetCDF) if available.

    Parameters
    ----------
    model_result : dict
        Output from one of the fit functions.
    output_dir : str or Path
        Directory for saved model artifacts.
    model_name : str
        Base name for the saved files.

    Returns
    -------
    Path
        Path to the primary saved model file.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Save the model object via pickle
    model_path = output_dir / f"{model_name}.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(model_result["model"], f)

    # If Bayesian, also save the InferenceData as NetCDF
    if "idata" in model_result and model_result["idata"] is not None:
        idata_path = output_dir / f"{model_name}_trace.nc"
        model_result["idata"].to_netcdf(str(idata_path))
        logger.info("Saved inference data to %s", idata_path)

    logger.info("Saved model to %s", model_path)
    return model_path.resolve()


def fit_models(
    rfm_path: str | Path,
    method: Literal["mle", "bayesian"] = "mle",
    subscriptions_path: Optional[str | Path] = None,
    output_dir: str | Path = "workspace/models",
) -> dict[str, dict[str, Any]]:
    """Run the full model fitting pipeline.

    Fits BG/NBD and Gamma-Gamma models (and optionally Beta-Geometric)
    using the specified method.

    Parameters
    ----------
    rfm_path : str or Path
        Path to the RFM summary CSV.
    method : {"mle", "bayesian"}
        Fitting method to use.
    subscriptions_path : str or Path or None
        Path to subscription data for contractual CLV. If provided,
        Beta-Geometric model is also fitted.
    output_dir : str or Path
        Directory for saving fitted model artifacts.

    Returns
    -------
    dict
        Keys: ``"bgnbd"``, ``"gamma_gamma"``, and optionally ``"beta_geo"``.
        Values: result dicts from the respective fit functions.
    """
    rfm = pd.read_csv(rfm_path)

    results = {}

    # Fit BG/NBD
    print(f"Fitting BG/NBD model ({method})...")
    if method == "mle":
        bgnbd_result = fit_bgnbd_mle(rfm)
    else:
        bgnbd_result = fit_bgnbd_bayesian(rfm)

    results["bgnbd"] = bgnbd_result
    save_model(bgnbd_result, output_dir=output_dir, model_name="bgnbd")

    # Fit Gamma-Gamma
    print(f"Fitting Gamma-Gamma model ({method})...")
    if method == "mle":
        gg_result = fit_gamma_gamma_mle(rfm)
    else:
        gg_result = fit_gamma_gamma_bayesian(rfm)

    results["gamma_gamma"] = gg_result
    save_model(gg_result, output_dir=output_dir, model_name="gamma_gamma")

    # Optionally fit Beta-Geometric
    if subscriptions_path is not None:
        print("Fitting Beta-Geometric model for contractual churn...")
        subs = pd.read_csv(subscriptions_path)
        bg_result = fit_beta_geometric(subs)
        results["beta_geo"] = bg_result
        # Save Beta-Geometric params as pickle (no lifetimes model object)
        bg_path = Path(output_dir) / "beta_geo.pkl"
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        with open(bg_path, "wb") as f:
            pickle.dump(bg_result, f)

    return results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Fit BG/NBD and Gamma-Gamma CLV models")
    parser.add_argument("--rfm", required=True, help="Path to RFM summary CSV")
    parser.add_argument("--method", default="mle", choices=["mle", "bayesian"])
    parser.add_argument("--subscriptions", default=None, help="Path to subscriptions CSV")
    parser.add_argument("--output-dir", default="workspace/models")
    args = parser.parse_args()

    results = fit_models(
        rfm_path=args.rfm,
        method=args.method,
        subscriptions_path=args.subscriptions,
        output_dir=args.output_dir,
    )
    for model_name, result in results.items():
        print(f"{model_name}: converged={result.get('converged', 'N/A')}")
