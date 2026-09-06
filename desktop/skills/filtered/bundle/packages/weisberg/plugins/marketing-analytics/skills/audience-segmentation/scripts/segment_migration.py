"""Segment Migration Tracking Module

Computes period-over-period segment transition matrices showing how
customers move between segments across consecutive analysis periods.
Validates that all customers are accounted for (rows sum to 100%)
and flags notable migrations.

Usage:
    from scripts.segment_migration import (
        build_transition_matrix,
        detect_notable_migrations,
        run_migration_pipeline,
    )

Dependencies:
    pandas, numpy
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default configuration
# ---------------------------------------------------------------------------

# Migrations considered notable for alerting purposes
NOTABLE_MIGRATIONS: list[dict[str, str]] = [
    {"from": "Champions", "to": "At-Risk"},
    {"from": "Champions", "to": "Hibernating"},
    {"from": "Champions", "to": "Lost"},
    {"from": "Loyal Customers", "to": "At-Risk"},
    {"from": "Loyal Customers", "to": "Hibernating"},
    {"from": "Hibernating", "to": "Loyal Customers"},
    {"from": "Hibernating", "to": "Champions"},
    {"from": "At-Risk", "to": "Champions"},
    {"from": "Lost", "to": "Potential Loyalists"},
]

ROW_SUM_TOLERANCE: float = 0.01  # Acceptable deviation from 100%


# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------


def load_segment_assignments(
    filepath: str | Path,
    customer_id_column: str = "customer_id",
    segment_column: str = "segment",
    period_column: str = "period",
) -> pd.DataFrame:
    """Load segment assignment data for multiple periods.

    Parameters
    ----------
    filepath : str or Path
        Path to a CSV or JSON file containing customer segment assignments
        with a period identifier column.
    customer_id_column : str
        Name of the customer identifier column.
    segment_column : str
        Name of the segment label column.
    period_column : str
        Name of the period identifier column (e.g., '2026-01', '2026-02').

    Returns
    -------
    pd.DataFrame
        Segment assignments with customer_id, segment, and period columns.

    Raises
    ------
    FileNotFoundError
        If the file does not exist.
    ValueError
        If required columns are missing or fewer than 2 periods are present.
    """
    filepath = Path(filepath)
    if not filepath.exists():
        raise FileNotFoundError(f"Segment assignments file not found: {filepath}")

    if filepath.suffix == ".json":
        df = pd.read_json(filepath)
    else:
        df = pd.read_csv(filepath)

    required_columns = {customer_id_column, segment_column, period_column}
    missing = required_columns - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    n_periods = df[period_column].nunique()
    if n_periods < 2:
        raise ValueError(f"At least 2 periods required for migration analysis, found {n_periods}")

    logger.info(
        "Loaded segment assignments: %d rows, %d customers, %d periods",
        len(df),
        df[customer_id_column].nunique(),
        n_periods,
    )
    return df


def build_transition_matrix(
    assignments_period_a: pd.DataFrame,
    assignments_period_b: pd.DataFrame,
    customer_id_column: str = "customer_id",
    segment_column: str = "segment",
    normalize: bool = True,
) -> pd.DataFrame:
    """Build a segment transition matrix between two consecutive periods.

    Parameters
    ----------
    assignments_period_a : pd.DataFrame
        Segment assignments for the earlier period. Must contain
        customer_id and segment columns.
    assignments_period_b : pd.DataFrame
        Segment assignments for the later period. Must contain
        customer_id and segment columns.
    customer_id_column : str
        Name of the customer identifier column.
    segment_column : str
        Name of the segment label column.
    normalize : bool
        If True, express values as percentages (rows sum to 100).
        If False, express as raw counts.

    Returns
    -------
    pd.DataFrame
        Transition matrix where rows represent the segment in period A
        and columns represent the segment in period B. If normalized,
        each row sums to approximately 100%.

    Raises
    ------
    ValueError
        If normalized and any row sum deviates from 100% beyond tolerance.
    """
    # Merge on customers present in both periods
    merged = assignments_period_a[[customer_id_column, segment_column]].merge(
        assignments_period_b[[customer_id_column, segment_column]],
        on=customer_id_column,
        suffixes=("_from", "_to"),
    )

    # Build crosstab
    matrix = pd.crosstab(
        merged[f"{segment_column}_from"],
        merged[f"{segment_column}_to"],
    )

    if normalize:
        row_sums = matrix.sum(axis=1)
        matrix = matrix.div(row_sums, axis=0) * 100
        matrix = matrix.fillna(0.0)

        # Validate row sums
        actual_sums = matrix.sum(axis=1)
        deviations = (actual_sums - 100).abs()
        bad_rows = deviations[deviations > ROW_SUM_TOLERANCE * 100]
        if len(bad_rows) > 0:
            raise ValueError(f"Transition matrix row sums deviate from 100%: {bad_rows.to_dict()}")

    matrix.index.name = "from_segment"
    matrix.columns.name = "to_segment"

    logger.info("Built transition matrix: %d x %d segments", matrix.shape[0], matrix.shape[1])
    return matrix


def build_multi_period_transitions(
    segment_assignments: pd.DataFrame,
    customer_id_column: str = "customer_id",
    segment_column: str = "segment",
    period_column: str = "period",
    normalize: bool = True,
) -> dict[str, pd.DataFrame]:
    """Build transition matrices for all consecutive period pairs.

    Parameters
    ----------
    segment_assignments : pd.DataFrame
        Segment assignments spanning multiple periods.
    customer_id_column : str
        Name of the customer identifier column.
    segment_column : str
        Name of the segment label column.
    period_column : str
        Name of the period identifier column.
    normalize : bool
        If True, express values as percentages.

    Returns
    -------
    dict[str, pd.DataFrame]
        Mapping from period-pair label (e.g., '2026-01 -> 2026-02') to
        the corresponding transition matrix.
    """
    periods = sorted(segment_assignments[period_column].unique())
    transitions: dict[str, pd.DataFrame] = {}

    for i in range(len(periods) - 1):
        period_a = periods[i]
        period_b = periods[i + 1]
        label = f"{period_a} -> {period_b}"

        df_a = segment_assignments[segment_assignments[period_column] == period_a]
        df_b = segment_assignments[segment_assignments[period_column] == period_b]

        matrix = build_transition_matrix(
            df_a,
            df_b,
            customer_id_column=customer_id_column,
            segment_column=segment_column,
            normalize=normalize,
        )
        transitions[label] = matrix
        logger.info("Built transition matrix for %s", label)

    return transitions


def validate_transition_matrix(
    matrix: pd.DataFrame,
    tolerance: float = ROW_SUM_TOLERANCE,
) -> bool:
    """Validate that a normalized transition matrix rows sum to ~100%.

    Parameters
    ----------
    matrix : pd.DataFrame
        Normalized transition matrix.
    tolerance : float
        Acceptable absolute deviation from 100% per row.

    Returns
    -------
    bool
        True if all rows are within tolerance, False otherwise.

    Raises
    ------
    ValueError
        If any row sum exceeds the tolerance threshold, with details
        about which rows failed.
    """
    row_sums = matrix.sum(axis=1)
    deviations = (row_sums - 100).abs()
    # tolerance is expressed as a fraction (e.g. 0.01 = 1%)
    bad_rows = deviations[deviations > tolerance * 100]

    if len(bad_rows) > 0:
        details = {str(idx): round(float(val), 4) for idx, val in bad_rows.items()}
        raise ValueError(
            f"Transition matrix validation failed. Row sum deviations exceeding {tolerance * 100}%: {details}"
        )

    logger.info("Transition matrix validated: all rows sum to ~100%%")
    return True


def detect_notable_migrations(
    matrix: pd.DataFrame,
    notable_pairs: Optional[list[dict[str, str]]] = None,
    threshold_pct: float = 5.0,
) -> list[dict[str, Any]]:
    """Identify significant customer migrations between segments.

    Parameters
    ----------
    matrix : pd.DataFrame
        Normalized transition matrix (percentages).
    notable_pairs : list of dict, optional
        List of from/to segment pairs to monitor. Each dict has keys
        'from' and 'to'. Defaults to NOTABLE_MIGRATIONS.
    threshold_pct : float
        Minimum percentage to flag a migration as significant.

    Returns
    -------
    list of dict
        Each dict contains:
        - 'from_segment' (str): Origin segment
        - 'to_segment' (str): Destination segment
        - 'percentage' (float): Percentage of origin segment that migrated
        - 'severity' (str): 'high' if > 10%, 'medium' if > 5%, 'low' otherwise
    """
    if notable_pairs is None:
        notable_pairs = NOTABLE_MIGRATIONS

    results: list[dict[str, Any]] = []

    for pair in notable_pairs:
        from_seg = pair["from"]
        to_seg = pair["to"]

        # Skip if the segment is not in the matrix
        if from_seg not in matrix.index or to_seg not in matrix.columns:
            continue

        pct = float(matrix.loc[from_seg, to_seg])

        if pct >= threshold_pct:
            if pct > 10.0:
                severity = "high"
            elif pct > 5.0:
                severity = "medium"
            else:
                severity = "low"

            results.append(
                {
                    "from_segment": from_seg,
                    "to_segment": to_seg,
                    "percentage": round(pct, 2),
                    "severity": severity,
                }
            )

    logger.info("Detected %d notable migrations above %.1f%%", len(results), threshold_pct)
    return results


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


def save_migration_results(
    transitions: dict[str, pd.DataFrame],
    notable_migrations: dict[str, list[dict[str, Any]]],
    output_path: str | Path,
) -> None:
    """Serialize migration analysis results to JSON.

    Parameters
    ----------
    transitions : dict[str, pd.DataFrame]
        Mapping of period-pair labels to transition matrices.
    notable_migrations : dict[str, list[dict]]
        Mapping of period-pair labels to lists of notable migration events.
    output_path : str or Path
        Path to write the output JSON file.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    payload: dict[str, Any] = {"transitions": {}, "notable_migrations": {}}

    for label, matrix in transitions.items():
        payload["transitions"][label] = {
            str(row): {str(col): round(float(matrix.loc[row, col]), 2) for col in matrix.columns}
            for row in matrix.index
        }

    for label, migrations in notable_migrations.items():
        payload["notable_migrations"][label] = migrations

    with open(output_path, "w") as f:
        json.dump(payload, f, indent=2)

    logger.info("Saved migration results to %s", output_path)


# ---------------------------------------------------------------------------
# Pipeline orchestration
# ---------------------------------------------------------------------------


def run_migration_pipeline(
    segment_data_path: str | Path,
    output_dir: str | Path,
    normalize: bool = True,
    threshold_pct: float = 5.0,
) -> dict[str, Any]:
    """Execute the full segment migration tracking pipeline.

    Steps:
    1. Load segment assignments for multiple periods
    2. Build transition matrices for all consecutive period pairs
    3. Validate each matrix (rows sum to 100%)
    4. Detect notable migrations
    5. Save results

    Parameters
    ----------
    segment_data_path : str or Path
        Path to the multi-period segment assignments file.
    output_dir : str or Path
        Directory to write output files.
    normalize : bool
        Whether to normalize transition matrices to percentages.
    threshold_pct : float
        Minimum percentage to flag a migration as significant.

    Returns
    -------
    dict[str, Any]
        Pipeline results including transition matrices and notable migrations.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # 1. Load segment assignments
    assignments = load_segment_assignments(segment_data_path)

    # 2. Build transition matrices
    transitions = build_multi_period_transitions(
        assignments,
        normalize=normalize,
    )

    # 3. Validate matrices
    if normalize:
        for label, matrix in transitions.items():
            validate_transition_matrix(matrix)
            logger.info("Validated transition matrix: %s", label)

    # 4. Detect notable migrations
    all_notable: dict[str, list[dict[str, Any]]] = {}
    for label, matrix in transitions.items():
        notable = detect_notable_migrations(matrix, threshold_pct=threshold_pct)
        all_notable[label] = notable

    # 5. Save results
    save_migration_results(transitions, all_notable, output_dir / "migration_results.json")

    logger.info("Migration pipeline complete. Results saved to %s", output_dir)

    return {
        "transitions": transitions,
        "notable_migrations": all_notable,
    }
