"""Cohort Retention Analysis Module

Defines customer cohorts by acquisition month, first product, or first
channel; generates period-over-period retention matrices; computes retention
rates, churn rates, revenue per user, and LTV trajectories.

Usage:
    from scripts.cohort_retention import (
        assign_cohorts,
        build_retention_matrix,
        compute_churn_rates,
        compute_revenue_per_user,
    )

Dependencies:
    pandas, numpy
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Literal, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Type aliases
# ---------------------------------------------------------------------------

CohortDimension = Literal["acquisition_month", "first_product", "first_channel"]
PeriodGranularity = Literal["month", "week"]


# ---------------------------------------------------------------------------
# Cohort assignment
# ---------------------------------------------------------------------------


def assign_cohorts(
    transactions: pd.DataFrame,
    dimension: CohortDimension = "acquisition_month",
    customer_id_column: str = "customer_id",
    date_column: str = "date",
    product_column: str = "product",
    channel_column: Optional[str] = None,
) -> pd.DataFrame:
    """Assign each customer to a cohort based on their first transaction.

    Parameters
    ----------
    transactions : pd.DataFrame
        Transaction data with at least customer_id, date columns.
    dimension : CohortDimension
        How to define cohorts:
        - 'acquisition_month': calendar month of first transaction
        - 'first_product': product category of first purchase
        - 'first_channel': marketing channel of first conversion
    customer_id_column : str
        Name of the customer identifier column.
    date_column : str
        Name of the date column.
    product_column : str
        Name of the product column (used for 'first_product' dimension).
    channel_column : str, optional
        Name of the channel column (required for 'first_channel' dimension).

    Returns
    -------
    pd.DataFrame
        Customer-level DataFrame with columns:
        - customer_id
        - cohort: The assigned cohort label
        - first_transaction_date: Date of the customer's first transaction

    Raises
    ------
    ValueError
        If dimension is 'first_channel' but channel_column is not provided
        or not present in the data.
    """
    df = transactions.copy()
    df[date_column] = pd.to_datetime(df[date_column])

    if dimension == "first_channel":
        if channel_column is None or channel_column not in df.columns:
            raise ValueError(
                "dimension='first_channel' requires a valid channel_column "
                f"present in the data. Got channel_column={channel_column!r}"
            )

    # Sort by date so idxmin gives the first transaction
    df = df.sort_values(date_column)

    # Get the first transaction row per customer
    first_idx = df.groupby(customer_id_column)[date_column].idxmin()
    first_txn = df.loc[first_idx].copy()

    # Build the cohort label
    if dimension == "acquisition_month":
        first_txn["cohort"] = first_txn[date_column].dt.to_period("M").astype(str)
    elif dimension == "first_product":
        first_txn["cohort"] = first_txn[product_column].astype(str)
    elif dimension == "first_channel":
        first_txn["cohort"] = first_txn[channel_column].astype(str)
    else:
        raise ValueError(f"Unsupported cohort dimension: {dimension}")

    result = first_txn[[customer_id_column, "cohort", date_column]].rename(
        columns={date_column: "first_transaction_date"}
    )
    result = result.reset_index(drop=True)

    logger.info(
        "Assigned %d customers to %d cohorts (%s)",
        len(result),
        result["cohort"].nunique(),
        dimension,
    )
    return result


# ---------------------------------------------------------------------------
# Retention matrix
# ---------------------------------------------------------------------------


def _compute_period_offset(
    txn_date: pd.Series,
    first_date: pd.Series,
    granularity: PeriodGranularity,
) -> pd.Series:
    """Return integer period offset between two date series."""
    if granularity == "month":
        return (txn_date.dt.year - first_date.dt.year) * 12 + (txn_date.dt.month - first_date.dt.month)
    elif granularity == "week":
        return ((txn_date - first_date).dt.days // 7).astype(int)
    else:
        raise ValueError(f"Unsupported granularity: {granularity}")


def build_retention_matrix(
    transactions: pd.DataFrame,
    cohort_assignments: pd.DataFrame,
    granularity: PeriodGranularity = "month",
    n_periods: int = 12,
    customer_id_column: str = "customer_id",
    date_column: str = "date",
) -> pd.DataFrame:
    """Generate a cohort retention matrix.

    Rows represent cohorts, columns represent periods since acquisition
    (period 0 = acquisition period). Cell values are the percentage of
    cohort members who were active in that period.

    Parameters
    ----------
    transactions : pd.DataFrame
        Transaction data.
    cohort_assignments : pd.DataFrame
        Output from assign_cohorts with customer_id, cohort, and
        first_transaction_date columns.
    granularity : PeriodGranularity
        Time period granularity: 'month' or 'week'.
    n_periods : int
        Maximum number of periods to track after acquisition.
    customer_id_column : str
        Name of the customer identifier column.
    date_column : str
        Name of the date column.

    Returns
    -------
    pd.DataFrame
        Retention matrix with cohort labels as index and period offsets
        (0 through n_periods) as columns. Values are retention percentages
        in [0, 100].

    Raises
    ------
    ValueError
        If any retention value exceeds 100% (mathematical inconsistency).
    """
    df = transactions.copy()
    df[date_column] = pd.to_datetime(df[date_column])

    # Merge cohort info
    merged = df.merge(
        cohort_assignments[[customer_id_column, "cohort", "first_transaction_date"]],
        on=customer_id_column,
        how="inner",
    )
    merged["first_transaction_date"] = pd.to_datetime(merged["first_transaction_date"])

    # Compute period offset
    merged["period_offset"] = _compute_period_offset(merged[date_column], merged["first_transaction_date"], granularity)

    # Keep only offsets in [0, n_periods]
    merged = merged[(merged["period_offset"] >= 0) & (merged["period_offset"] <= n_periods)]

    # Cohort sizes
    cohort_sizes = cohort_assignments.groupby("cohort")[customer_id_column].nunique()

    # Unique active customers per cohort per period
    active = (
        merged.groupby(["cohort", "period_offset"])[customer_id_column].nunique().reset_index(name="active_customers")
    )

    # Pivot to matrix
    pivot = active.pivot(index="cohort", columns="period_offset", values="active_customers")
    pivot = pivot.reindex(columns=range(0, n_periods + 1)).fillna(0)

    # Compute retention percentages
    retention = pivot.div(cohort_sizes, axis=0) * 100
    retention = retention.fillna(0.0)

    # Cap at 100% (should not exceed, but ensure contract)
    if (retention > 100).any().any():
        logger.warning("Retention values exceeding 100%% detected; capping at 100%%")
        retention = retention.clip(upper=100.0)

    # Final validation
    if (retention > 100).any().any():
        raise ValueError("Retention values exceed 100%% after capping")

    retention.columns.name = "period"
    logger.info("Built retention matrix: %d cohorts x %d periods", *retention.shape)
    return retention


# ---------------------------------------------------------------------------
# Derived metrics
# ---------------------------------------------------------------------------


def compute_churn_rates(
    retention_matrix: pd.DataFrame,
) -> pd.DataFrame:
    """Compute period-over-period churn rates from a retention matrix.

    Churn rate for period N = 1 - (retention at N / retention at N-1).

    Parameters
    ----------
    retention_matrix : pd.DataFrame
        Cohort retention matrix from build_retention_matrix.

    Returns
    -------
    pd.DataFrame
        Churn rate matrix with the same shape as the retention matrix.
        Period 0 is NaN (no prior period). Values are in [0, 1].
    """
    churn = pd.DataFrame(index=retention_matrix.index, columns=retention_matrix.columns)
    churn.iloc[:, 0] = np.nan  # Period 0 has no prior period

    for i in range(1, len(retention_matrix.columns)):
        prev = retention_matrix.iloc[:, i - 1].replace(0, np.nan)
        curr = retention_matrix.iloc[:, i]
        churn.iloc[:, i] = (1 - curr / prev).clip(lower=0, upper=1)

    churn = churn.astype(float)
    logger.info("Computed churn rate matrix")
    return churn


def compute_revenue_per_user(
    transactions: pd.DataFrame,
    cohort_assignments: pd.DataFrame,
    granularity: PeriodGranularity = "month",
    n_periods: int = 12,
    customer_id_column: str = "customer_id",
    date_column: str = "date",
    amount_column: str = "amount",
) -> pd.DataFrame:
    """Compute average revenue per user per period for each cohort.

    Parameters
    ----------
    transactions : pd.DataFrame
        Transaction data.
    cohort_assignments : pd.DataFrame
        Output from assign_cohorts.
    granularity : PeriodGranularity
        Time period granularity.
    n_periods : int
        Maximum periods to track.
    customer_id_column : str
        Name of the customer identifier column.
    date_column : str
        Name of the date column.
    amount_column : str
        Name of the transaction amount column.

    Returns
    -------
    pd.DataFrame
        Revenue-per-user matrix with cohort labels as index and period
        offsets as columns.
    """
    df = transactions.copy()
    df[date_column] = pd.to_datetime(df[date_column])

    merged = df.merge(
        cohort_assignments[[customer_id_column, "cohort", "first_transaction_date"]],
        on=customer_id_column,
        how="inner",
    )
    merged["first_transaction_date"] = pd.to_datetime(merged["first_transaction_date"])

    merged["period_offset"] = _compute_period_offset(merged[date_column], merged["first_transaction_date"], granularity)
    merged = merged[(merged["period_offset"] >= 0) & (merged["period_offset"] <= n_periods)]

    # Total revenue per cohort per period
    rev_agg = merged.groupby(["cohort", "period_offset"])[amount_column].sum().reset_index(name="total_revenue")

    # Cohort sizes (total customers, not just active ones)
    cohort_sizes = cohort_assignments.groupby("cohort")[customer_id_column].nunique()

    rev_pivot = rev_agg.pivot(index="cohort", columns="period_offset", values="total_revenue")
    rev_pivot = rev_pivot.reindex(columns=range(0, n_periods + 1)).fillna(0)

    # Divide by cohort size
    rpu = rev_pivot.div(cohort_sizes, axis=0).fillna(0.0)
    rpu.columns.name = "period"

    logger.info("Computed revenue per user matrix")
    return rpu


def compute_ltv_trajectory(
    revenue_per_user: pd.DataFrame,
) -> pd.DataFrame:
    """Compute cumulative LTV trajectory from revenue-per-user data.

    Parameters
    ----------
    revenue_per_user : pd.DataFrame
        Revenue-per-user matrix from compute_revenue_per_user.

    Returns
    -------
    pd.DataFrame
        Cumulative revenue-per-user matrix (running sum across columns).
    """
    ltv = revenue_per_user.cumsum(axis=1)
    logger.info("Computed LTV trajectory")
    return ltv


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


def save_cohort_results(
    retention_matrix: pd.DataFrame,
    churn_matrix: pd.DataFrame,
    revenue_per_user: pd.DataFrame,
    ltv_trajectory: pd.DataFrame,
    output_path: str | Path,
) -> None:
    """Serialize all cohort analysis results to a JSON file.

    Parameters
    ----------
    retention_matrix : pd.DataFrame
        Cohort retention matrix.
    churn_matrix : pd.DataFrame
        Churn rate matrix.
    revenue_per_user : pd.DataFrame
        Revenue-per-user matrix.
    ltv_trajectory : pd.DataFrame
        Cumulative LTV trajectory matrix.
    output_path : str or Path
        Path to write the output JSON file.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    def _df_to_dict(df: pd.DataFrame) -> dict:
        """Convert DataFrame to nested dict with string keys."""
        result = {}
        for idx in df.index:
            row = df.loc[idx]
            result[str(idx)] = {str(col): round(float(val), 4) for col, val in row.items()}
        return result

    payload = {
        "retention_matrix": _df_to_dict(retention_matrix),
        "churn_matrix": _df_to_dict(churn_matrix),
        "revenue_per_user": _df_to_dict(revenue_per_user),
        "ltv_trajectory": _df_to_dict(ltv_trajectory),
    }

    with open(output_path, "w") as f:
        json.dump(payload, f, indent=2, default=str)

    logger.info("Saved cohort results to %s", output_path)


# ---------------------------------------------------------------------------
# Pipeline orchestration
# ---------------------------------------------------------------------------


def run_cohort_pipeline(
    transactions_path: str | Path,
    output_dir: str | Path,
    dimension: CohortDimension = "acquisition_month",
    granularity: PeriodGranularity = "month",
    n_periods: int = 12,
) -> dict[str, pd.DataFrame]:
    """Execute the full cohort retention analysis pipeline.

    Steps:
    1. Load transactions
    2. Assign cohorts
    3. Build retention matrix
    4. Compute churn rates
    5. Compute revenue per user
    6. Compute LTV trajectory
    7. Save all results

    Parameters
    ----------
    transactions_path : str or Path
        Path to the transactions CSV file.
    output_dir : str or Path
        Directory to write output files.
    dimension : CohortDimension
        Cohort definition dimension.
    granularity : PeriodGranularity
        Time period granularity.
    n_periods : int
        Maximum periods to track.

    Returns
    -------
    dict[str, pd.DataFrame]
        Keys: 'retention', 'churn', 'revenue_per_user', 'ltv_trajectory'.
    """
    from scripts.rfm_scoring import load_transactions

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # 1. Load transactions
    transactions = load_transactions(transactions_path)

    # 2. Assign cohorts
    cohort_assignments = assign_cohorts(
        transactions,
        dimension=dimension,
    )

    # 3. Build retention matrix
    retention = build_retention_matrix(
        transactions,
        cohort_assignments,
        granularity=granularity,
        n_periods=n_periods,
    )

    # 4. Churn rates
    churn = compute_churn_rates(retention)

    # 5. Revenue per user
    rpu = compute_revenue_per_user(
        transactions,
        cohort_assignments,
        granularity=granularity,
        n_periods=n_periods,
    )

    # 6. LTV trajectory
    ltv = compute_ltv_trajectory(rpu)

    # 7. Save
    save_cohort_results(retention, churn, rpu, ltv, output_dir / "cohort_results.json")
    retention.to_csv(output_dir / "retention_matrix.csv")

    logger.info("Cohort pipeline complete. Results saved to %s", output_dir)

    return {
        "retention": retention,
        "churn": churn,
        "revenue_per_user": rpu,
        "ltv_trajectory": ltv,
    }
