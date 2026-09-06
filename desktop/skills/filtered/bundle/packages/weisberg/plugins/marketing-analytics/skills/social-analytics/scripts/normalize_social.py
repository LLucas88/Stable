"""Cross-platform social metric normalization and engagement rate calculation.

Reads platform-specific social performance CSVs, maps metrics to a unified
taxonomy, computes derived metrics (engagement rate, etc.), and writes a
normalized output file suitable for downstream analysis.

Usage:
    python normalize_social.py \
        --input-dir workspace/raw/ \
        --output workspace/processed/unified_social_performance.csv \
        --platforms meta,linkedin,tiktok,youtube,x
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Platform metric mapping
# ---------------------------------------------------------------------------

PLATFORM_METRIC_MAP: dict[str, dict[str, str]] = {
    "meta": {
        "impressions": "impressions",
        "reach": "reach",
        "engagements": "post_engagements",
        "likes": "reactions",
        "comments": "comments",
        "shares": "shares",
        "clicks": "link_clicks",
        "video_views": "video_views",
    },
    "linkedin": {
        "impressions": "impressions",
        "reach": "uniqueImpressionsCount",
        "engagements": "totalEngagements",
        "likes": "likeCount",
        "comments": "commentCount",
        "shares": "shareCount",
        "clicks": "clickCount",
        "video_views": "videoViews",
    },
    "tiktok": {
        "impressions": "video_views",
        "reach": "reach",
        "engagements": None,  # derived from likes + comments + shares
        "likes": "likes",
        "comments": "comments",
        "shares": "shares",
        "clicks": "clicks",
        "video_views": "video_views",
    },
    "youtube": {
        "impressions": "views",
        "reach": "uniqueViewers",
        "engagements": None,  # derived from likes + comments + shares
        "likes": "likes",
        "comments": "comments",
        "shares": "shares",
        "clicks": "card_clicks",
        "video_views": "views",
    },
    "x": {
        "impressions": "impression_count",
        "reach": None,  # not available via free API
        "engagements": None,  # derived
        "likes": "like_count",
        "comments": "reply_count",
        "shares": "retweet_count",
        "clicks": "url_link_clicks",
        "video_views": "view_count",
    },
}

SUPPORTED_PLATFORMS: list[str] = list(PLATFORM_METRIC_MAP.keys())


def load_platform_csv(file_path: Path) -> pd.DataFrame:
    """Load a platform-specific social performance CSV.

    Parameters
    ----------
    file_path : Path
        Path to the CSV file (e.g., ``social_performance_meta.csv``).

    Returns
    -------
    pd.DataFrame
        Raw platform data with original column names.

    Raises
    ------
    FileNotFoundError
        If the CSV file does not exist at the specified path.
    """
    file_path = Path(file_path)
    if not file_path.exists():
        raise FileNotFoundError(f"CSV file not found: {file_path}")

    # Try common encodings
    for encoding in ("utf-8", "utf-8-sig", "latin-1", "cp1252"):
        try:
            df = pd.read_csv(file_path, encoding=encoding)
            logger.info(
                "Loaded %d rows from %s (encoding=%s)",
                len(df),
                file_path,
                encoding,
            )
            return df
        except UnicodeDecodeError:
            continue

    # Final fallback with error replacement
    df = pd.read_csv(file_path, encoding="utf-8", errors="replace")
    logger.warning("Loaded %s with encoding errors replaced", file_path)
    return df


def map_columns(df: pd.DataFrame, platform: str) -> pd.DataFrame:
    """Rename platform-native columns to the unified metric taxonomy.

    Parameters
    ----------
    df : pd.DataFrame
        Raw platform dataframe with native column names.
    platform : str
        Platform identifier (meta, linkedin, tiktok, youtube, x).

    Returns
    -------
    pd.DataFrame
        Dataframe with columns renamed to unified metric names.

    Raises
    ------
    ValueError
        If the platform is not in the supported list.
    """
    platform = platform.lower().strip()
    if platform not in PLATFORM_METRIC_MAP:
        raise ValueError(f"Unsupported platform '{platform}'. Supported: {SUPPORTED_PLATFORMS}")

    mapping = PLATFORM_METRIC_MAP[platform]
    df = df.copy()

    # Build reverse mapping: native_name -> unified_name
    rename_map: dict[str, str] = {}
    for unified_name, native_name in mapping.items():
        if native_name is not None and native_name in df.columns:
            # Avoid overwriting if the unified name is already used as a
            # native name for a different metric
            if native_name != unified_name:
                rename_map[native_name] = unified_name

    df = df.rename(columns=rename_map)

    # Add platform column for downstream identification
    df["platform"] = platform

    logger.info("Mapped %d columns for platform '%s'", len(rename_map), platform)
    return df


def derive_engagements(df: pd.DataFrame) -> pd.DataFrame:
    """Compute aggregate engagements for platforms without a native field.

    Calculates ``engagements = likes + comments + shares`` when the platform
    does not provide a native aggregate engagement metric.

    Parameters
    ----------
    df : pd.DataFrame
        Dataframe with unified column names.

    Returns
    -------
    pd.DataFrame
        Dataframe with the ``engagements`` column populated.
    """
    df = df.copy()

    # If engagements column is missing or has all NaN values, derive it
    needs_derivation = "engagements" not in df.columns or df["engagements"].isna().all()

    if needs_derivation:
        likes = df.get("likes", pd.Series(0, index=df.index)).fillna(0)
        comments = df.get("comments", pd.Series(0, index=df.index)).fillna(0)
        shares = df.get("shares", pd.Series(0, index=df.index)).fillna(0)
        df["engagements"] = likes + comments + shares
        logger.info("Derived engagements from likes + comments + shares")
    else:
        # Fill NaN rows even when column exists (partial data)
        mask = df["engagements"].isna()
        if mask.any():
            likes = df.get("likes", pd.Series(0, index=df.index)).fillna(0)
            comments = df.get("comments", pd.Series(0, index=df.index)).fillna(0)
            shares = df.get("shares", pd.Series(0, index=df.index)).fillna(0)
            df.loc[mask, "engagements"] = likes[mask] + comments[mask] + shares[mask]
            logger.info("Filled %d missing engagement rows from components", mask.sum())

    return df


def compute_engagement_rate(
    df: pd.DataFrame,
    denominator: str = "reach",
) -> pd.DataFrame:
    """Calculate engagement rate using the specified denominator.

    Parameters
    ----------
    df : pd.DataFrame
        Dataframe with unified metric columns.
    denominator : str
        Column to use as the denominator. Defaults to ``"reach"``.
        Falls back to ``"impressions"`` if reach is null, with a
        ``rate_basis`` label column added for transparency.

    Returns
    -------
    pd.DataFrame
        Dataframe with ``engagement_rate`` and ``rate_basis`` columns added.
    """
    df = df.copy()

    engagements = df.get("engagements", pd.Series(0, index=df.index)).fillna(0)

    # Determine denominator per row with fallback
    if denominator in df.columns:
        denom_values = df[denominator].copy()
    else:
        denom_values = pd.Series(np.nan, index=df.index)

    # Track which basis is used per row
    rate_basis = pd.Series(denominator, index=df.index)

    # Fallback to impressions where primary denominator is missing/zero
    fallback_mask = denom_values.isna() | (denom_values == 0)
    if "impressions" in df.columns and fallback_mask.any():
        impressions = df["impressions"]
        denom_values[fallback_mask] = impressions[fallback_mask]
        rate_basis[fallback_mask] = "impressions"
        logger.info("Fell back to impressions for %d rows", fallback_mask.sum())

    # Compute rate, avoiding division by zero
    safe_denom = denom_values.replace(0, np.nan)
    df["engagement_rate"] = engagements / safe_denom
    df["rate_basis"] = rate_basis

    return df


def split_organic_paid(df: pd.DataFrame) -> pd.DataFrame:
    """Separate organic and paid metrics into distinct columns.

    Uses the ``is_paid`` flag to create ``organic_reach``, ``paid_reach``,
    ``organic_engagements``, and ``paid_engagements`` columns alongside
    the blended totals.

    Parameters
    ----------
    df : pd.DataFrame
        Unified dataframe with an ``is_paid`` boolean column.

    Returns
    -------
    pd.DataFrame
        Dataframe with organic/paid split columns added.
    """
    df = df.copy()

    # If is_paid column doesn't exist, assume all organic
    if "is_paid" not in df.columns:
        df["is_paid"] = False
        logger.warning("No 'is_paid' column found; assuming all organic")

    is_paid = df["is_paid"].fillna(False).astype(bool)

    # Split reach
    reach = df.get("reach", pd.Series(0, index=df.index)).fillna(0)
    df["organic_reach"] = np.where(~is_paid, reach, 0)
    df["paid_reach"] = np.where(is_paid, reach, 0)

    # Split engagements
    engagements = df.get("engagements", pd.Series(0, index=df.index)).fillna(0)
    df["organic_engagements"] = np.where(~is_paid, engagements, 0)
    df["paid_engagements"] = np.where(is_paid, engagements, 0)

    # Split impressions
    impressions = df.get("impressions", pd.Series(0, index=df.index)).fillna(0)
    df["organic_impressions"] = np.where(~is_paid, impressions, 0)
    df["paid_impressions"] = np.where(is_paid, impressions, 0)

    logger.info(
        "Split organic/paid: %d organic, %d paid rows",
        (~is_paid).sum(),
        is_paid.sum(),
    )
    return df


def normalize_all_platforms(
    input_dir: Path,
    platforms: list[str] | None = None,
) -> pd.DataFrame:
    """Load and normalize data from all specified platforms.

    Orchestrates the full normalization pipeline: load CSVs, map columns,
    derive missing metrics, compute engagement rates, and concatenate into
    a single unified dataframe.

    Parameters
    ----------
    input_dir : Path
        Directory containing platform CSV files named
        ``social_performance_{platform}.csv``.
    platforms : list[str] | None
        Platforms to process. Defaults to all supported platforms.

    Returns
    -------
    pd.DataFrame
        Unified cross-platform social performance dataframe.
    """
    if platforms is None:
        platforms = SUPPORTED_PLATFORMS

    input_dir = Path(input_dir)
    frames: list[pd.DataFrame] = []

    for platform in platforms:
        platform = platform.lower().strip()
        file_path = input_dir / f"social_performance_{platform}.csv"

        if not file_path.exists():
            logger.warning("No data file for platform '%s' at %s", platform, file_path)
            continue

        # Load
        df = load_platform_csv(file_path)

        # Map columns to unified taxonomy
        df = map_columns(df, platform)

        # Derive engagements where needed
        df = derive_engagements(df)

        # Compute engagement rate with reach fallback to impressions
        df = compute_engagement_rate(df, denominator="reach")

        # Split organic vs paid
        df = split_organic_paid(df)

        frames.append(df)
        logger.info("Processed %d rows for platform '%s'", len(df), platform)

    if not frames:
        logger.warning("No platform data files found in %s", input_dir)
        return pd.DataFrame()

    unified = pd.concat(frames, ignore_index=True)

    # Ensure date column is datetime
    if "date" in unified.columns:
        unified["date"] = pd.to_datetime(unified["date"], errors="coerce")

    # Sort by date and platform
    sort_cols = [c for c in ("date", "platform") if c in unified.columns]
    if sort_cols:
        unified = unified.sort_values(sort_cols).reset_index(drop=True)

    logger.info(
        "Unified dataset: %d rows across %d platforms",
        len(unified),
        len(frames),
    )
    return unified


def save_output(df: pd.DataFrame, output_path: Path) -> None:
    """Write the normalized dataframe to CSV.

    Parameters
    ----------
    df : pd.DataFrame
        Unified social performance dataframe.
    output_path : Path
        Destination file path for the output CSV.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Round float columns to reasonable precision
    float_cols = df.select_dtypes(include=["float64", "float32"]).columns
    df = df.copy()
    df[float_cols] = df[float_cols].round(6)

    df.to_csv(output_path, index=False)
    logger.info("Saved %d rows to %s", len(df), output_path)


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments.

    Returns
    -------
    argparse.Namespace
        Parsed arguments with ``input_dir``, ``output``, and ``platforms``.
    """
    parser = argparse.ArgumentParser(
        description="Normalize social media metrics across platforms.",
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=Path("workspace/raw"),
        help="Directory containing platform CSV files.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("workspace/processed/unified_social_performance.csv"),
        help="Output path for the normalized CSV.",
    )
    parser.add_argument(
        "--platforms",
        type=str,
        default=",".join(SUPPORTED_PLATFORMS),
        help="Comma-separated list of platforms to process.",
    )
    return parser.parse_args()


def main() -> None:
    """Entry point for cross-platform social metric normalization."""
    args = parse_args()
    platforms = [p.strip() for p in args.platforms.split(",")]
    df = normalize_all_platforms(args.input_dir, platforms)
    save_output(df, args.output)
    logger.info("Normalized %d rows written to %s", len(df), args.output)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
