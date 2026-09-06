"""Engagement analysis: CTDR calculation, revenue attribution, and engagement decay detection.

This script provides deterministic computation for email engagement analytics,
prioritizing click-based metrics over open rates (post-iOS 15). Includes
click-to-delivered rate calculation, downstream revenue attribution, and
engagement decay detection to identify at-risk subscribers.

Inputs:
    - workspace/raw/email_sends.csv: Send-level data with engagement columns.
    - workspace/processed/segments.json: Optional segment definitions for
      segment-level analysis.

Outputs:
    - workspace/analysis/email_engagement.json: Campaign and flow-level
      engagement metrics.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class CampaignEngagement:
    """Engagement metrics for a single campaign or flow step."""

    campaign_id: str
    delivered: int
    unique_clicks: int
    ctdr: float  # click-to-delivered rate
    unique_opens: int | None = None  # reported but de-emphasized
    open_rate: float | None = None  # reported with iOS 15 caveat
    conversions: int = 0
    conversion_rate: float = 0.0
    attributed_revenue: float = 0.0
    revenue_per_email: float = 0.0
    revenue_per_click: float = 0.0
    unsubscribes: int = 0
    unsubscribe_rate: float = 0.0


@dataclass
class SegmentEngagement:
    """Engagement metrics aggregated by audience segment."""

    segment_id: str
    segment_name: str
    total_delivered: int
    total_clicks: int
    ctdr: float
    total_conversions: int = 0
    total_revenue: float = 0.0
    revenue_per_email: float = 0.0


@dataclass
class EngagementDecayRecord:
    """Record of a subscriber whose engagement is declining."""

    subscriber_id: str
    current_click_frequency: float  # clicks per send in recent window
    previous_click_frequency: float  # clicks per send in prior window
    decay_rate: float  # percentage decline
    last_click_date: str | None = None
    risk_level: str = "low"  # "low", "medium", "high"


@dataclass
class EngagementReport:
    """Complete engagement analysis report."""

    campaign_metrics: list[CampaignEngagement] = field(default_factory=list)
    segment_metrics: list[SegmentEngagement] = field(default_factory=list)
    decay_records: list[EngagementDecayRecord] = field(default_factory=list)
    overall_ctdr: float = 0.0
    overall_revenue: float = 0.0
    ios15_caveat: str = (
        "Open rates are inflated by Apple Mail Privacy Protection and should "
        "not be used as a primary engagement metric."
    )
    generated_at: str = ""


# ---------------------------------------------------------------------------
# CTDR calculation
# ---------------------------------------------------------------------------


def calculate_ctdr(
    sends_csv_path: Path,
    group_by: str = "campaign_id",
) -> list[CampaignEngagement]:
    """Calculate click-to-delivered rate (CTDR) per campaign or flow step.

    CTDR = unique_clicks / delivered * 100. This is the primary engagement
    metric post-iOS 15, replacing open rate as the default measure.

    Args:
        sends_csv_path: Path to ``email_sends.csv`` with columns
            ``campaign_id``, ``delivered``, ``clicked``, ``opened``,
            ``converted``, ``unsubscribed``.
        group_by: Column to group by. Typically ``"campaign_id"`` for campaign
            analysis or ``"flow_id"`` for lifecycle flow analysis.

    Returns:
        List of ``CampaignEngagement`` objects with CTDR and related metrics.
    """
    df = pd.read_csv(sends_csv_path)

    # Ensure boolean/int columns exist with defaults
    for col in ("clicked", "opened", "converted", "unsubscribed"):
        if col not in df.columns:
            df[col] = 0
    if "delivered" not in df.columns:
        df["delivered"] = 1  # assume delivered if column missing
    if "revenue" not in df.columns:
        df["revenue"] = 0.0

    grouped = (
        df.groupby(group_by)
        .agg(
            delivered=("delivered", "sum"),
            unique_clicks=("clicked", "sum"),
            unique_opens=("opened", "sum"),
            conversions=("converted", "sum"),
            attributed_revenue=("revenue", "sum"),
            unsubscribes=("unsubscribed", "sum"),
        )
        .reset_index()
    )

    results: list[CampaignEngagement] = []
    for _, row in grouped.iterrows():
        delivered = int(row["delivered"])
        clicks = int(row["unique_clicks"])
        opens = int(row["unique_opens"])
        conversions = int(row["conversions"])
        revenue = float(row["attributed_revenue"])
        unsubs = int(row["unsubscribes"])

        ctdr = (clicks / delivered * 100) if delivered > 0 else 0.0
        open_rate = (opens / delivered * 100) if delivered > 0 else 0.0
        conversion_rate = (conversions / clicks * 100) if clicks > 0 else 0.0
        rpe = revenue / delivered if delivered > 0 else 0.0
        rpc = revenue / clicks if clicks > 0 else 0.0
        unsub_rate = (unsubs / delivered * 100) if delivered > 0 else 0.0

        results.append(
            CampaignEngagement(
                campaign_id=str(row[group_by]),
                delivered=delivered,
                unique_clicks=clicks,
                ctdr=round(ctdr, 4),
                unique_opens=opens,
                open_rate=round(open_rate, 4),
                conversions=conversions,
                conversion_rate=round(conversion_rate, 4),
                attributed_revenue=round(revenue, 2),
                revenue_per_email=round(rpe, 4),
                revenue_per_click=round(rpc, 4),
                unsubscribes=unsubs,
                unsubscribe_rate=round(unsub_rate, 4),
            )
        )

    return results


def calculate_segment_ctdr(
    sends_csv_path: Path,
    segments_json_path: Path,
) -> list[SegmentEngagement]:
    """Calculate CTDR broken down by audience segment.

    Joins send-level data with segment definitions to produce segment-level
    engagement metrics.

    Args:
        sends_csv_path: Path to ``email_sends.csv``.
        segments_json_path: Path to ``segments.json`` from the
            audience-segmentation skill.

    Returns:
        List of ``SegmentEngagement`` objects, one per segment.
    """
    df = pd.read_csv(sends_csv_path)

    for col in ("clicked", "converted", "delivered"):
        if col not in df.columns:
            df[col] = 1 if col == "delivered" else 0
    if "revenue" not in df.columns:
        df["revenue"] = 0.0

    with open(segments_json_path) as f:
        segments_data = json.load(f)

    # segments_data can be a list of {customer_id, segment_name, ...} or
    # a dict with a "segments" key
    if isinstance(segments_data, dict):
        segments_list = segments_data.get("segments", segments_data.get("data", []))
    else:
        segments_list = segments_data

    seg_df = pd.DataFrame(segments_list)

    # Determine the join key: "customer_id" or "recipient"
    send_key = "recipient" if "recipient" in df.columns else "customer_id"
    seg_key = "customer_id" if "customer_id" in seg_df.columns else "subscriber_id"

    merged = df.merge(seg_df, left_on=send_key, right_on=seg_key, how="inner")

    # Build a segment_id if not present
    if "segment_id" not in merged.columns:
        # Use segment_name as segment_id
        merged["segment_id"] = merged["segment_name"]

    grouped = (
        merged.groupby(["segment_id", "segment_name"])
        .agg(
            total_delivered=("delivered", "sum"),
            total_clicks=("clicked", "sum"),
            total_conversions=("converted", "sum"),
            total_revenue=("revenue", "sum"),
        )
        .reset_index()
    )

    results: list[SegmentEngagement] = []
    for _, row in grouped.iterrows():
        delivered = int(row["total_delivered"])
        clicks = int(row["total_clicks"])
        ctdr = (clicks / delivered * 100) if delivered > 0 else 0.0
        rpe = float(row["total_revenue"]) / delivered if delivered > 0 else 0.0

        results.append(
            SegmentEngagement(
                segment_id=str(row["segment_id"]),
                segment_name=str(row["segment_name"]),
                total_delivered=delivered,
                total_clicks=clicks,
                ctdr=round(ctdr, 4),
                total_conversions=int(row["total_conversions"]),
                total_revenue=round(float(row["total_revenue"]), 2),
                revenue_per_email=round(rpe, 4),
            )
        )

    return results


# ---------------------------------------------------------------------------
# Revenue attribution
# ---------------------------------------------------------------------------


def attribute_revenue(
    sends_csv_path: Path,
    conversions_csv_path: Path | None = None,
    attribution_window_days: int = 7,
    attribution_model: str = "last_click",
) -> list[CampaignEngagement]:
    """Attribute downstream revenue to email campaigns via click-throughs.

    Matches email click events to subsequent conversion events within the
    attribution window. Supports last-click and linear attribution models.

    Args:
        sends_csv_path: Path to ``email_sends.csv`` with click timestamps.
        conversions_csv_path: Path to conversion event data. If ``None``,
            uses the ``converted`` and ``revenue`` columns in
            ``email_sends.csv``.
        attribution_window_days: Maximum days between click and conversion
            for attribution. Must match the organization's standard model.
        attribution_model: Attribution model to use. One of ``"last_click"``,
            ``"linear"``, or ``"time_decay"``.

    Returns:
        List of ``CampaignEngagement`` objects with revenue metrics populated.
    """
    df = pd.read_csv(sends_csv_path, parse_dates=["send_time"])

    for col in ("clicked", "delivered", "converted", "opened", "unsubscribed"):
        if col not in df.columns:
            df[col] = 1 if col == "delivered" else 0
    if "revenue" not in df.columns:
        df["revenue"] = 0.0

    if conversions_csv_path is not None and conversions_csv_path.exists():
        conv_df = pd.read_csv(conversions_csv_path, parse_dates=["conversion_time"])
        # Join clicks to conversions within the attribution window
        clicks = df[df["clicked"] == 1].copy()
        if "click_time" in clicks.columns:
            clicks["click_time"] = pd.to_datetime(clicks["click_time"])
        else:
            clicks["click_time"] = clicks["send_time"]

        recipient_col = "recipient" if "recipient" in clicks.columns else "customer_id"
        conv_recipient_col = "recipient" if "recipient" in conv_df.columns else "customer_id"

        merged = clicks.merge(conv_df, left_on=recipient_col, right_on=conv_recipient_col, suffixes=("", "_conv"))
        merged["days_to_conv"] = (merged["conversion_time"] - merged["click_time"]).dt.days
        merged = merged[(merged["days_to_conv"] >= 0) & (merged["days_to_conv"] <= attribution_window_days)]

        if attribution_model == "last_click":
            # Keep only the most recent click before each conversion
            merged = merged.sort_values("click_time", ascending=False)
            conv_id_col = "conversion_id" if "conversion_id" in merged.columns else "conversion_time"
            merged = merged.drop_duplicates(subset=[conv_recipient_col, conv_id_col], keep="first")
        elif attribution_model == "linear":
            # Split revenue equally among all qualifying clicks
            conv_id_col = "conversion_id" if "conversion_id" in merged.columns else "conversion_time"
            touch_counts = merged.groupby([conv_recipient_col, conv_id_col]).size().rename("touch_count")
            merged = merged.merge(touch_counts, on=[conv_recipient_col, conv_id_col])
            conv_rev_col = "conversion_revenue" if "conversion_revenue" in merged.columns else "revenue_conv"
            if conv_rev_col in merged.columns:
                merged[conv_rev_col] = merged[conv_rev_col] / merged["touch_count"]
        elif attribution_model == "time_decay":
            # Weight by recency: more recent clicks get more credit
            conv_id_col = "conversion_id" if "conversion_id" in merged.columns else "conversion_time"
            merged["decay_weight"] = np.exp(-0.1 * merged["days_to_conv"])
            group_weights = merged.groupby([conv_recipient_col, conv_id_col])["decay_weight"].transform("sum")
            merged["attribution_share"] = merged["decay_weight"] / group_weights
            conv_rev_col = "conversion_revenue" if "conversion_revenue" in merged.columns else "revenue_conv"
            if conv_rev_col in merged.columns:
                merged[conv_rev_col] = merged[conv_rev_col] * merged["attribution_share"]

        # Aggregate by campaign
        conv_rev_col = "conversion_revenue" if "conversion_revenue" in merged.columns else "revenue_conv"
        if conv_rev_col not in merged.columns:
            conv_rev_col = "revenue"

        campaign_rev = (
            merged.groupby("campaign_id")
            .agg(
                attributed_revenue=(conv_rev_col, "sum"),
                conversions=(conv_rev_col, "count"),
            )
            .reset_index()
        )

        # Merge back with campaign-level delivery stats
        campaign_stats = (
            df.groupby("campaign_id")
            .agg(
                delivered=("delivered", "sum"),
                unique_clicks=("clicked", "sum"),
                unique_opens=("opened", "sum"),
                unsubscribes=("unsubscribed", "sum"),
            )
            .reset_index()
        )

        final = campaign_stats.merge(campaign_rev, on="campaign_id", how="left")
        final["attributed_revenue"] = final["attributed_revenue"].fillna(0)
        final["conversions"] = final["conversions"].fillna(0).astype(int)
    else:
        # Use inline revenue/conversion columns
        final = (
            df.groupby("campaign_id")
            .agg(
                delivered=("delivered", "sum"),
                unique_clicks=("clicked", "sum"),
                unique_opens=("opened", "sum"),
                conversions=("converted", "sum"),
                attributed_revenue=("revenue", "sum"),
                unsubscribes=("unsubscribed", "sum"),
            )
            .reset_index()
        )

    results: list[CampaignEngagement] = []
    for _, row in final.iterrows():
        delivered = int(row["delivered"])
        clicks = int(row["unique_clicks"])
        opens = int(row.get("unique_opens", 0))
        conversions = int(row["conversions"])
        revenue = float(row["attributed_revenue"])
        unsubs = int(row.get("unsubscribes", 0))

        ctdr = (clicks / delivered * 100) if delivered > 0 else 0.0
        open_rate = (opens / delivered * 100) if delivered > 0 else 0.0
        conversion_rate = (conversions / clicks * 100) if clicks > 0 else 0.0
        rpe = revenue / delivered if delivered > 0 else 0.0
        rpc = revenue / clicks if clicks > 0 else 0.0
        unsub_rate = (unsubs / delivered * 100) if delivered > 0 else 0.0

        results.append(
            CampaignEngagement(
                campaign_id=str(row["campaign_id"]),
                delivered=delivered,
                unique_clicks=clicks,
                ctdr=round(ctdr, 4),
                unique_opens=opens,
                open_rate=round(open_rate, 4),
                conversions=conversions,
                conversion_rate=round(conversion_rate, 4),
                attributed_revenue=round(revenue, 2),
                revenue_per_email=round(rpe, 4),
                revenue_per_click=round(rpc, 4),
                unsubscribes=unsubs,
                unsubscribe_rate=round(unsub_rate, 4),
            )
        )

    return results


# ---------------------------------------------------------------------------
# Engagement decay detection
# ---------------------------------------------------------------------------


def detect_engagement_decay(
    sends_csv_path: Path,
    recent_window_days: int = 30,
    comparison_window_days: int = 60,
    decay_threshold: float = 0.5,
) -> list[EngagementDecayRecord]:
    """Identify subscribers whose click engagement is declining.

    Compares each subscriber's click frequency in the recent window against
    a prior comparison window. Subscribers whose frequency has dropped by
    more than ``decay_threshold`` (as a fraction) are flagged.

    Args:
        sends_csv_path: Path to ``email_sends.csv`` with per-send click data.
        recent_window_days: Number of recent days for the current engagement
            window.
        comparison_window_days: Number of days for the prior baseline window
            (ending where ``recent_window_days`` begins).
        decay_threshold: Minimum fractional decline in click frequency to flag
            a subscriber. E.g., ``0.5`` means a 50% decline triggers a flag.

    Returns:
        List of ``EngagementDecayRecord`` objects for declining subscribers,
        sorted by decay rate descending.
    """
    df = pd.read_csv(sends_csv_path, parse_dates=["send_time"])
    if "clicked" not in df.columns:
        df["clicked"] = 0

    recipient_col = "recipient" if "recipient" in df.columns else "customer_id"

    reference_date = df["send_time"].max()
    recent_start = reference_date - timedelta(days=recent_window_days)
    comparison_start = recent_start - timedelta(days=comparison_window_days)

    recent = df[df["send_time"] >= recent_start]
    comparison = df[(df["send_time"] >= comparison_start) & (df["send_time"] < recent_start)]

    # Compute click frequency (clicks per send) per subscriber in each window
    def _click_freq(subset: pd.DataFrame) -> pd.DataFrame:
        grouped = (
            subset.groupby(recipient_col)
            .agg(
                sends=("clicked", "count"),
                clicks=("clicked", "sum"),
            )
            .reset_index()
        )
        grouped["freq"] = grouped["clicks"] / grouped["sends"]
        return grouped

    recent_freq = _click_freq(recent).rename(
        columns={"freq": "recent_freq", "sends": "recent_sends", "clicks": "recent_clicks"}
    )
    comparison_freq = _click_freq(comparison).rename(
        columns={"freq": "previous_freq", "sends": "prev_sends", "clicks": "prev_clicks"}
    )

    merged = comparison_freq.merge(recent_freq, on=recipient_col, how="inner")

    # Only flag subscribers who had some engagement in the comparison window
    merged = merged[merged["previous_freq"] > 0]

    merged["decay_rate"] = (merged["previous_freq"] - merged["recent_freq"]) / merged["previous_freq"]
    decaying = merged[merged["decay_rate"] >= decay_threshold].copy()
    decaying = decaying.sort_values("decay_rate", ascending=False)

    # Get last click date per subscriber
    clicked_df = df[df["clicked"] == 1]
    if not clicked_df.empty:
        last_clicks = clicked_df.groupby(recipient_col)["send_time"].max().rename("last_click_date")
        decaying = decaying.merge(last_clicks, left_on=recipient_col, right_index=True, how="left")
    else:
        decaying["last_click_date"] = pd.NaT

    results: list[EngagementDecayRecord] = []
    for _, row in decaying.iterrows():
        last_click = row.get("last_click_date")
        last_click_str = str(last_click.date()) if pd.notna(last_click) else None
        days_since = (reference_date - last_click).days if pd.notna(last_click) else None

        risk = classify_decay_risk(float(row["decay_rate"]), days_since)

        results.append(
            EngagementDecayRecord(
                subscriber_id=str(row[recipient_col]),
                current_click_frequency=round(float(row["recent_freq"]), 4),
                previous_click_frequency=round(float(row["previous_freq"]), 4),
                decay_rate=round(float(row["decay_rate"]), 4),
                last_click_date=last_click_str,
                risk_level=risk,
            )
        )

    return results


def classify_decay_risk(
    decay_rate: float,
    days_since_last_click: int | None = None,
) -> str:
    """Classify a subscriber's churn risk based on engagement decay signals.

    Args:
        decay_rate: Fractional decline in click frequency (0.0 to 1.0).
        days_since_last_click: Days since the subscriber last clicked. ``None``
            if unknown.

    Returns:
        Risk level: ``"low"``, ``"medium"``, or ``"high"``.
    """
    # High risk: severe decay or very long time since last click
    if decay_rate >= 0.8:
        return "high"
    if days_since_last_click is not None and days_since_last_click >= 60:
        return "high"

    # Medium risk: moderate decay or moderate recency
    if decay_rate >= 0.5:
        return "medium"
    if days_since_last_click is not None and days_since_last_click >= 30:
        return "medium"

    return "low"


# ---------------------------------------------------------------------------
# Unsubscribe trend analysis
# ---------------------------------------------------------------------------


def analyze_unsubscribe_trends(
    sends_csv_path: Path,
    group_by: str = "campaign_id",
    window_days: int = 90,
) -> list[dict[str, Any]]:
    """Analyze unsubscribe rate trends over time and by campaign type.

    Identifies campaigns or flow steps with elevated unsubscribe rates and
    detects upward trends that may signal list fatigue.

    Args:
        sends_csv_path: Path to ``email_sends.csv``.
        group_by: Column to group by (``"campaign_id"``, ``"campaign_type"``,
            or ``"date"``).
        window_days: Lookback window in days for trend analysis.

    Returns:
        List of dicts with unsubscribe rate, trend direction, and flagged
        anomalies.
    """
    df = pd.read_csv(sends_csv_path, parse_dates=["send_time"])

    for col in ("unsubscribed", "delivered"):
        if col not in df.columns:
            df[col] = 1 if col == "delivered" else 0

    reference_date = df["send_time"].max()
    cutoff = reference_date - timedelta(days=window_days)
    df = df[df["send_time"] >= cutoff]

    if group_by == "date":
        df["date"] = df["send_time"].dt.date
        actual_group = "date"
    else:
        actual_group = group_by

    if actual_group not in df.columns:
        return []

    grouped = (
        df.groupby(actual_group)
        .agg(
            total_delivered=("delivered", "sum"),
            total_unsubscribes=("unsubscribed", "sum"),
        )
        .reset_index()
    )

    grouped["unsubscribe_rate"] = np.where(
        grouped["total_delivered"] > 0,
        grouped["total_unsubscribes"] / grouped["total_delivered"] * 100,
        0.0,
    )

    # Compute overall average for anomaly detection
    overall_rate = grouped["unsubscribe_rate"].mean()
    overall_std = grouped["unsubscribe_rate"].std()

    results: list[dict[str, Any]] = []
    for _, row in grouped.iterrows():
        rate = float(row["unsubscribe_rate"])
        is_anomaly = bool(overall_std > 0 and rate > overall_rate + 2 * overall_std)

        # Determine trend direction for date-based grouping
        trend = "stable"
        if group_by == "date" and len(grouped) >= 4:
            # Use simple linear regression on the date-ordered rates
            idx = grouped.index.get_loc(row.name)
            if idx >= 3:
                recent_rates = grouped["unsubscribe_rate"].iloc[max(0, idx - 6) : idx + 1].values
                if len(recent_rates) >= 3:
                    x = np.arange(len(recent_rates))
                    slope, _, _, _, _ = stats.linregress(x, recent_rates)
                    if slope > 0.001:
                        trend = "increasing"
                    elif slope < -0.001:
                        trend = "decreasing"

        results.append(
            {
                "group": str(row[actual_group]),
                "total_delivered": int(row["total_delivered"]),
                "total_unsubscribes": int(row["total_unsubscribes"]),
                "unsubscribe_rate": round(rate, 4),
                "trend": trend,
                "is_anomaly": is_anomaly,
                "overall_average_rate": round(overall_rate, 4),
            }
        )

    return results


# ---------------------------------------------------------------------------
# Subject line analysis (chi-squared test on click rates)
# ---------------------------------------------------------------------------


def analyze_subject_lines(
    sends_csv_path: Path,
    subject_column: str = "subject_line",
    min_sample_size: int = 30,
) -> list[dict[str, Any]]:
    """Analyze subject line performance using chi-squared test on click rates.

    Compares click rates across different subject lines to identify
    statistically significant differences.

    Args:
        sends_csv_path: Path to ``email_sends.csv`` with a subject line column.
        subject_column: Column containing subject line text.
        min_sample_size: Minimum delivered count per subject line for inclusion.

    Returns:
        List of dicts with subject line performance and statistical significance.
    """
    df = pd.read_csv(sends_csv_path)
    if subject_column not in df.columns:
        return []

    for col in ("clicked", "delivered"):
        if col not in df.columns:
            df[col] = 1 if col == "delivered" else 0

    grouped = (
        df.groupby(subject_column)
        .agg(
            delivered=("delivered", "sum"),
            clicks=("clicked", "sum"),
        )
        .reset_index()
    )

    # Filter for minimum sample size
    grouped = grouped[grouped["delivered"] >= min_sample_size]

    if len(grouped) < 2:
        single_subject_results: list[dict[str, Any]] = []
        for _, row in grouped.iterrows():
            delivered = int(row["delivered"])
            clicks = int(row["clicks"])
            single_subject_results.append(
                {
                    "subject_line": str(row[subject_column]),
                    "delivered": delivered,
                    "clicks": clicks,
                    "ctdr": round(clicks / delivered * 100, 4) if delivered > 0 else 0.0,
                    "chi2_p_value": None,
                    "significant": False,
                }
            )
        return single_subject_results

    # Build contingency table: rows = subject lines, cols = [clicked, not_clicked]
    contingency = np.array(
        [[int(row["clicks"]), int(row["delivered"]) - int(row["clicks"])] for _, row in grouped.iterrows()]
    )

    chi2, p_value, dof, expected = stats.chi2_contingency(contingency)

    results: list[dict[str, Any]] = []
    for _, row in grouped.iterrows():
        delivered = int(row["delivered"])
        clicks = int(row["clicks"])
        results.append(
            {
                "subject_line": str(row[subject_column]),
                "delivered": delivered,
                "clicks": clicks,
                "ctdr": round(clicks / delivered * 100, 4) if delivered > 0 else 0.0,
                "chi2_statistic": round(float(chi2), 4),
                "chi2_p_value": round(float(p_value), 6),
                "significant": bool(p_value < 0.05),
            }
        )

    # Sort by CTDR descending
    results.sort(key=lambda x: float(x["ctdr"]), reverse=True)
    return results


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------


def generate_engagement_report(
    sends_csv_path: Path,
    segments_json_path: Path | None = None,
    conversions_csv_path: Path | None = None,
    attribution_window_days: int = 7,
    output_path: Path | None = None,
) -> EngagementReport:
    """Generate a complete email engagement analysis report.

    Orchestrates CTDR calculation, revenue attribution, engagement decay
    detection, and unsubscribe trend analysis into a single report.

    Args:
        sends_csv_path: Path to ``email_sends.csv``.
        segments_json_path: Path to ``segments.json`` for segment-level
            analysis. If ``None``, segment analysis is skipped.
        conversions_csv_path: Path to conversion event data for revenue
            attribution. If ``None``, uses inline conversion columns.
        attribution_window_days: Attribution window for revenue calculation.
        output_path: If provided, write the report JSON to this path.
            Defaults to ``workspace/analysis/email_engagement.json``.

    Returns:
        ``EngagementReport`` with all engagement findings.
    """
    # 1. Campaign-level CTDR
    campaign_metrics = attribute_revenue(
        sends_csv_path,
        conversions_csv_path=conversions_csv_path,
        attribution_window_days=attribution_window_days,
    )

    # 2. Segment-level CTDR
    segment_metrics: list[SegmentEngagement] = []
    if segments_json_path is not None and segments_json_path.exists():
        segment_metrics = calculate_segment_ctdr(sends_csv_path, segments_json_path)

    # 3. Engagement decay detection
    decay_records = detect_engagement_decay(sends_csv_path)

    # 4. Compute overall CTDR and revenue
    total_delivered = sum(c.delivered for c in campaign_metrics)
    total_clicks = sum(c.unique_clicks for c in campaign_metrics)
    total_revenue = sum(c.attributed_revenue for c in campaign_metrics)
    overall_ctdr = (total_clicks / total_delivered * 100) if total_delivered > 0 else 0.0

    report = EngagementReport(
        campaign_metrics=campaign_metrics,
        segment_metrics=segment_metrics,
        decay_records=decay_records,
        overall_ctdr=round(overall_ctdr, 4),
        overall_revenue=round(total_revenue, 2),
        generated_at=datetime.utcnow().isoformat(),
    )

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        report_dict = {
            "campaign_metrics": [asdict(c) for c in report.campaign_metrics],
            "segment_metrics": [asdict(s) for s in report.segment_metrics],
            "decay_records": [asdict(d) for d in report.decay_records],
            "overall_ctdr": report.overall_ctdr,
            "overall_revenue": report.overall_revenue,
            "ios15_caveat": report.ios15_caveat,
            "generated_at": report.generated_at,
        }
        output_path.write_text(json.dumps(report_dict, indent=2, default=str))

    return report


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Generate email engagement metrics and click-to-delivered-rate analysis."
    )
    parser.add_argument(
        "sends_path",
        nargs="?",
        default=Path("workspace/raw/email_sends.csv"),
        type=Path,
        help="Path to email_sends.csv.",
    )
    parser.add_argument(
        "--output",
        default=Path("workspace/analysis/email_engagement.json"),
        type=Path,
        help="Path for the generated engagement JSON report.",
    )
    args = parser.parse_args()

    report = generate_engagement_report(
        sends_csv_path=args.sends_path,
        output_path=args.output,
    )
    print(f"Engagement report generated: overall_ctdr={report.overall_ctdr}")
