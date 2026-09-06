"""Common transformation utilities shared across marketing-analytics skills.

Provides CSV/JSON I/O with validation, date normalization, time-series gap
detection, period-over-period calculations, and consistent formatting helpers.
All monetary values use ``decimal.Decimal`` to avoid floating-point artefacts.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Union

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------


def load_csv_with_validation(
    path: Union[str, Path],
    required_columns: Sequence[str],
    date_columns: Optional[Sequence[str]] = None,
    numeric_columns: Optional[Sequence[str]] = None,
) -> pd.DataFrame:
    """Load a CSV file, validate schema expectations, and coerce types.

    Parameters
    ----------
    path:
        Filesystem path to the CSV file.
    required_columns:
        Column names that *must* be present.  A ``ValueError`` is raised if
        any are missing.
    date_columns:
        Columns to parse as ``datetime64``.  Unparseable values become
        ``NaT``.
    numeric_columns:
        Columns to coerce to ``float64``.  Unparseable values become ``NaN``.

    Returns
    -------
    pd.DataFrame
        The loaded and type-coerced dataframe.

    Raises
    ------
    FileNotFoundError
        If *path* does not exist.
    ValueError
        If any *required_columns* are absent from the CSV header.
    """
    filepath = Path(path)
    if not filepath.exists():
        raise FileNotFoundError(f"CSV file not found: {filepath}")

    df = pd.read_csv(filepath)

    # Validate required columns ------------------------------------------------
    missing = set(required_columns) - set(df.columns)
    if missing:
        raise ValueError(
            f"CSV is missing required columns: {sorted(missing)}.  Available columns: {sorted(df.columns.tolist())}"
        )

    # Parse date columns -------------------------------------------------------
    for col in date_columns or []:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    # Coerce numeric columns ---------------------------------------------------
    for col in numeric_columns or []:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    logger.info("Loaded %s: %d rows, %d columns", filepath.name, len(df), len(df.columns))
    return df


def save_json_output(
    data: Any,
    path: Union[str, Path],
) -> Path:
    """Serialize *data* to a JSON file with sensible default encoding.

    Handles ``datetime``, ``date``, ``Decimal``, and numpy scalar/array types
    that the standard library ``json`` module cannot encode.

    Parameters
    ----------
    data:
        Any JSON-serializable structure (after custom encoding).
    path:
        Destination file path.  Parent directories are created automatically.

    Returns
    -------
    Path
        The resolved path that was written.
    """
    filepath = Path(path)
    ensure_directory(filepath)

    with open(filepath, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, default=_json_default, ensure_ascii=False)

    logger.info("Saved JSON output to %s", filepath)
    return filepath


def load_json(path: Union[str, Path]) -> Any:
    """Load and parse a JSON file with descriptive error handling.

    Parameters
    ----------
    path:
        Filesystem path to the JSON file.

    Returns
    -------
    Any
        The parsed JSON content.

    Raises
    ------
    FileNotFoundError
        If *path* does not exist.
    json.JSONDecodeError
        If the file contains invalid JSON.
    """
    filepath = Path(path)
    if not filepath.exists():
        raise FileNotFoundError(f"JSON file not found: {filepath}")

    with open(filepath, "r", encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------------------
# Date / time-series utilities
# ---------------------------------------------------------------------------


def normalize_dates(
    df: pd.DataFrame,
    date_col: str,
    freq: Optional[str] = None,
) -> pd.DataFrame:
    """Standardize a date column and optionally resample the dataframe.

    The column is converted to ``datetime64[ns]``, rows with unparseable dates
    are dropped, and the dataframe is sorted by the date column.

    Parameters
    ----------
    df:
        Input dataframe.
    date_col:
        Name of the column containing dates.
    freq:
        If provided, resample the dataframe to this frequency using the
        pandas offset alias (``"D"``, ``"W"``, ``"MS"`` for month-start,
        etc.).  Numeric columns are summed; non-numeric columns are dropped
        during resampling.

    Returns
    -------
    pd.DataFrame
        A copy of the dataframe with normalized (and optionally resampled)
        dates.

    Raises
    ------
    KeyError
        If *date_col* is not present in the dataframe.
    """
    if date_col not in df.columns:
        raise KeyError(f"Date column '{date_col}' not found in dataframe")

    result = df.copy()
    result[date_col] = pd.to_datetime(result[date_col], errors="coerce")
    before = len(result)
    result = result.dropna(subset=[date_col])
    dropped = before - len(result)
    if dropped:
        logger.warning("Dropped %d rows with unparseable dates in '%s'", dropped, date_col)

    result = result.sort_values(date_col).reset_index(drop=True)

    if freq is not None:
        # Map convenient shorthand to pandas offset aliases
        freq_map: Dict[str, str] = {"D": "D", "W": "W", "M": "MS"}
        pd_freq = freq_map.get(freq, freq)
        result = result.set_index(date_col).resample(pd_freq).sum(numeric_only=True).reset_index()

    return result


def detect_missing_windows(
    df: pd.DataFrame,
    date_col: str,
    freq: str = "D",
) -> List[Dict[str, str]]:
    """Identify gaps in a time-series dataframe.

    Parameters
    ----------
    df:
        Dataframe with a date column.
    date_col:
        Name of the date column.
    freq:
        Expected frequency (``"D"``, ``"W"``, ``"M"``).

    Returns
    -------
    list[dict]
        Each dict has ``"start"`` and ``"end"`` keys (ISO-8601 strings)
        representing a contiguous missing window.
    """
    if date_col not in df.columns:
        raise KeyError(f"Date column '{date_col}' not found in dataframe")

    dates = pd.to_datetime(df[date_col], errors="coerce").dropna().sort_values()
    if dates.empty:
        return []

    freq_map: Dict[str, str] = {"D": "D", "W": "W", "M": "MS"}
    pd_freq = freq_map.get(freq, freq)

    full_range = pd.date_range(start=dates.min(), end=dates.max(), freq=pd_freq)
    present = set(dates.dt.normalize())
    missing_dates = sorted(d for d in full_range if d not in present)

    if not missing_dates:
        return []

    # Collapse consecutive missing dates into windows
    windows: List[Dict[str, str]] = []
    window_start = missing_dates[0]
    prev = missing_dates[0]

    for d in missing_dates[1:]:
        expected_gap = pd.tseries.frequencies.to_offset(pd_freq)
        if d - prev > expected_gap * 1.5:  # allow small tolerance
            windows.append({"start": window_start.isoformat()[:10], "end": prev.isoformat()[:10]})
            window_start = d
        prev = d

    windows.append({"start": window_start.isoformat()[:10], "end": prev.isoformat()[:10]})
    return windows


# ---------------------------------------------------------------------------
# Period-over-period analytics
# ---------------------------------------------------------------------------


def compute_period_over_period(
    df: pd.DataFrame,
    metric_col: str,
    date_col: str,
    period: str = "WoW",
) -> pd.DataFrame:
    """Compute percentage change over a rolling period.

    Parameters
    ----------
    df:
        Input dataframe (will be sorted by *date_col*).
    metric_col:
        Numeric column to compute changes for.
    date_col:
        Date column used for ordering and period alignment.
    period:
        One of ``"WoW"`` (week-over-week), ``"MoM"`` (month-over-month),
        or ``"YoY"`` (year-over-year).

    Returns
    -------
    pd.DataFrame
        A copy of the input with an additional ``{metric_col}_{period}_pct``
        column containing the percentage change (e.g. 0.05 for a 5 % increase).

    Raises
    ------
    ValueError
        If *period* is not one of the recognised values.
    KeyError
        If *metric_col* or *date_col* is missing from the dataframe.
    """
    period_days = {"WoW": 7, "MoM": 30, "YoY": 365}
    if period not in period_days:
        raise ValueError(f"Unknown period '{period}'. Must be one of {sorted(period_days.keys())}")

    for col in (metric_col, date_col):
        if col not in df.columns:
            raise KeyError(f"Column '{col}' not found in dataframe")

    result = df.copy()
    result[date_col] = pd.to_datetime(result[date_col], errors="coerce")
    result = result.sort_values(date_col).reset_index(drop=True)

    shift_periods = period_days[period]
    change_col = f"{metric_col}_{period}_pct"

    # For daily data, shift by the number of days; otherwise use a simple
    # row-shift heuristic based on the median date gap.
    date_diffs = result[date_col].diff().dt.days.dropna()
    if date_diffs.empty:
        result[change_col] = np.nan
        return result

    median_gap = int(date_diffs.median())
    if median_gap < 1:
        median_gap = 1
    row_shift = max(1, shift_periods // median_gap)

    result[change_col] = result[metric_col].pct_change(periods=row_shift)
    return result


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------


def decimal_currency(value: Any) -> Decimal:
    """Convert *value* to a ``Decimal`` rounded to 2 decimal places.

    Parameters
    ----------
    value:
        A number, string, or ``Decimal``.

    Returns
    -------
    Decimal
        The value quantized to two decimal places using half-up rounding.

    Raises
    ------
    InvalidOperation
        If *value* cannot be converted to a ``Decimal``.
    """
    try:
        d = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise InvalidOperation(f"Cannot convert {value!r} to Decimal") from exc
    return d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def format_percentage(value: Any, decimals: int = 1) -> str:
    """Format a numeric value as a percentage string.

    Parameters
    ----------
    value:
        A proportion (e.g. ``0.123`` for 12.3 %) or raw percentage.
        Values <= 1.0 in absolute terms are treated as proportions and
        multiplied by 100.
    decimals:
        Number of decimal places in the output.

    Returns
    -------
    str
        Formatted string such as ``"12.3%"``.
    """
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "N/A"
    num = float(value)
    if abs(num) <= 1.0:
        num *= 100
    return f"{num:.{decimals}f}%"


def format_currency(value: Any, symbol: str = "$", decimals: int = 2) -> str:
    """Format a numeric value as a currency string with thousands separators.

    Parameters
    ----------
    value:
        Numeric value to format.
    symbol:
        Currency symbol prefix.
    decimals:
        Number of decimal places.

    Returns
    -------
    str
        Formatted string such as ``"$1,234.56"``.
    """
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "N/A"
    num = float(value)
    formatted = f"{num:,.{decimals}f}"
    return f"{symbol}{formatted}"


# ---------------------------------------------------------------------------
# Filesystem helpers
# ---------------------------------------------------------------------------


def ensure_directory(path: Union[str, Path]) -> Path:
    """Create parent directories for *path* if they do not exist.

    Parameters
    ----------
    path:
        A file path whose parent directory tree should be ensured.

    Returns
    -------
    Path
        The resolved parent directory.
    """
    filepath = Path(path)
    filepath.parent.mkdir(parents=True, exist_ok=True)
    return filepath.parent


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _json_default(obj: Any) -> Any:
    """Fallback serializer for ``json.dump``."""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, pd.Timestamp):
        return obj.isoformat()
    if pd.isna(obj):
        return None
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")
