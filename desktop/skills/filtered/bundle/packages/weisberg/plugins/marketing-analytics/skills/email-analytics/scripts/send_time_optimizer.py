"""Send-time optimizer: historical engagement heatmap generation by segment and day/hour.

This script provides deterministic computation for send-time intelligence,
building engagement heatmaps from historical click data segmented by audience,
day-of-week, and hour-of-day. Accounts for time zones in multi-region campaigns.

Inputs:
    - workspace/raw/email_sends.csv: Send-level data with click timestamps.
    - workspace/processed/segments.json: Optional segment definitions.

Outputs:
    - workspace/analysis/send_time_heatmap.json: Optimal send-time
      recommendations by segment.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import pandas as pd


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class HeatmapCell:
    """Engagement data for a single day-of-week / hour-of-day combination."""

    day_of_week: int  # 0=Monday, 6=Sunday
    hour_of_day: int  # 0-23
    total_delivered: int = 0
    total_clicks: int = 0
    ctdr: float = 0.0
    sample_size_sufficient: bool = True  # False if too few sends for reliability


@dataclass
class SegmentHeatmap:
    """Engagement heatmap for a single audience segment."""

    segment_id: str
    segment_name: str
    timezone: str | None = None  # recipient timezone if applicable
    cells: list[HeatmapCell] = field(default_factory=list)
    top_windows: list[dict[str, Any]] = field(default_factory=list)
    minimum_sample_size: int = 100


@dataclass
class SendTimeRecommendation:
    """Optimal send-time recommendation for a segment."""

    segment_id: str
    segment_name: str
    recommended_day: int  # 0=Monday, 6=Sunday
    recommended_hour: int  # 0-23
    expected_ctdr: float
    confidence_level: str  # "high", "medium", "low"
    timezone: str = "UTC"
    alternative_windows: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class SendTimeReport:
    """Complete send-time optimization report."""

    heatmaps: list[SegmentHeatmap] = field(default_factory=list)
    recommendations: list[SendTimeRecommendation] = field(default_factory=list)
    overall_best_window: dict[str, Any] | None = None
    generated_at: str = ""


# ---------------------------------------------------------------------------
# Heatmap generation
# ---------------------------------------------------------------------------


def build_engagement_heatmap(
    sends_csv_path: Path,
    timezone_column: str | None = None,
    normalize_to_timezone: str = "UTC",
    minimum_sample_size: int = 100,
) -> SegmentHeatmap:
    """Build an engagement heatmap from historical click data.

    Aggregates click-to-delivered rate by day-of-week and hour-of-day across
    all sends. Optionally normalizes send times to a target timezone.

    Args:
        sends_csv_path: Path to ``email_sends.csv`` with columns
            ``send_time``, ``delivered``, ``clicked``. The ``send_time``
            column should be in ISO 8601 format.
        timezone_column: Column name containing recipient timezone. If ``None``,
            all times are treated as the ``normalize_to_timezone``.
        normalize_to_timezone: Target timezone for heatmap display. All send
            times are converted to this timezone before binning.
        minimum_sample_size: Minimum number of delivered emails in a cell for
            the CTDR to be considered reliable.

    Returns:
        ``SegmentHeatmap`` with 168 cells (7 days x 24 hours) and top
        performing windows identified.
    """
    df = pd.read_csv(sends_csv_path, parse_dates=["send_time"])

    for col in ("clicked", "delivered"):
        if col not in df.columns:
            df[col] = 1 if col == "delivered" else 0

    target_tz = ZoneInfo(normalize_to_timezone)

    # Normalize send times to target timezone
    if timezone_column and timezone_column in df.columns:
        # Per-row timezone conversion
        normalized_times = []
        for _, row in df.iterrows():
            st = row["send_time"]
            src_tz_str = row[timezone_column]
            try:
                src_tz = ZoneInfo(str(src_tz_str))
                if st.tzinfo is None:
                    st = st.replace(tzinfo=src_tz)
                converted = st.astimezone(target_tz)
            except Exception:
                # Fallback: treat as target tz
                if st.tzinfo is None:
                    converted = st.replace(tzinfo=target_tz)
                else:
                    converted = st.astimezone(target_tz)
            normalized_times.append(converted)
        df["normalized_time"] = normalized_times
    else:
        # All times treated as target timezone
        df["normalized_time"] = df["send_time"].apply(
            lambda x: x.replace(tzinfo=target_tz) if x.tzinfo is None else x.astimezone(target_tz)
        )

    df["dow"] = df["normalized_time"].apply(lambda x: x.weekday())  # 0=Mon
    df["hour"] = df["normalized_time"].apply(lambda x: x.hour)

    # Aggregate by day-of-week and hour
    grouped = (
        df.groupby(["dow", "hour"])
        .agg(
            total_delivered=("delivered", "sum"),
            total_clicks=("clicked", "sum"),
        )
        .reset_index()
    )

    # Build all 168 cells
    cells: list[HeatmapCell] = []
    for dow in range(7):
        for hour in range(24):
            match = grouped[(grouped["dow"] == dow) & (grouped["hour"] == hour)]
            if not match.empty:
                row = match.iloc[0]
                delivered = int(row["total_delivered"])
                clicks = int(row["total_clicks"])
                ctdr = (clicks / delivered * 100) if delivered > 0 else 0.0
                sufficient = delivered >= minimum_sample_size
            else:
                delivered = 0
                clicks = 0
                ctdr = 0.0
                sufficient = False

            cells.append(
                HeatmapCell(
                    day_of_week=dow,
                    hour_of_day=hour,
                    total_delivered=delivered,
                    total_clicks=clicks,
                    ctdr=round(ctdr, 4),
                    sample_size_sufficient=sufficient,
                )
            )

    heatmap = SegmentHeatmap(
        segment_id="all",
        segment_name="All Subscribers",
        timezone=normalize_to_timezone,
        cells=cells,
        minimum_sample_size=minimum_sample_size,
    )

    heatmap.top_windows = identify_top_windows(heatmap)

    return heatmap


def build_segment_heatmaps(
    sends_csv_path: Path,
    segments_json_path: Path,
    timezone_column: str | None = None,
    normalize_to_timezone: str = "UTC",
    minimum_sample_size: int = 100,
) -> list[SegmentHeatmap]:
    """Build per-segment engagement heatmaps.

    Joins send data with segment definitions and builds a separate heatmap
    for each audience segment.

    Args:
        sends_csv_path: Path to ``email_sends.csv``.
        segments_json_path: Path to ``segments.json`` from audience-segmentation.
        timezone_column: Column with recipient timezone info.
        normalize_to_timezone: Target timezone for display.
        minimum_sample_size: Minimum sends per cell for reliability.

    Returns:
        List of ``SegmentHeatmap`` objects, one per segment.
    """
    df = pd.read_csv(sends_csv_path, parse_dates=["send_time"])

    for col in ("clicked", "delivered"):
        if col not in df.columns:
            df[col] = 1 if col == "delivered" else 0

    with open(segments_json_path) as f:
        segments_data = json.load(f)

    if isinstance(segments_data, dict):
        segments_list = segments_data.get("segments", segments_data.get("data", []))
    else:
        segments_list = segments_data

    seg_df = pd.DataFrame(segments_list)
    send_key = "recipient" if "recipient" in df.columns else "customer_id"
    seg_key = "customer_id" if "customer_id" in seg_df.columns else "subscriber_id"

    merged = df.merge(seg_df, left_on=send_key, right_on=seg_key, how="inner")

    if "segment_id" not in merged.columns:
        merged["segment_id"] = merged["segment_name"]

    target_tz = ZoneInfo(normalize_to_timezone)

    # Normalize times
    if timezone_column and timezone_column in merged.columns:
        normalized = []
        for _, row in merged.iterrows():
            st = row["send_time"]
            try:
                src_tz = ZoneInfo(str(row[timezone_column]))
                if st.tzinfo is None:
                    st = st.replace(tzinfo=src_tz)
                normalized.append(st.astimezone(target_tz))
            except Exception:
                if st.tzinfo is None:
                    normalized.append(st.replace(tzinfo=target_tz))
                else:
                    normalized.append(st.astimezone(target_tz))
        merged["normalized_time"] = normalized
    else:
        merged["normalized_time"] = merged["send_time"].apply(
            lambda x: x.replace(tzinfo=target_tz) if x.tzinfo is None else x.astimezone(target_tz)
        )

    merged["dow"] = merged["normalized_time"].apply(lambda x: x.weekday())
    merged["hour"] = merged["normalized_time"].apply(lambda x: x.hour)

    heatmaps: list[SegmentHeatmap] = []

    for (seg_id, seg_name), seg_group in merged.groupby(["segment_id", "segment_name"]):
        grouped = (
            seg_group.groupby(["dow", "hour"])
            .agg(
                total_delivered=("delivered", "sum"),
                total_clicks=("clicked", "sum"),
            )
            .reset_index()
        )

        cells: list[HeatmapCell] = []
        for dow in range(7):
            for hour in range(24):
                match = grouped[(grouped["dow"] == dow) & (grouped["hour"] == hour)]
                if not match.empty:
                    row = match.iloc[0]
                    delivered = int(row["total_delivered"])
                    clicks = int(row["total_clicks"])
                    ctdr = (clicks / delivered * 100) if delivered > 0 else 0.0
                    sufficient = delivered >= minimum_sample_size
                else:
                    delivered = 0
                    clicks = 0
                    ctdr = 0.0
                    sufficient = False

                cells.append(
                    HeatmapCell(
                        day_of_week=dow,
                        hour_of_day=hour,
                        total_delivered=delivered,
                        total_clicks=clicks,
                        ctdr=round(ctdr, 4),
                        sample_size_sufficient=sufficient,
                    )
                )

        heatmap = SegmentHeatmap(
            segment_id=str(seg_id),
            segment_name=str(seg_name),
            timezone=normalize_to_timezone,
            cells=cells,
            minimum_sample_size=minimum_sample_size,
        )
        heatmap.top_windows = identify_top_windows(heatmap)
        heatmaps.append(heatmap)

    return heatmaps


# ---------------------------------------------------------------------------
# Top window identification
# ---------------------------------------------------------------------------


def identify_top_windows(
    heatmap: SegmentHeatmap,
    top_n: int = 3,
    min_ctdr_lift: float = 0.1,
) -> list[dict[str, Any]]:
    """Identify the top-performing send-time windows from a heatmap.

    Ranks cells by CTDR (filtering for sufficient sample size) and returns
    the top N windows along with expected lift over the overall average.

    Args:
        heatmap: A ``SegmentHeatmap`` with populated cells.
        top_n: Number of top windows to return.
        min_ctdr_lift: Minimum CTDR lift (as a fraction) above the overall
            average for a window to be recommended.

    Returns:
        List of dicts with keys ``day_of_week``, ``hour_of_day``, ``ctdr``,
        ``lift_vs_average``, and ``sample_size``.
    """
    if not heatmap.cells:
        return []

    # Filter for cells with sufficient sample size
    reliable_cells = [c for c in heatmap.cells if c.sample_size_sufficient and c.total_delivered > 0]

    if not reliable_cells:
        return []

    # Compute overall average CTDR across reliable cells
    total_delivered = sum(c.total_delivered for c in reliable_cells)
    total_clicks = sum(c.total_clicks for c in reliable_cells)
    avg_ctdr = (total_clicks / total_delivered * 100) if total_delivered > 0 else 0.0

    # Rank by CTDR descending
    ranked = sorted(reliable_cells, key=lambda c: c.ctdr, reverse=True)

    results: list[dict[str, Any]] = []
    for cell in ranked[:top_n]:
        lift = (cell.ctdr - avg_ctdr) / avg_ctdr if avg_ctdr > 0 else 0.0

        # Only include if lift meets minimum threshold
        if lift >= min_ctdr_lift or len(results) == 0:
            results.append(
                {
                    "day_of_week": cell.day_of_week,
                    "hour_of_day": cell.hour_of_day,
                    "ctdr": round(cell.ctdr, 4),
                    "lift_vs_average": round(lift, 4),
                    "sample_size": cell.total_delivered,
                }
            )

    return results


# ---------------------------------------------------------------------------
# Multi-region timezone handling
# ---------------------------------------------------------------------------


def normalize_send_times(
    send_times: list[str],
    source_timezones: list[str],
    target_timezone: str = "UTC",
) -> list[datetime]:
    """Convert send times from heterogeneous source timezones to a single target.

    For multi-region campaigns, recipients may be in different time zones.
    This function normalizes all send times to a common timezone for
    comparable heatmap analysis.

    Args:
        send_times: List of ISO 8601 datetime strings.
        source_timezones: List of IANA timezone strings, one per send time
            (e.g., ``"America/New_York"``, ``"Europe/London"``).
        target_timezone: IANA timezone string to normalize to.

    Returns:
        List of ``datetime`` objects in the target timezone.
    """
    target_tz = ZoneInfo(target_timezone)
    results: list[datetime] = []

    for time_str, tz_str in zip(send_times, source_timezones):
        dt = datetime.fromisoformat(time_str)
        source_tz = ZoneInfo(tz_str)

        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=source_tz)

        results.append(dt.astimezone(target_tz))

    return results


def generate_per_timezone_recommendations(
    heatmaps: list[SegmentHeatmap],
    recipient_timezones: list[str],
) -> list[SendTimeRecommendation]:
    """Generate send-time recommendations adjusted for recipient time zones.

    Translates the optimal send windows from the analysis timezone back to
    each recipient timezone for actionable scheduling.

    Args:
        heatmaps: List of segment heatmaps with top windows identified.
        recipient_timezones: List of IANA timezone strings representing the
            distinct timezones in the subscriber base.

    Returns:
        List of ``SendTimeRecommendation`` objects, one per segment per
        timezone.
    """
    recommendations: list[SendTimeRecommendation] = []

    for heatmap in heatmaps:
        if not heatmap.top_windows:
            continue

        best_window = heatmap.top_windows[0]
        analysis_tz = ZoneInfo(heatmap.timezone or "UTC")

        for tz_str in recipient_timezones:
            recipient_tz = ZoneInfo(tz_str)

            # Create a reference datetime in the analysis timezone for the best window
            # Use a known Monday (2024-01-01 is a Monday) to map day_of_week correctly
            ref_date = datetime(2024, 1, 1, tzinfo=analysis_tz)  # Monday
            best_dt = ref_date + timedelta(
                days=best_window["day_of_week"],
                hours=best_window["hour_of_day"],
            )

            # Convert to recipient timezone
            converted = best_dt.astimezone(recipient_tz)
            rec_day = converted.weekday()
            rec_hour = converted.hour

            # Build alternative windows from remaining top windows
            alternatives: list[dict[str, Any]] = []
            for window in heatmap.top_windows[1:]:
                alt_dt = ref_date + timedelta(
                    days=window["day_of_week"],
                    hours=window["hour_of_day"],
                )
                alt_converted = alt_dt.astimezone(recipient_tz)
                alternatives.append(
                    {
                        "day_of_week": alt_converted.weekday(),
                        "hour_of_day": alt_converted.hour,
                        "ctdr": window["ctdr"],
                        "lift_vs_average": window.get("lift_vs_average", 0.0),
                    }
                )

            # Determine confidence level based on sample size
            sample_size = best_window.get("sample_size", 0)
            if sample_size >= 1000:
                confidence = "high"
            elif sample_size >= 300:
                confidence = "medium"
            else:
                confidence = "low"

            recommendations.append(
                SendTimeRecommendation(
                    segment_id=heatmap.segment_id,
                    segment_name=heatmap.segment_name,
                    recommended_day=rec_day,
                    recommended_hour=rec_hour,
                    expected_ctdr=best_window["ctdr"],
                    confidence_level=confidence,
                    timezone=tz_str,
                    alternative_windows=alternatives,
                )
            )

    return recommendations


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------


def generate_send_time_report(
    sends_csv_path: Path,
    segments_json_path: Path | None = None,
    timezone_column: str | None = None,
    top_n_windows: int = 3,
    output_path: Path | None = None,
) -> SendTimeReport:
    """Generate a complete send-time optimization report.

    Builds engagement heatmaps (overall and per-segment), identifies top
    send-time windows, and produces actionable recommendations.

    Args:
        sends_csv_path: Path to ``email_sends.csv``.
        segments_json_path: Path to ``segments.json`` for segment-level
            heatmaps. If ``None``, produces an overall heatmap only.
        timezone_column: Column with recipient timezone for multi-region
            normalization.
        top_n_windows: Number of top send-time windows to recommend.
        output_path: If provided, write the report JSON to this path.
            Defaults to ``workspace/analysis/send_time_heatmap.json``.

    Returns:
        ``SendTimeReport`` with heatmaps and recommendations.
    """
    heatmaps: list[SegmentHeatmap] = []

    # 1. Build overall heatmap
    overall_heatmap = build_engagement_heatmap(
        sends_csv_path,
        timezone_column=timezone_column,
        minimum_sample_size=100,
    )
    overall_heatmap.top_windows = identify_top_windows(overall_heatmap, top_n=top_n_windows)
    heatmaps.append(overall_heatmap)

    # 2. Build per-segment heatmaps if segments provided
    if segments_json_path is not None and segments_json_path.exists():
        segment_heatmaps = build_segment_heatmaps(
            sends_csv_path,
            segments_json_path,
            timezone_column=timezone_column,
            minimum_sample_size=100,
        )
        for sh in segment_heatmaps:
            sh.top_windows = identify_top_windows(sh, top_n=top_n_windows)
        heatmaps.extend(segment_heatmaps)

    # 3. Build recommendations
    recommendations: list[SendTimeRecommendation] = []
    for hm in heatmaps:
        if hm.top_windows:
            best = hm.top_windows[0]
            sample_size = best.get("sample_size", 0)
            if sample_size >= 1000:
                confidence = "high"
            elif sample_size >= 300:
                confidence = "medium"
            else:
                confidence = "low"

            alternatives = [
                {
                    "day_of_week": w["day_of_week"],
                    "hour_of_day": w["hour_of_day"],
                    "ctdr": w["ctdr"],
                    "lift_vs_average": w.get("lift_vs_average", 0.0),
                }
                for w in hm.top_windows[1:]
            ]

            recommendations.append(
                SendTimeRecommendation(
                    segment_id=hm.segment_id,
                    segment_name=hm.segment_name,
                    recommended_day=best["day_of_week"],
                    recommended_hour=best["hour_of_day"],
                    expected_ctdr=best["ctdr"],
                    confidence_level=confidence,
                    timezone=hm.timezone or "UTC",
                    alternative_windows=alternatives,
                )
            )

    # 4. Overall best window
    overall_best = None
    if overall_heatmap.top_windows:
        best = overall_heatmap.top_windows[0]
        day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        overall_best = {
            "day_of_week": best["day_of_week"],
            "day_name": day_names[best["day_of_week"]],
            "hour_of_day": best["hour_of_day"],
            "ctdr": best["ctdr"],
            "lift_vs_average": best.get("lift_vs_average", 0.0),
            "timezone": overall_heatmap.timezone or "UTC",
        }

    report = SendTimeReport(
        heatmaps=heatmaps,
        recommendations=recommendations,
        overall_best_window=overall_best,
        generated_at=datetime.utcnow().isoformat(),
    )

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        report_dict = {
            "heatmaps": [
                {
                    "segment_id": hm.segment_id,
                    "segment_name": hm.segment_name,
                    "timezone": hm.timezone,
                    "cells": [asdict(c) for c in hm.cells],
                    "top_windows": hm.top_windows,
                    "minimum_sample_size": hm.minimum_sample_size,
                }
                for hm in report.heatmaps
            ],
            "recommendations": [asdict(r) for r in report.recommendations],
            "overall_best_window": report.overall_best_window,
            "generated_at": report.generated_at,
        }
        output_path.write_text(json.dumps(report_dict, indent=2, default=str))

    return report


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate send-time performance heatmaps and recommendations.")
    parser.add_argument(
        "sends_path",
        nargs="?",
        default=Path("workspace/raw/email_sends.csv"),
        type=Path,
        help="Path to email_sends.csv.",
    )
    parser.add_argument(
        "--output",
        default=Path("workspace/analysis/send_time_heatmap.json"),
        type=Path,
        help="Path for the generated send-time JSON report.",
    )
    args = parser.parse_args()

    report = generate_send_time_report(
        sends_csv_path=args.sends_path,
        output_path=args.output,
    )
    print(f"Send-time report generated: {len(report.recommendations)} recommendations")
