"""RFM Scoring Module

Computes Recency, Frequency, and Monetary metrics from transaction data,
assigns quintile-based scores, maps composite scores to named customer
segments, and persists results.

Usage:
    from scripts.rfm_scoring import compute_rfm, assign_quintiles, label_segments

Dependencies:
    pandas, numpy
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default configuration
# ---------------------------------------------------------------------------

DEFAULT_ANALYSIS_WINDOW_DAYS: int = 365
DEFAULT_QUINTILE_BINS: int = 5
DEFAULT_RFM_WEIGHTS: dict[str, float] = {
    "recency": 0.4,
    "frequency": 0.3,
    "monetary": 0.3,
}

SEGMENT_RULES: list[dict[str, Any]] = [
    {"name": "Champions", "R": (4, 5), "F": (4, 5), "M": (4, 5)},
    {"name": "Loyal Customers", "R": (3, 5), "F": (4, 5), "M": (3, 5)},
    {"name": "Potential Loyalists", "R": (4, 5), "F": (1, 3), "M": (1, 3)},
    {"name": "New Customers", "R": (5, 5), "F": (1, 1), "M": (1, 3)},
    {"name": "Promising", "R": (3, 4), "F": (1, 2), "M": (1, 2)},
    {"name": "Needs Attention", "R": (3, 3), "F": (3, 3), "M": (3, 3)},
    {"name": "At-Risk", "R": (1, 2), "F": (4, 5), "M": (4, 5)},
    {"name": "About to Sleep", "R": (1, 3), "F": (1, 2), "M": (1, 2)},
    {"name": "Hibernating", "R": (1, 2), "F": (1, 3), "M": (1, 3)},
    {"name": "Lost", "R": (1, 1), "F": (1, 1), "M": (1, 2)},
]


# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------


def load_transactions(
    filepath: str | Path,
    date_column: str = "date",
    customer_id_column: str = "customer_id",
    amount_column: str = "amount",
) -> pd.DataFrame:
    """Load and validate transaction data from a CSV file.

    Parameters
    ----------
    filepath : str or Path
        Path to the transactions CSV file.
    date_column : str
        Name of the date column in the CSV.
    customer_id_column : str
        Name of the customer identifier column.
    amount_column : str
        Name of the transaction amount column.

    Returns
    -------
    pd.DataFrame
        Validated transaction DataFrame with parsed dates.

    Raises
    ------
    FileNotFoundError
        If the transactions file does not exist.
    ValueError
        If required columns are missing.
    """
    filepath = Path(filepath)
    if not filepath.exists():
        raise FileNotFoundError(f"Transactions file not found: {filepath}")

    df = pd.read_csv(filepath)

    required_columns = {date_column, customer_id_column, amount_column}
    missing = required_columns - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df[date_column] = pd.to_datetime(df[date_column])
    logger.info(
        "Loaded %d transactions for %d customers",
        len(df),
        df[customer_id_column].nunique(),
    )
    return df


def compute_rfm(
    transactions: pd.DataFrame,
    analysis_date: Optional[datetime] = None,
    customer_id_column: str = "customer_id",
    date_column: str = "date",
    amount_column: str = "amount",
    window_days: int = DEFAULT_ANALYSIS_WINDOW_DAYS,
) -> pd.DataFrame:
    """Compute raw RFM metrics for each customer.

    Parameters
    ----------
    transactions : pd.DataFrame
        Transaction data with at least customer_id, date, and amount columns.
    analysis_date : datetime, optional
        Reference date for recency calculation. Defaults to today.
    customer_id_column : str
        Name of the customer identifier column.
    date_column : str
        Name of the date column.
    amount_column : str
        Name of the transaction amount column.
    window_days : int
        Number of days of history to include.

    Returns
    -------
    pd.DataFrame
        DataFrame indexed by customer_id with columns:
        - recency (int): days since last transaction
        - frequency (int): number of transactions
        - monetary (float): total spend
    """
    if analysis_date is None:
        analysis_date = datetime.now()

    analysis_date = pd.Timestamp(analysis_date)
    cutoff_date = analysis_date - pd.Timedelta(days=window_days)

    df = transactions.copy()
    df[date_column] = pd.to_datetime(df[date_column])
    df = df[df[date_column] >= cutoff_date]

    grouped = df.groupby(customer_id_column).agg(
        recency=(date_column, lambda x: (analysis_date - x.max()).days),
        frequency=(date_column, "count"),
        monetary=(amount_column, "sum"),
    )

    grouped["recency"] = grouped["recency"].astype(int)
    grouped["frequency"] = grouped["frequency"].astype(int)
    grouped["monetary"] = grouped["monetary"].astype(float)

    logger.info("Computed RFM for %d customers", len(grouped))
    return grouped


def assign_quintiles(
    rfm_df: pd.DataFrame,
    n_bins: int = DEFAULT_QUINTILE_BINS,
) -> pd.DataFrame:
    """Assign quintile scores (1-5) for each RFM dimension.

    Recency is inverted so that lower values (more recent) get higher scores.
    Falls back to rank-based assignment if quantile boundaries are non-unique.

    Parameters
    ----------
    rfm_df : pd.DataFrame
        DataFrame with raw recency, frequency, monetary columns.
    n_bins : int
        Number of quantile bins (default 5 for quintiles).

    Returns
    -------
    pd.DataFrame
        Original DataFrame with additional columns:
        - r_score (int): Recency quintile score 1-5
        - f_score (int): Frequency quintile score 1-5
        - m_score (int): Monetary quintile score 1-5
        - rfm_composite (str): Concatenated score string, e.g., "543"
        - rfm_weighted (float): Weighted composite score
    """
    result = rfm_df.copy()
    labels = list(range(1, n_bins + 1))

    def _safe_qcut(series: pd.Series, ascending: bool = True) -> pd.Series:
        """Apply qcut with fallback to rank-based cut for non-unique edges."""
        order = labels if ascending else labels[::-1]
        try:
            return pd.qcut(series, q=n_bins, labels=order, duplicates="raise").astype(int)
        except ValueError:
            ranks = series.rank(method="first", ascending=ascending)
            return pd.cut(ranks, bins=n_bins, labels=labels).astype(int)

    # Recency: lower is better, so invert (ascending=False means low recency -> high score)
    result["r_score"] = _safe_qcut(result["recency"], ascending=False)
    result["f_score"] = _safe_qcut(result["frequency"], ascending=True)
    result["m_score"] = _safe_qcut(result["monetary"], ascending=True)

    result["rfm_composite"] = (
        result["r_score"].astype(str) + result["f_score"].astype(str) + result["m_score"].astype(str)
    )

    result["rfm_weighted"] = (
        DEFAULT_RFM_WEIGHTS["recency"] * result["r_score"]
        + DEFAULT_RFM_WEIGHTS["frequency"] * result["f_score"]
        + DEFAULT_RFM_WEIGHTS["monetary"] * result["m_score"]
    )

    logger.info("Assigned quintile scores to %d customers", len(result))
    return result


def label_segments(
    rfm_scored: pd.DataFrame,
    rules: Optional[list[dict[str, Any]]] = None,
) -> pd.DataFrame:
    """Map RFM quintile scores to named business segments.

    Applies rules in priority order (first match wins).

    Parameters
    ----------
    rfm_scored : pd.DataFrame
        DataFrame with r_score, f_score, m_score columns.
    rules : list of dict, optional
        Segment mapping rules. Each dict has keys: name, R (min, max),
        F (min, max), M (min, max). Defaults to SEGMENT_RULES.

    Returns
    -------
    pd.DataFrame
        Original DataFrame with an additional 'segment' column.

    Raises
    ------
    ValueError
        If any customer is not assigned to a segment (rules are not exhaustive).
    """
    if rules is None:
        rules = SEGMENT_RULES

    result = rfm_scored.copy()
    result["segment"] = None

    for rule in rules:
        r_min, r_max = rule["R"]
        f_min, f_max = rule["F"]
        m_min, m_max = rule["M"]

        mask = (
            (result["segment"].isna())
            & (result["r_score"] >= r_min)
            & (result["r_score"] <= r_max)
            & (result["f_score"] >= f_min)
            & (result["f_score"] <= f_max)
            & (result["m_score"] >= m_min)
            & (result["m_score"] <= m_max)
        )
        result.loc[mask, "segment"] = rule["name"]

    # Catch-all: any unassigned customers become "Lost"
    unassigned = result["segment"].isna()
    if unassigned.any():
        result.loc[unassigned, "segment"] = "Lost"
        logger.warning(
            "%d customers matched no rule and were assigned 'Lost'",
            unassigned.sum(),
        )

    # Verify exhaustiveness
    still_null = result["segment"].isna()
    if still_null.any():
        raise ValueError(f"{still_null.sum()} customers could not be assigned to any segment")

    logger.info("Segment distribution:\n%s", result["segment"].value_counts().to_string())
    return result


def save_rfm_boundaries(
    rfm_df: pd.DataFrame,
    analysis_date: datetime,
    output_path: str | Path,
) -> None:
    """Persist quintile boundary values for auditability.

    Parameters
    ----------
    rfm_df : pd.DataFrame
        DataFrame with raw recency, frequency, monetary values.
    analysis_date : datetime
        The reference date used for this scoring run.
    output_path : str or Path
        Path to write the boundaries JSON file.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    boundaries: dict[str, Any] = {
        "analysis_date": analysis_date.strftime("%Y-%m-%d"),
    }

    for metric in ("recency", "frequency", "monetary"):
        quantiles = rfm_df[metric].quantile([0.0, 0.2, 0.4, 0.6, 0.8, 1.0]).tolist()
        boundaries[f"{metric}_boundaries"] = [round(v, 2) for v in quantiles]

    with open(output_path, "w") as f:
        json.dump(boundaries, f, indent=2)

    logger.info("Saved RFM boundaries to %s", output_path)


def run_rfm_pipeline(
    transactions_path: str | Path,
    output_dir: str | Path,
    analysis_date: Optional[datetime] = None,
    window_days: int = DEFAULT_ANALYSIS_WINDOW_DAYS,
    n_bins: int = DEFAULT_QUINTILE_BINS,
) -> pd.DataFrame:
    """Execute the full RFM scoring pipeline end-to-end.

    Steps:
    1. Load transactions
    2. Compute raw RFM metrics
    3. Assign quintile scores
    4. Label named segments
    5. Save boundaries and segment assignments

    Parameters
    ----------
    transactions_path : str or Path
        Path to the transactions CSV file.
    output_dir : str or Path
        Directory to write output files.
    analysis_date : datetime, optional
        Reference date for recency. Defaults to today.
    window_days : int
        Number of days of history to include.
    n_bins : int
        Number of quantile bins.

    Returns
    -------
    pd.DataFrame
        Complete RFM-scored DataFrame with segment labels.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if analysis_date is None:
        analysis_date = datetime.now()

    # 1. Load transactions
    transactions = load_transactions(transactions_path)

    # 2. Compute raw RFM
    rfm_df = compute_rfm(
        transactions,
        analysis_date=analysis_date,
        window_days=window_days,
    )

    # 3. Assign quintile scores
    rfm_scored = assign_quintiles(rfm_df, n_bins=n_bins)

    # 4. Label segments
    rfm_labeled = label_segments(rfm_scored)

    # 5. Save outputs
    save_rfm_boundaries(rfm_df, analysis_date, output_dir / "rfm_boundaries.json")
    rfm_labeled.to_csv(output_dir / "rfm_segments.csv")
    logger.info("RFM pipeline complete. Results saved to %s", output_dir)

    return rfm_labeled
