"""List health: inactive subscriber scoring and re-engagement trigger identification.

This script provides deterministic computation for email list health assessment,
including inactive subscriber identification, re-engagement campaign trigger
logic, and overall list hygiene scoring.

Inputs:
    - workspace/raw/email_sends.csv: Send-level data with engagement history.
    - workspace/processed/segments.json: Optional segment definitions.

Outputs:
    - workspace/analysis/list_health.json: Inactive subscriber identification
      and re-engagement targets.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class InactiveSubscriber:
    """A subscriber identified as inactive based on click recency."""

    subscriber_id: str
    last_click_date: str | None  # ISO 8601 or None if never clicked
    days_since_last_click: int | None  # None if never clicked
    total_sends_received: int = 0
    total_clicks_lifetime: int = 0
    lifetime_ctdr: float = 0.0
    inactivity_score: float = 0.0  # 0.0 (recently active) to 1.0 (long inactive)
    recommended_action: str = ""  # "re-engage", "suppress", "sunset"


@dataclass
class ReEngagementTrigger:
    """A trigger condition for initiating a re-engagement campaign."""

    trigger_id: str
    trigger_type: str  # "inactivity_threshold", "decay_detected", "clv_at_risk"
    description: str
    subscriber_count: int = 0
    subscriber_ids: list[str] = field(default_factory=list)
    priority: str = "medium"  # "low", "medium", "high"
    recommended_flow: str = ""  # e.g., "re-engagement", "win-back"


@dataclass
class ListHygieneScore:
    """Composite list health score with component breakdown."""

    overall_score: float  # 0.0 to 1.0
    bounce_component: float = 0.0  # penalizes high bounce rates
    engagement_component: float = 0.0  # rewards high CTDR
    inactive_component: float = 0.0  # penalizes high inactive rate
    complaint_component: float = 0.0  # penalizes high complaint rate
    list_growth_rate: float = 0.0
    total_subscribers: int = 0
    active_subscribers: int = 0
    inactive_subscribers: int = 0


@dataclass
class ListHealthReport:
    """Complete list health assessment report."""

    hygiene_score: ListHygieneScore | None = None
    inactive_subscribers: list[InactiveSubscriber] = field(default_factory=list)
    re_engagement_triggers: list[ReEngagementTrigger] = field(default_factory=list)
    summary_stats: dict[str, Any] = field(default_factory=dict)
    generated_at: str = ""


# ---------------------------------------------------------------------------
# Inactive subscriber scoring
# ---------------------------------------------------------------------------


def identify_inactive_subscribers(
    sends_csv_path: Path,
    inactivity_threshold_days: int = 90,
    reference_date: datetime | None = None,
) -> list[InactiveSubscriber]:
    """Identify subscribers with no click activity within the lookback period.

    Scans send-level data to find subscribers who have not clicked any email
    within ``inactivity_threshold_days``. Uses click recency (not open
    recency) per post-iOS 15 guidance.

    Args:
        sends_csv_path: Path to ``email_sends.csv`` with columns
            ``recipient``, ``send_time``, ``clicked``.
        inactivity_threshold_days: Number of days without a click before a
            subscriber is classified as inactive. Default is 90 days.
        reference_date: The date to measure inactivity from. Defaults to the
            maximum ``send_time`` in the dataset.

    Returns:
        List of ``InactiveSubscriber`` objects sorted by inactivity score
        descending (most inactive first).
    """
    df = pd.read_csv(sends_csv_path, parse_dates=["send_time"])

    if "clicked" not in df.columns:
        df["clicked"] = 0
    if "delivered" not in df.columns:
        df["delivered"] = 1

    recipient_col = "recipient" if "recipient" in df.columns else "customer_id"

    if reference_date is None:
        reference_date = df["send_time"].max()

    # Per-subscriber aggregation
    subscriber_stats = (
        df.groupby(recipient_col)
        .agg(
            total_sends=("delivered", "sum"),
            total_clicks=("clicked", "sum"),
        )
        .reset_index()
    )

    # Last click date per subscriber
    clicked_df = df[df["clicked"] == 1]
    if not clicked_df.empty:
        last_clicks = clicked_df.groupby(recipient_col)["send_time"].max().rename("last_click_date")
        subscriber_stats = subscriber_stats.merge(last_clicks, left_on=recipient_col, right_index=True, how="left")
    else:
        subscriber_stats["last_click_date"] = pd.NaT

    # Compute days since last click
    subscriber_stats["days_since_last_click"] = subscriber_stats["last_click_date"].apply(
        lambda x: (reference_date - x).days if pd.notna(x) else None
    )

    # Filter for inactive subscribers
    inactive_mask = subscriber_stats["days_since_last_click"].apply(
        lambda x: x is None or x >= inactivity_threshold_days
    )
    inactive_df = subscriber_stats[inactive_mask].copy()

    results: list[InactiveSubscriber] = []
    for _, row in inactive_df.iterrows():
        total_sends = int(row["total_sends"])
        total_clicks = int(row["total_clicks"])
        days_since = int(row["days_since_last_click"]) if pd.notna(row["days_since_last_click"]) else None
        last_click = str(row["last_click_date"].date()) if pd.notna(row["last_click_date"]) else None
        lifetime_ctdr = (total_clicks / total_sends * 100) if total_sends > 0 else 0.0

        inactivity = score_inactivity(
            days_since_last_click=days_since,
            total_sends_received=total_sends,
            total_clicks_lifetime=total_clicks,
            inactivity_threshold_days=inactivity_threshold_days,
        )

        action = recommend_action(
            inactivity_score=inactivity,
            lifetime_ctdr=lifetime_ctdr,
            days_since_last_click=days_since,
        )

        results.append(
            InactiveSubscriber(
                subscriber_id=str(row[recipient_col]),
                last_click_date=last_click,
                days_since_last_click=days_since,
                total_sends_received=total_sends,
                total_clicks_lifetime=total_clicks,
                lifetime_ctdr=round(lifetime_ctdr, 4),
                inactivity_score=round(inactivity, 4),
                recommended_action=action,
            )
        )

    # Sort by inactivity score descending (most inactive first)
    results.sort(key=lambda x: x.inactivity_score, reverse=True)

    return results


def score_inactivity(
    days_since_last_click: int | None,
    total_sends_received: int,
    total_clicks_lifetime: int,
    inactivity_threshold_days: int = 90,
) -> float:
    """Compute an inactivity score for a subscriber.

    Score ranges from 0.0 (recently active) to 1.0 (long-term inactive).
    Factors in recency of last click, total engagement history, and volume
    of sends received without engagement.

    Args:
        days_since_last_click: Days since last click, or ``None`` if the
            subscriber has never clicked.
        total_sends_received: Total number of emails delivered to subscriber.
        total_clicks_lifetime: Total number of clicks across all sends.
        inactivity_threshold_days: The configured inactivity threshold.

    Returns:
        Float from 0.0 to 1.0 representing inactivity severity.
    """
    # Recency component (50% weight): how long since last click
    # Scale: 0 days = 0.0, 2x threshold = 1.0
    if days_since_last_click is None:
        recency_score = 1.0  # Never clicked = maximum recency penalty
    else:
        recency_score = min(1.0, days_since_last_click / (2 * inactivity_threshold_days))

    # Engagement rate component (30% weight): lifetime click rate
    # Lower lifetime CTDR = higher inactivity score
    if total_sends_received > 0:
        lifetime_rate = total_clicks_lifetime / total_sends_received
        # Rate of 0.05 (5%) or above = 0.0 inactivity, 0.0 rate = 1.0 inactivity
        engagement_score = max(0.0, 1.0 - lifetime_rate / 0.05)
    else:
        engagement_score = 1.0

    # Volume component (20% weight): more sends without clicks = worse
    # If received many emails but rarely clicked, that's a stronger signal
    if total_sends_received > 0 and total_clicks_lifetime == 0:
        # Scale: 10+ sends with zero clicks = max score
        volume_score = min(1.0, total_sends_received / 10.0)
    elif total_sends_received > 0:
        non_click_ratio = 1.0 - (total_clicks_lifetime / total_sends_received)
        volume_score = non_click_ratio
    else:
        volume_score = 0.5

    score = 0.50 * recency_score + 0.30 * engagement_score + 0.20 * volume_score
    return max(0.0, min(1.0, score))


def recommend_action(
    inactivity_score: float,
    lifetime_ctdr: float,
    days_since_last_click: int | None,
) -> str:
    """Recommend an action for an inactive subscriber.

    Args:
        inactivity_score: The subscriber's inactivity score (0.0 to 1.0).
        lifetime_ctdr: The subscriber's lifetime click-to-delivered rate.
        days_since_last_click: Days since last click, or ``None``.

    Returns:
        One of:
        - ``"re-engage"``: Subscriber shows historical engagement; worth
          attempting re-engagement.
        - ``"suppress"``: Subscriber has been inactive long enough to harm
          deliverability; suppress from regular sends.
        - ``"sunset"``: Subscriber has never engaged or has been inactive
          beyond recovery threshold; remove from list.
    """
    # Sunset: never clicked, or inactive for 180+ days with low lifetime CTDR
    if days_since_last_click is None:
        # Never clicked at all
        if lifetime_ctdr == 0.0:
            return "sunset"
        return "suppress"

    if days_since_last_click >= 180:
        if lifetime_ctdr < 1.0:  # less than 1% lifetime CTDR
            return "sunset"
        return "suppress"

    # Suppress: high inactivity score and low engagement
    if inactivity_score >= 0.8 and lifetime_ctdr < 2.0:
        return "suppress"

    if days_since_last_click >= 120:
        return "suppress"

    # Re-engage: subscriber has historical engagement worth recovering
    return "re-engage"


# ---------------------------------------------------------------------------
# Re-engagement trigger identification
# ---------------------------------------------------------------------------


def identify_re_engagement_triggers(
    inactive_subscribers: list[InactiveSubscriber],
    decay_records: list[dict[str, Any]] | None = None,
    clv_scores: dict[str, float] | None = None,
) -> list[ReEngagementTrigger]:
    """Identify triggers for re-engagement campaigns.

    Groups inactive subscribers into actionable trigger cohorts based on
    inactivity thresholds, engagement decay signals, and CLV risk scores.

    Args:
        inactive_subscribers: List of inactive subscribers from
            ``identify_inactive_subscribers``.
        decay_records: Optional list of engagement decay records from
            ``engagement_analysis.detect_engagement_decay``. Used to identify
            subscribers who are declining but not yet fully inactive.
        clv_scores: Optional dict mapping subscriber IDs to CLV
            probability-alive scores. Used to prioritize re-engagement of
            high-value at-risk customers.

    Returns:
        List of ``ReEngagementTrigger`` objects sorted by priority descending.
    """
    triggers: list[ReEngagementTrigger] = []

    # 1. Inactivity threshold trigger: group by recommended action
    re_engage_subs = [s for s in inactive_subscribers if s.recommended_action == "re-engage"]
    if re_engage_subs:
        triggers.append(
            ReEngagementTrigger(
                trigger_id="inactivity_re_engage",
                trigger_type="inactivity_threshold",
                description=f"{len(re_engage_subs)} subscribers inactive but have historical engagement. Candidates for re-engagement flow.",
                subscriber_count=len(re_engage_subs),
                subscriber_ids=[s.subscriber_id for s in re_engage_subs],
                priority="high",
                recommended_flow="re-engagement",
            )
        )

    suppress_subs = [s for s in inactive_subscribers if s.recommended_action == "suppress"]
    if suppress_subs:
        triggers.append(
            ReEngagementTrigger(
                trigger_id="inactivity_suppress",
                trigger_type="inactivity_threshold",
                description=f"{len(suppress_subs)} subscribers should be suppressed from regular sends to protect deliverability.",
                subscriber_count=len(suppress_subs),
                subscriber_ids=[s.subscriber_id for s in suppress_subs],
                priority="medium",
                recommended_flow="sunset",
            )
        )

    sunset_subs = [s for s in inactive_subscribers if s.recommended_action == "sunset"]
    if sunset_subs:
        triggers.append(
            ReEngagementTrigger(
                trigger_id="inactivity_sunset",
                trigger_type="inactivity_threshold",
                description=f"{len(sunset_subs)} subscribers have never engaged or are long-term inactive. Recommended for list removal.",
                subscriber_count=len(sunset_subs),
                subscriber_ids=[s.subscriber_id for s in sunset_subs],
                priority="low",
                recommended_flow="sunset",
            )
        )

    # 2. Decay-based trigger: subscribers whose engagement is actively declining
    if decay_records:
        high_risk_decay = [r for r in decay_records if r.get("risk_level") in ("high", "medium")]
        if high_risk_decay:
            decay_ids = [r.get("subscriber_id", "") for r in high_risk_decay]
            triggers.append(
                ReEngagementTrigger(
                    trigger_id="decay_detected",
                    trigger_type="decay_detected",
                    description=f"{len(high_risk_decay)} subscribers showing engagement decay (medium/high risk). Early intervention recommended.",
                    subscriber_count=len(high_risk_decay),
                    subscriber_ids=decay_ids,
                    priority="high",
                    recommended_flow="re-engagement",
                )
            )

    # 3. CLV-at-risk trigger: high-value subscribers who are becoming inactive
    if clv_scores:
        inactive_ids = {s.subscriber_id for s in inactive_subscribers}
        at_risk_high_value = [
            (sub_id, score)
            for sub_id, score in clv_scores.items()
            if sub_id in inactive_ids and score >= 0.3  # probability_alive >= 30%
        ]
        if at_risk_high_value:
            # Sort by CLV score descending (highest value first)
            at_risk_high_value.sort(key=lambda x: x[1], reverse=True)
            triggers.append(
                ReEngagementTrigger(
                    trigger_id="clv_at_risk",
                    trigger_type="clv_at_risk",
                    description=f"{len(at_risk_high_value)} high-CLV subscribers are inactive. Priority re-engagement to protect revenue.",
                    subscriber_count=len(at_risk_high_value),
                    subscriber_ids=[sub_id for sub_id, _ in at_risk_high_value],
                    priority="high",
                    recommended_flow="win-back",
                )
            )

    # Sort by priority (high > medium > low)
    priority_order = {"high": 0, "medium": 1, "low": 2}
    triggers.sort(key=lambda t: priority_order.get(t.priority, 3))

    return triggers


def prioritize_triggers(
    triggers: list[ReEngagementTrigger],
    max_concurrent_campaigns: int = 3,
) -> list[ReEngagementTrigger]:
    """Prioritize re-engagement triggers when multiple are active.

    Limits the number of concurrent re-engagement campaigns to avoid
    overwhelming the team and diluting focus.

    Args:
        triggers: List of identified triggers.
        max_concurrent_campaigns: Maximum number of re-engagement campaigns
            to recommend simultaneously.

    Returns:
        Top-priority triggers up to ``max_concurrent_campaigns``.
    """
    # Sort by priority, then by subscriber count (larger cohorts first for same priority)
    priority_order = {"high": 0, "medium": 1, "low": 2}
    sorted_triggers = sorted(
        triggers,
        key=lambda t: (priority_order.get(t.priority, 3), -t.subscriber_count),
    )
    return sorted_triggers[:max_concurrent_campaigns]


# ---------------------------------------------------------------------------
# List hygiene scoring
# ---------------------------------------------------------------------------


def compute_list_hygiene_score(
    sends_csv_path: Path,
    inactivity_threshold_days: int = 90,
) -> ListHygieneScore:
    """Compute a composite list hygiene score.

    The score is a weighted combination of:
    - Bounce rate component (35%): penalizes hard bounce rates above 5%.
    - Engagement component (30%): rewards CTDR up to 3%.
    - Inactive component (20%): penalizes high inactive subscriber rates.
    - Complaint component (15%): penalizes complaint rates above 0.1%.

    Args:
        sends_csv_path: Path to ``email_sends.csv``.
        inactivity_threshold_days: Days without click to count as inactive.

    Returns:
        ``ListHygieneScore`` with overall score and component breakdown.
    """
    df = pd.read_csv(sends_csv_path, parse_dates=["send_time"])

    for col in ("delivered", "clicked", "bounced"):
        if col not in df.columns:
            df[col] = 1 if col == "delivered" else 0
    if "complaint" not in df.columns:
        df["complaint"] = 0

    recipient_col = "recipient" if "recipient" in df.columns else "customer_id"
    reference_date = df["send_time"].max()

    total_sent = len(df)
    total_delivered = int(df["delivered"].sum())
    total_clicks = int(df["clicked"].sum())
    total_bounced = int(df["bounced"].sum())
    total_complaints = int(df["complaint"].sum())

    # Hard bounce rate
    if "bounce_type" in df.columns:
        hard_bounces = int(df[df["bounce_type"] == "hard"]["bounced"].sum())
    else:
        hard_bounces = total_bounced
    hard_bounce_rate = hard_bounces / total_sent if total_sent > 0 else 0.0

    # CTDR
    ctdr = total_clicks / total_delivered if total_delivered > 0 else 0.0

    # Complaint rate
    complaint_rate = total_complaints / total_delivered if total_delivered > 0 else 0.0

    # Inactive subscriber rate
    all_subscribers = df[recipient_col].nunique()

    # Identify active subscribers (clicked within threshold)
    cutoff = reference_date - timedelta(days=inactivity_threshold_days)
    clicked_df = df[df["clicked"] == 1]
    if not clicked_df.empty:
        recent_clickers = clicked_df[clicked_df["send_time"] >= cutoff][recipient_col].nunique()
    else:
        recent_clickers = 0

    active_count = recent_clickers
    inactive_count = all_subscribers - active_count
    inactive_rate = inactive_count / all_subscribers if all_subscribers > 0 else 0.0

    # Compute components per the formula from email_metrics.md:
    # bounce_component = 1 - hard_bounce_rate / 0.05
    bounce_component = max(0.0, min(1.0, 1.0 - hard_bounce_rate / 0.05))

    # engagement_component = min(ctdr / 0.03, 1.0)
    engagement_component = max(0.0, min(1.0, ctdr / 0.03))

    # inactive_component = 1 - inactive_rate / 0.50
    inactive_component = max(0.0, min(1.0, 1.0 - inactive_rate / 0.50))

    # complaint_component = 1 - complaint_rate / 0.001
    complaint_component = max(0.0, min(1.0, 1.0 - complaint_rate / 0.001))

    # Weighted overall score
    overall = (
        0.35 * bounce_component + 0.30 * engagement_component + 0.20 * inactive_component + 0.15 * complaint_component
    )
    overall = max(0.0, min(1.0, overall))

    # List growth rate (approximate from data: new subscribers - unsubscribes - bounces)
    # This is a simplified calculation; in practice would need subscriber join dates
    list_growth_rate = 0.0  # Cannot compute precisely without subscriber join date data

    return ListHygieneScore(
        overall_score=round(overall, 4),
        bounce_component=round(bounce_component, 4),
        engagement_component=round(engagement_component, 4),
        inactive_component=round(inactive_component, 4),
        complaint_component=round(complaint_component, 4),
        list_growth_rate=round(list_growth_rate, 4),
        total_subscribers=all_subscribers,
        active_subscribers=active_count,
        inactive_subscribers=inactive_count,
    )


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------


def generate_list_health_report(
    sends_csv_path: Path,
    segments_json_path: Path | None = None,
    inactivity_threshold_days: int = 90,
    clv_scores_path: Path | None = None,
    output_path: Path | None = None,
) -> ListHealthReport:
    """Generate a complete list health assessment report.

    Orchestrates inactive subscriber identification, re-engagement trigger
    detection, and list hygiene scoring into a single report.

    Args:
        sends_csv_path: Path to ``email_sends.csv``.
        segments_json_path: Path to ``segments.json`` for segment-level
            health analysis. If ``None``, segment breakdown is skipped.
        inactivity_threshold_days: Days without click to count as inactive.
            Default 90 days.
        clv_scores_path: Path to CLV probability-alive scores for high-value
            subscriber prioritization. If ``None``, CLV-based triggers are
            skipped.
        output_path: If provided, write the report JSON to this path.
            Defaults to ``workspace/analysis/list_health.json``.

    Returns:
        ``ListHealthReport`` with all list health findings.
    """
    # 1. Identify inactive subscribers
    inactive_subs = identify_inactive_subscribers(
        sends_csv_path,
        inactivity_threshold_days=inactivity_threshold_days,
    )

    # 2. Load CLV scores if provided
    clv_scores: dict[str, float] | None = None
    if clv_scores_path is not None and clv_scores_path.exists():
        with open(clv_scores_path) as f:
            clv_data = json.load(f)
        if isinstance(clv_data, dict):
            # Could be {customer_id: score} or {"predictions": [...]}
            if "predictions" in clv_data:
                clv_scores = {p["customer_id"]: p.get("probability_alive", 0.0) for p in clv_data["predictions"]}
            else:
                clv_scores = {k: float(v) for k, v in clv_data.items()}
        elif isinstance(clv_data, list):
            clv_scores = {item.get("customer_id", ""): item.get("probability_alive", 0.0) for item in clv_data}

    # 3. Identify re-engagement triggers
    triggers = identify_re_engagement_triggers(
        inactive_subs,
        clv_scores=clv_scores,
    )
    triggers = prioritize_triggers(triggers)

    # 4. Compute list hygiene score
    hygiene_score = compute_list_hygiene_score(
        sends_csv_path,
        inactivity_threshold_days=inactivity_threshold_days,
    )

    # 5. Summary stats
    summary_stats = {
        "total_subscribers": hygiene_score.total_subscribers,
        "active_subscribers": hygiene_score.active_subscribers,
        "inactive_subscribers": hygiene_score.inactive_subscribers,
        "inactive_rate": round(hygiene_score.inactive_subscribers / hygiene_score.total_subscribers * 100, 2)
        if hygiene_score.total_subscribers > 0
        else 0.0,
        "re_engage_count": sum(1 for s in inactive_subs if s.recommended_action == "re-engage"),
        "suppress_count": sum(1 for s in inactive_subs if s.recommended_action == "suppress"),
        "sunset_count": sum(1 for s in inactive_subs if s.recommended_action == "sunset"),
        "inactivity_threshold_days": inactivity_threshold_days,
    }

    report = ListHealthReport(
        hygiene_score=hygiene_score,
        inactive_subscribers=inactive_subs,
        re_engagement_triggers=triggers,
        summary_stats=summary_stats,
        generated_at=datetime.utcnow().isoformat(),
    )

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        report_dict = {
            "hygiene_score": asdict(report.hygiene_score) if report.hygiene_score else None,
            "inactive_subscribers": [asdict(s) for s in report.inactive_subscribers],
            "re_engagement_triggers": [asdict(t) for t in report.re_engagement_triggers],
            "summary_stats": report.summary_stats,
            "generated_at": report.generated_at,
        }
        output_path.write_text(json.dumps(report_dict, indent=2, default=str))

    return report


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate email list hygiene, inactivity, and re-engagement metrics.")
    parser.add_argument(
        "sends_path",
        nargs="?",
        default=Path("workspace/raw/email_sends.csv"),
        type=Path,
        help="Path to email_sends.csv.",
    )
    parser.add_argument(
        "--output",
        default=Path("workspace/analysis/list_health.json"),
        type=Path,
        help="Path for the generated list health JSON report.",
    )
    args = parser.parse_args()

    report = generate_list_health_report(
        sends_csv_path=args.sends_path,
        output_path=args.output,
    )
    print(
        f"List health report generated: "
        f"hygiene_score={report.hygiene_score.overall_score if report.hygiene_score else 'N/A'}, "
        f"inactive_subscribers={len(report.inactive_subscribers)}"
    )
