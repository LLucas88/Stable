"""
RFM Summary Generation from Raw Transaction Data.

Converts transaction-level data (customer_id, date, amount) into
Recency-Frequency-Monetary-Tenure summaries suitable for BG/NBD
and Gamma-Gamma model fitting.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd


def load_transactions(
    filepath: str | Path,
    customer_col: str = "customer_id",
    date_col: str = "date",
    amount_col: str = "amount",
    date_format: Optional[str] = None,
) -> pd.DataFrame:
    """Load and parse raw transaction data from CSV.

    Parameters
    ----------
    filepath : str or Path
        Path to the transaction CSV file.
    customer_col : str
        Column name for customer identifier.
    date_col : str
        Column name for transaction date.
    amount_col : str
        Column name for transaction amount.
    date_format : str or None
        Explicit date format string. If None, pandas will infer the format.

    Returns
    -------
    pd.DataFrame
        Cleaned transaction DataFrame with standardized column names:
        ``customer_id``, ``date``, ``amount``.

    Raises
    ------
    FileNotFoundError
        If the transaction file does not exist.
    ValueError
        If required columns are missing from the file.
    """
    filepath = Path(filepath)
    if not filepath.exists():
        raise FileNotFoundError(f"Transaction file not found: {filepath}")

    df = pd.read_csv(filepath)

    # Validate required columns exist
    required = {customer_col, date_col, amount_col}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}. Available columns: {list(df.columns)}")

    # Rename to standardized names
    rename_map = {
        customer_col: "customer_id",
        date_col: "date",
        amount_col: "amount",
    }
    df = df.rename(columns=rename_map)

    # Parse dates
    if date_format is not None:
        df["date"] = pd.to_datetime(df["date"], format=date_format)
    else:
        df["date"] = pd.to_datetime(df["date"])

    # Ensure amount is numeric
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")

    # Ensure customer_id is string for consistent join behavior
    df["customer_id"] = df["customer_id"].astype(str)

    # Sort by date
    df = df.sort_values("date").reset_index(drop=True)

    return df


def validate_transactions(transactions: pd.DataFrame) -> dict[str, any]:
    """Run data quality checks on transaction data.

    Checks performed:
    - Duplicate transactions (same customer, date, amount)
    - Negative or zero amounts
    - Future dates beyond the observation period
    - Missing values in key columns

    Parameters
    ----------
    transactions : pd.DataFrame
        Transaction DataFrame with columns ``customer_id``, ``date``, ``amount``.

    Returns
    -------
    dict
        Data quality report with keys:
        - ``duplicate_count`` (int): number of exact duplicate rows
        - ``negative_amount_count`` (int): rows with amount <= 0
        - ``future_date_count`` (int): rows with dates in the future
        - ``missing_value_counts`` (dict[str, int]): missing values per column
        - ``total_transactions`` (int): total row count
        - ``unique_customers`` (int): distinct customer count
        - ``date_range`` (tuple[str, str]): earliest and latest dates
        - ``is_clean`` (bool): True if no issues found
    """
    now = pd.Timestamp.now()

    duplicate_count = int(transactions.duplicated(subset=["customer_id", "date", "amount"]).sum())
    negative_amount_count = int((transactions["amount"] <= 0).sum())
    future_date_count = int((transactions["date"] > now).sum())
    missing_value_counts = {col: int(transactions[col].isna().sum()) for col in ["customer_id", "date", "amount"]}

    total_transactions = len(transactions)
    unique_customers = transactions["customer_id"].nunique()

    min_date = transactions["date"].min()
    max_date = transactions["date"].max()
    date_range = (
        str(min_date.date()) if pd.notna(min_date) else None,
        str(max_date.date()) if pd.notna(max_date) else None,
    )

    total_issues = duplicate_count + negative_amount_count + future_date_count + sum(missing_value_counts.values())

    return {
        "duplicate_count": duplicate_count,
        "negative_amount_count": negative_amount_count,
        "future_date_count": future_date_count,
        "missing_value_counts": missing_value_counts,
        "total_transactions": total_transactions,
        "unique_customers": unique_customers,
        "date_range": date_range,
        "is_clean": total_issues == 0,
    }


def build_rfm_summary(
    transactions: pd.DataFrame,
    observation_end: Optional[str] = None,
    time_unit: str = "D",
    monetary_repeat_only: bool = True,
) -> pd.DataFrame:
    """Generate RFM summary from transaction-level data.

    Computes per-customer:
    - **frequency**: count of repeat purchases (excludes first)
    - **recency**: time from first purchase to last purchase
    - **T**: time from first purchase to observation end
    - **monetary_value**: mean transaction value (repeat purchases only by default)

    Parameters
    ----------
    transactions : pd.DataFrame
        Cleaned transaction data with ``customer_id``, ``date``, ``amount``.
    observation_end : str or None
        End of the observation period as an ISO date string.
        Defaults to the maximum transaction date in the data.
    time_unit : str
        Pandas time unit for recency and T calculation.
        ``"D"`` for days (default), ``"W"`` for weeks.
    monetary_repeat_only : bool
        If True (default), compute monetary value from repeat purchases only,
        as required by the Gamma-Gamma model.

    Returns
    -------
    pd.DataFrame
        RFM summary with columns: ``customer_id``, ``frequency``, ``recency``,
        ``T``, ``monetary_value``. One row per customer. Customers with
        frequency == 0 have monetary_value = NaN.
    """
    if observation_end is not None:
        obs_end = pd.Timestamp(observation_end)
    else:
        obs_end = transactions["date"].max()

    # Determine time divisor based on unit
    if time_unit == "W":
        divisor = np.timedelta64(7, "D")
    else:
        divisor = np.timedelta64(1, "D")

    grouped = transactions.groupby("customer_id")

    first_purchase = grouped["date"].min()
    last_purchase = grouped["date"].max()
    total_count = grouped["date"].count()

    # frequency = number of repeat purchases (total purchases - 1)
    frequency = (total_count - 1).astype(int)

    # recency = time from first purchase to last purchase (in time_unit)
    recency = (last_purchase - first_purchase) / divisor
    recency = recency.astype(float)

    # T = time from first purchase to observation end (in time_unit)
    T = (obs_end - first_purchase) / divisor
    T = T.astype(float)

    rfm = pd.DataFrame(
        {
            "customer_id": frequency.index,
            "frequency": frequency.values,
            "recency": recency.values,
            "T": T.values,
        }
    )

    # Compute monetary_value
    if monetary_repeat_only:
        # For each customer, exclude the first transaction chronologically
        # and compute mean amount on the remaining (repeat) transactions
        txns_sorted = transactions.sort_values(["customer_id", "date"])
        # Mark the first transaction per customer
        txns_sorted["_is_first"] = ~txns_sorted.duplicated(subset=["customer_id"], keep="first")
        repeat_txns = txns_sorted[~txns_sorted["_is_first"]]
        repeat_monetary = repeat_txns.groupby("customer_id")["amount"].mean().rename("monetary_value")
        rfm = rfm.merge(repeat_monetary, on="customer_id", how="left")
        # Customers with frequency == 0 will have NaN monetary_value (correct)
    else:
        all_monetary = transactions.groupby("customer_id")["amount"].mean().rename("monetary_value").reset_index()
        rfm = rfm.merge(all_monetary, on="customer_id", how="left")

    return rfm


def save_rfm_summary(
    rfm: pd.DataFrame,
    output_path: str | Path = "workspace/analysis/rfm_summary.csv",
) -> Path:
    """Save RFM summary to CSV.

    Parameters
    ----------
    rfm : pd.DataFrame
        RFM summary DataFrame.
    output_path : str or Path
        Destination file path.

    Returns
    -------
    Path
        Resolved path to the saved file.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    rfm.to_csv(output_path, index=False)
    return output_path.resolve()


def print_rfm_diagnostics(rfm: pd.DataFrame) -> None:
    """Print summary statistics of the RFM table for diagnostic purposes.

    Reports:
    - Total customers and repeat-purchaser count
    - Frequency distribution (mean, median, max)
    - Recency distribution
    - Monetary value distribution (repeat purchasers only)
    - Correlation between frequency and monetary value (Gamma-Gamma check)

    Parameters
    ----------
    rfm : pd.DataFrame
        RFM summary DataFrame.
    """
    total_customers = len(rfm)
    repeat_purchasers = int((rfm["frequency"] > 0).sum())
    one_time = total_customers - repeat_purchasers

    print("=" * 60)
    print("RFM Summary Diagnostics")
    print("=" * 60)
    print(f"Total customers:      {total_customers:,}")
    print(f"Repeat purchasers:    {repeat_purchasers:,} ({100 * repeat_purchasers / total_customers:.1f}%)")
    print(f"One-time purchasers:  {one_time:,} ({100 * one_time / total_customers:.1f}%)")
    print()

    print("Frequency (repeat purchases):")
    print(f"  Mean:   {rfm['frequency'].mean():.2f}")
    print(f"  Median: {rfm['frequency'].median():.1f}")
    print(f"  Max:    {rfm['frequency'].max()}")
    print()

    print("Recency (days from first to last purchase):")
    print(f"  Mean:   {rfm['recency'].mean():.1f}")
    print(f"  Median: {rfm['recency'].median():.1f}")
    print(f"  Max:    {rfm['recency'].max():.1f}")
    print()

    print("Tenure T (days from first purchase to observation end):")
    print(f"  Mean:   {rfm['T'].mean():.1f}")
    print(f"  Median: {rfm['T'].median():.1f}")
    print(f"  Max:    {rfm['T'].max():.1f}")
    print()

    # Monetary value diagnostics (repeat purchasers only)
    repeat_rfm = rfm[rfm["frequency"] > 0]
    if len(repeat_rfm) > 0 and "monetary_value" in rfm.columns:
        mv = repeat_rfm["monetary_value"].dropna()
        print("Monetary Value (repeat purchasers only):")
        print(f"  Mean:   {mv.mean():.2f}")
        print(f"  Median: {mv.median():.2f}")
        print(f"  Std:    {mv.std():.2f}")
        print(f"  Min:    {mv.min():.2f}")
        print(f"  Max:    {mv.max():.2f}")
        print()

        # Gamma-Gamma independence check
        corr = repeat_rfm[["frequency", "monetary_value"]].corr().iloc[0, 1]
        status = "OK" if abs(corr) < 0.3 else "WARNING - may violate Gamma-Gamma assumption"
        print(f"Frequency-Monetary Correlation: {corr:.4f} ({status})")
    else:
        print("Monetary Value: No repeat purchasers available for diagnostics.")

    print("=" * 60)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate RFM summary from transactions")
    parser.add_argument("--input", required=True, help="Path to transactions CSV")
    parser.add_argument("--output", default="workspace/analysis/rfm_summary.csv")
    parser.add_argument("--observation-end", default=None, help="ISO date for observation end")
    parser.add_argument("--time-unit", default="D", choices=["D", "W"])
    args = parser.parse_args()

    txns = load_transactions(args.input)
    quality = validate_transactions(txns)
    print(f"Data quality report: {quality}")

    rfm = build_rfm_summary(txns, observation_end=args.observation_end, time_unit=args.time_unit)
    print_rfm_diagnostics(rfm)
    save_rfm_summary(rfm, args.output)
