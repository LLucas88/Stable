"""Change detection on competitor activity metrics.

Monitors competitor metrics for significant changes using percentage-based
thresholds to normalize across competitors of varying sizes. Produces alerts
for strategy shifts, new keyword targeting, ad copy changes, traffic share
movements, and pricing changes.

Usage:
    python competitive_alerting.py \
        --current-data workspace/analysis/competitive_landscape.json \
        --previous-data workspace/analysis/competitive_landscape_previous.json \
        --output workspace/analysis/competitive_alerts.json
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from pathlib import Path
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)


class AlertLevel(Enum):
    """Severity level for competitive alerts."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AlertCategory(Enum):
    """Category of competitive change detected."""

    NEW_KEYWORDS = "new_keyword_targeting"
    AD_COPY_CHANGE = "ad_copy_change"
    TRAFFIC_SHIFT = "traffic_share_shift"
    PRICING_CHANGE = "pricing_change"
    SOCIAL_SPIKE = "social_activity_spike"
    SOV_SHIFT = "sov_composite_shift"
    OFFER_CHANGE = "offer_change"


@dataclass
class AlertThreshold:
    """Configuration for a single alert threshold."""

    category: AlertCategory
    metric_name: str
    pct_change_threshold: float
    alert_level: AlertLevel
    description: str


@dataclass
class CompetitiveAlert:
    """A single competitive intelligence alert."""

    alert_id: str
    competitor: str
    category: AlertCategory
    alert_level: AlertLevel
    metric_name: str
    previous_value: float
    current_value: float
    pct_change: float
    description: str
    detected_date: str
    data_source: str
    recommended_action: str


@dataclass
class AlertReport:
    """Summary report of all competitive alerts for an analysis period."""

    analysis_date: str
    total_alerts: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    alerts: list[CompetitiveAlert] = field(default_factory=list)
    competitors_with_alerts: list[str] = field(default_factory=list)


# Default alert thresholds per references/competitive_methodology.md.
DEFAULT_THRESHOLDS: list[AlertThreshold] = [
    AlertThreshold(
        category=AlertCategory.NEW_KEYWORDS,
        metric_name="new_keyword_count",
        pct_change_threshold=10.0,  # absolute count, not percentage
        alert_level=AlertLevel.MEDIUM,
        description="New keywords detected in competitor rankings",
    ),
    AlertThreshold(
        category=AlertCategory.AD_COPY_CHANGE,
        metric_name="ad_copy_hash",
        pct_change_threshold=0.0,  # any change triggers
        alert_level=AlertLevel.LOW,
        description="Competitor ad copy or creative change detected",
    ),
    AlertThreshold(
        category=AlertCategory.TRAFFIC_SHIFT,
        metric_name="estimated_traffic_share",
        pct_change_threshold=15.0,
        alert_level=AlertLevel.HIGH,
        description="Significant shift in competitor traffic share",
    ),
    AlertThreshold(
        category=AlertCategory.PRICING_CHANGE,
        metric_name="price_index",
        pct_change_threshold=0.0,  # any change triggers
        alert_level=AlertLevel.HIGH,
        description="Competitor pricing change detected",
    ),
    AlertThreshold(
        category=AlertCategory.SOV_SHIFT,
        metric_name="composite_sov",
        pct_change_threshold=10.0,
        alert_level=AlertLevel.MEDIUM,
        description="Composite share of voice shift beyond threshold",
    ),
    AlertThreshold(
        category=AlertCategory.SOCIAL_SPIKE,
        metric_name="social_engagement_index",
        pct_change_threshold=25.0,
        alert_level=AlertLevel.MEDIUM,
        description="Unusual spike in competitor social activity",
    ),
]

# Mapping of alert categories to recommended actions
_RECOMMENDED_ACTIONS: dict[AlertCategory, str] = {
    AlertCategory.NEW_KEYWORDS: (
        "Review new keyword targets for content gap opportunities. "
        "Assess whether competitor is entering a new topic area."
    ),
    AlertCategory.AD_COPY_CHANGE: (
        "Analyze updated ad copy for new messaging angles, offers, or CTAs. Consider A/B testing counter-messaging."
    ),
    AlertCategory.TRAFFIC_SHIFT: (
        "Investigate traffic source changes. Check for new backlinks, content launches, or paid campaign ramps."
    ),
    AlertCategory.PRICING_CHANGE: (
        "Evaluate pricing competitiveness. Assess impact on win rates and consider strategic pricing response."
    ),
    AlertCategory.SOV_SHIFT: (
        "Analyze which channels are driving the SOV shift. Prioritize investment in channels where share is declining."
    ),
    AlertCategory.SOCIAL_SPIKE: (
        "Monitor for viral content or campaign launches. Identify shareable content themes to replicate."
    ),
    AlertCategory.OFFER_CHANGE: (
        "Review new promotional offers and assess competitive impact. Consider matching or differentiating response."
    ),
}


def calculate_pct_change(
    current_value: float,
    previous_value: float,
) -> float:
    """Calculate percentage change between two values.

    Uses percentage change (not absolute) to normalize across competitors
    of different sizes.

    Args:
        current_value: The current period metric value.
        previous_value: The previous period metric value.

    Returns:
        Percentage change as a float. Returns 0.0 if previous_value is zero.
    """
    if previous_value == 0.0:
        return 0.0
    return ((current_value - previous_value) / abs(previous_value)) * 100.0


def apply_rolling_average(
    time_series: list[float],
    window: int = 7,
) -> list[float]:
    """Apply a rolling average to smooth daily volatility before change detection.

    Args:
        time_series: List of metric values ordered by date.
        window: Rolling window size in days (default 7).

    Returns:
        Smoothed time series of the same length (leading values use
        available window).
    """
    if not time_series:
        return []

    series = pd.Series(time_series)
    # min_periods=1 ensures leading values use whatever data is available
    smoothed = series.rolling(window=window, min_periods=1).mean()
    return smoothed.tolist()


def detect_metric_change(
    competitor: str,
    metric_name: str,
    current_value: float,
    previous_value: float,
    threshold: AlertThreshold,
    data_source: str = "competitive_landscape.json",
) -> CompetitiveAlert | None:
    """Evaluate whether a metric change exceeds the configured threshold.

    Args:
        competitor: Competitor name.
        metric_name: Name of the metric being evaluated.
        current_value: Current period value.
        previous_value: Previous period value.
        threshold: The AlertThreshold configuration to apply.
        data_source: Source of the data for attribution.

    Returns:
        A CompetitiveAlert if the threshold is exceeded, None otherwise.
    """
    pct_change = calculate_pct_change(current_value, previous_value)

    # Check if the change exceeds the threshold
    # For threshold == 0.0, any non-zero change triggers
    if threshold.pct_change_threshold == 0.0:
        if current_value == previous_value:
            return None
    else:
        if abs(pct_change) < threshold.pct_change_threshold:
            return None

    # Determine effective alert level: escalate to CRITICAL if change is
    # more than 2x the threshold
    alert_level = threshold.alert_level
    if threshold.pct_change_threshold > 0 and abs(pct_change) > threshold.pct_change_threshold * 2:
        # Escalate one level
        escalation = {
            AlertLevel.LOW: AlertLevel.MEDIUM,
            AlertLevel.MEDIUM: AlertLevel.HIGH,
            AlertLevel.HIGH: AlertLevel.CRITICAL,
            AlertLevel.CRITICAL: AlertLevel.CRITICAL,
        }
        alert_level = escalation[alert_level]

    direction = "increased" if pct_change > 0 else "decreased"
    description = (
        f"{threshold.description}: {metric_name} {direction} by "
        f"{abs(pct_change):.1f}% (from {previous_value:.4f} to {current_value:.4f})"
    )

    recommended_action = _RECOMMENDED_ACTIONS.get(
        threshold.category,
        "Review the change and assess competitive implications.",
    )

    return CompetitiveAlert(
        alert_id=str(uuid.uuid4())[:12],
        competitor=competitor,
        category=threshold.category,
        alert_level=alert_level,
        metric_name=metric_name,
        previous_value=previous_value,
        current_value=current_value,
        pct_change=round(pct_change, 2),
        description=description,
        detected_date=date.today().isoformat(),
        data_source=data_source,
        recommended_action=recommended_action,
    )


def detect_new_keyword_targeting(
    current_keywords: dict[str, list[str]],
    previous_keywords: dict[str, list[str]],
    threshold: int = 10,
) -> list[CompetitiveAlert]:
    """Detect competitors that have started ranking for significant new keywords.

    Args:
        current_keywords: Mapping of competitor name to current keyword list.
        previous_keywords: Mapping of competitor name to previous keyword list.
        threshold: Minimum new keyword count to trigger an alert.

    Returns:
        List of CompetitiveAlert for competitors exceeding the threshold.
    """
    alerts: list[CompetitiveAlert] = []

    all_competitors = set(current_keywords.keys()) | set(previous_keywords.keys())

    for comp in all_competitors:
        current_set = set(kw.lower().strip() for kw in current_keywords.get(comp, []))
        previous_set = set(kw.lower().strip() for kw in previous_keywords.get(comp, []))

        new_keywords = current_set - previous_set
        new_count = len(new_keywords)

        if new_count >= threshold:
            # Determine severity based on count
            if new_count >= threshold * 5:
                alert_level = AlertLevel.CRITICAL
            elif new_count >= threshold * 3:
                alert_level = AlertLevel.HIGH
            else:
                alert_level = AlertLevel.MEDIUM

            sample_keywords = sorted(new_keywords)[:5]
            sample_str = ", ".join(sample_keywords)

            alerts.append(
                CompetitiveAlert(
                    alert_id=str(uuid.uuid4())[:12],
                    competitor=comp,
                    category=AlertCategory.NEW_KEYWORDS,
                    alert_level=alert_level,
                    metric_name="new_keyword_count",
                    previous_value=float(len(previous_set)),
                    current_value=float(len(current_set)),
                    pct_change=round(
                        calculate_pct_change(float(len(current_set)), float(len(previous_set))),
                        2,
                    ),
                    description=(f"{comp} started ranking for {new_count} new keywords. Sample: {sample_str}"),
                    detected_date=date.today().isoformat(),
                    data_source="keyword_gap.json",
                    recommended_action=_RECOMMENDED_ACTIONS[AlertCategory.NEW_KEYWORDS],
                )
            )

    return alerts


def detect_ad_creative_changes(
    current_creatives: dict[str, list[dict[str, Any]]],
    previous_creatives: dict[str, list[dict[str, Any]]],
) -> list[CompetitiveAlert]:
    """Detect changes in competitor ad copy, offers, or landing pages.

    Args:
        current_creatives: Mapping of competitor name to current ad creative
            records with keys: 'headline', 'description', 'offer', 'url'.
        previous_creatives: Mapping of competitor name to previous ad creative
            records.

    Returns:
        List of CompetitiveAlert for detected creative changes.
    """
    alerts: list[CompetitiveAlert] = []

    def _hash_creative(creative: dict[str, Any]) -> str:
        """Create a stable hash of a creative record."""
        content = "|".join(str(creative.get(k, "")) for k in sorted(["headline", "description", "offer", "url"]))
        return hashlib.md5(content.encode("utf-8")).hexdigest()

    all_competitors = set(current_creatives.keys()) | set(previous_creatives.keys())

    for comp in all_competitors:
        current = current_creatives.get(comp, [])
        previous = previous_creatives.get(comp, [])

        current_hashes = {_hash_creative(c) for c in current}
        previous_hashes = {_hash_creative(p) for p in previous}

        new_creatives = current_hashes - previous_hashes
        removed_creatives = previous_hashes - current_hashes

        if new_creatives or removed_creatives:
            change_count = len(new_creatives) + len(removed_creatives)
            alert_level = AlertLevel.MEDIUM if change_count > 3 else AlertLevel.LOW

            alerts.append(
                CompetitiveAlert(
                    alert_id=str(uuid.uuid4())[:12],
                    competitor=comp,
                    category=AlertCategory.AD_COPY_CHANGE,
                    alert_level=alert_level,
                    metric_name="ad_copy_hash",
                    previous_value=float(len(previous)),
                    current_value=float(len(current)),
                    pct_change=round(
                        calculate_pct_change(float(len(current)), float(len(previous))),
                        2,
                    ),
                    description=(
                        f"{comp}: {len(new_creatives)} new ad creatives detected, {len(removed_creatives)} removed."
                    ),
                    detected_date=date.today().isoformat(),
                    data_source="ad_creative_monitoring",
                    recommended_action=_RECOMMENDED_ACTIONS[AlertCategory.AD_COPY_CHANGE],
                )
            )

    return alerts


def detect_pricing_changes(
    current_pricing: dict[str, dict[str, Any]],
    previous_pricing: dict[str, dict[str, Any]],
) -> list[CompetitiveAlert]:
    """Detect changes in competitor pricing or promotional offers.

    Args:
        current_pricing: Mapping of competitor name to pricing data with
            keys: 'price', 'currency', 'offer_description', 'last_verified'.
        previous_pricing: Mapping of competitor name to previous pricing data.

    Returns:
        List of CompetitiveAlert for detected pricing changes.
    """
    alerts: list[CompetitiveAlert] = []

    all_competitors = set(current_pricing.keys()) | set(previous_pricing.keys())

    for comp in all_competitors:
        current = current_pricing.get(comp, {})
        previous = previous_pricing.get(comp, {})

        if not current and not previous:
            continue

        current_price = float(current.get("price", 0))
        previous_price = float(previous.get("price", 0))

        # Detect price change
        if current_price != previous_price and (current_price > 0 or previous_price > 0):
            pct = calculate_pct_change(current_price, previous_price)
            direction = "increase" if pct > 0 else "decrease"

            alerts.append(
                CompetitiveAlert(
                    alert_id=str(uuid.uuid4())[:12],
                    competitor=comp,
                    category=AlertCategory.PRICING_CHANGE,
                    alert_level=AlertLevel.HIGH,
                    metric_name="price_index",
                    previous_value=previous_price,
                    current_value=current_price,
                    pct_change=round(pct, 2),
                    description=(
                        f"{comp}: Price {direction} detected "
                        f"({previous.get('currency', 'USD')} {previous_price:.2f} -> "
                        f"{current_price:.2f}, {abs(pct):.1f}% change)"
                    ),
                    detected_date=date.today().isoformat(),
                    data_source="pricing_monitoring",
                    recommended_action=_RECOMMENDED_ACTIONS[AlertCategory.PRICING_CHANGE],
                )
            )

        # Detect offer/promotion change
        current_offer = str(current.get("offer_description", "")).strip()
        previous_offer = str(previous.get("offer_description", "")).strip()

        if current_offer != previous_offer and (current_offer or previous_offer):
            alerts.append(
                CompetitiveAlert(
                    alert_id=str(uuid.uuid4())[:12],
                    competitor=comp,
                    category=AlertCategory.OFFER_CHANGE,
                    alert_level=AlertLevel.MEDIUM,
                    metric_name="offer_description",
                    previous_value=0.0,
                    current_value=1.0,
                    pct_change=100.0,
                    description=(
                        f"{comp}: Promotional offer changed. "
                        f"Previous: '{previous_offer or 'none'}'. "
                        f"Current: '{current_offer or 'none'}'."
                    ),
                    detected_date=date.today().isoformat(),
                    data_source="pricing_monitoring",
                    recommended_action=_RECOMMENDED_ACTIONS[AlertCategory.OFFER_CHANGE],
                )
            )

    return alerts


def load_landscape_data(filepath: Path) -> dict[str, Any]:
    """Load competitive landscape data from JSON.

    Args:
        filepath: Path to competitive_landscape.json.

    Returns:
        Parsed landscape data dictionary.
    """
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        logger.warning(
            "Landscape data not found at %s. Returning empty data (graceful degradation).",
            filepath,
        )
        return {}

    # Normalize structure: if it's a list, index by competitor name
    if isinstance(data, list):
        indexed: dict[str, Any] = {}
        for entry in data:
            comp = entry.get("competitor", entry.get("domain", "unknown"))
            indexed[comp] = entry
        return {"competitors": indexed, "_raw": data}

    return data


def run_alerting(
    current_data_path: Path,
    previous_data_path: Path,
    output_path: Path,
    thresholds: list[AlertThreshold] | None = None,
) -> AlertReport:
    """Orchestrate competitive alerting across all metrics and competitors.

    Args:
        current_data_path: Path to current competitive_landscape.json.
        previous_data_path: Path to previous period competitive_landscape.json.
        output_path: Path for competitive_alerts.json output.
        thresholds: Optional custom alert thresholds. Uses DEFAULT_THRESHOLDS
            if not provided.

    Returns:
        AlertReport summarizing all detected changes.
    """
    if thresholds is None:
        thresholds = DEFAULT_THRESHOLDS

    current_data = load_landscape_data(current_data_path)
    previous_data = load_landscape_data(previous_data_path)

    all_alerts: list[CompetitiveAlert] = []

    # Get competitor entries
    current_competitors = current_data.get("competitors", current_data)
    previous_competitors = previous_data.get("competitors", previous_data)

    # Remove non-competitor meta keys
    meta_keys = {"_raw", "methodology_notes", "analysis_date"}
    if isinstance(current_competitors, dict):
        current_competitors = {k: v for k, v in current_competitors.items() if k not in meta_keys}
    if isinstance(previous_competitors, dict):
        previous_competitors = {k: v for k, v in previous_competitors.items() if k not in meta_keys}

    all_comp_names = set()
    if isinstance(current_competitors, dict):
        all_comp_names |= set(current_competitors.keys())
    if isinstance(previous_competitors, dict):
        all_comp_names |= set(previous_competitors.keys())

    # Build threshold lookup by metric name
    threshold_by_metric: dict[str, AlertThreshold] = {t.metric_name: t for t in thresholds}

    # Metrics to check on each competitor record
    sov_metrics = [
        "composite_sov",
        "organic_sov",
        "paid_sov",
        "social_sov",
        "earned_sov",
        "estimated_traffic_share",
        "social_engagement_index",
    ]

    for comp in all_comp_names:
        current_entry = current_competitors.get(comp, {}) if isinstance(current_competitors, dict) else {}
        previous_entry = previous_competitors.get(comp, {}) if isinstance(previous_competitors, dict) else {}

        if not isinstance(current_entry, dict) or not isinstance(previous_entry, dict):
            continue

        for metric in sov_metrics:
            curr_val = float(current_entry.get(metric, 0))
            prev_val = float(previous_entry.get(metric, 0))

            if curr_val == 0 and prev_val == 0:
                continue

            # Find matching threshold
            threshold = threshold_by_metric.get(metric)
            if threshold is None:
                # Use SOV shift threshold as default for SOV-related metrics
                threshold = threshold_by_metric.get("composite_sov")
            if threshold is None:
                continue

            alert = detect_metric_change(
                competitor=comp,
                metric_name=metric,
                current_value=curr_val,
                previous_value=prev_val,
                threshold=threshold,
                data_source="competitive_landscape.json",
            )
            if alert is not None:
                all_alerts.append(alert)

    # Detect keyword targeting changes if keyword data is present
    current_kw: dict[str, list[str]] = {}
    previous_kw: dict[str, list[str]] = {}
    for comp in all_comp_names:
        c_entry = current_competitors.get(comp, {}) if isinstance(current_competitors, dict) else {}
        p_entry = previous_competitors.get(comp, {}) if isinstance(previous_competitors, dict) else {}
        if isinstance(c_entry, dict) and "keywords" in c_entry:
            kw_data = c_entry["keywords"]
            if isinstance(kw_data, list):
                current_kw[comp] = [(kw.get("keyword", kw) if isinstance(kw, dict) else str(kw)) for kw in kw_data]
        if isinstance(p_entry, dict) and "keywords" in p_entry:
            kw_data = p_entry["keywords"]
            if isinstance(kw_data, list):
                previous_kw[comp] = [(kw.get("keyword", kw) if isinstance(kw, dict) else str(kw)) for kw in kw_data]

    if current_kw or previous_kw:
        kw_alerts = detect_new_keyword_targeting(current_kw, previous_kw)
        all_alerts.extend(kw_alerts)

    # Detect ad creative changes if present
    current_creatives: dict[str, list[dict[str, Any]]] = {}
    previous_creatives: dict[str, list[dict[str, Any]]] = {}
    for comp in all_comp_names:
        c_entry = current_competitors.get(comp, {}) if isinstance(current_competitors, dict) else {}
        p_entry = previous_competitors.get(comp, {}) if isinstance(previous_competitors, dict) else {}
        if isinstance(c_entry, dict) and "ad_creatives" in c_entry:
            current_creatives[comp] = c_entry["ad_creatives"]
        if isinstance(p_entry, dict) and "ad_creatives" in p_entry:
            previous_creatives[comp] = p_entry["ad_creatives"]

    if current_creatives or previous_creatives:
        ad_alerts = detect_ad_creative_changes(current_creatives, previous_creatives)
        all_alerts.extend(ad_alerts)

    # Detect pricing changes if present
    current_pricing: dict[str, dict[str, Any]] = {}
    previous_pricing: dict[str, dict[str, Any]] = {}
    for comp in all_comp_names:
        c_entry = current_competitors.get(comp, {}) if isinstance(current_competitors, dict) else {}
        p_entry = previous_competitors.get(comp, {}) if isinstance(previous_competitors, dict) else {}
        if isinstance(c_entry, dict) and "pricing" in c_entry:
            current_pricing[comp] = c_entry["pricing"]
        if isinstance(p_entry, dict) and "pricing" in p_entry:
            previous_pricing[comp] = p_entry["pricing"]

    if current_pricing or previous_pricing:
        pricing_alerts = detect_pricing_changes(current_pricing, previous_pricing)
        all_alerts.extend(pricing_alerts)

    # Sort alerts by severity (critical first), then by absolute pct_change
    severity_order = {
        AlertLevel.CRITICAL: 0,
        AlertLevel.HIGH: 1,
        AlertLevel.MEDIUM: 2,
        AlertLevel.LOW: 3,
    }
    all_alerts.sort(key=lambda a: (severity_order.get(a.alert_level, 99), -abs(a.pct_change)))

    # Build report
    competitors_with_alerts = sorted(set(a.competitor for a in all_alerts))
    report = AlertReport(
        analysis_date=date.today().isoformat(),
        total_alerts=len(all_alerts),
        critical_count=sum(1 for a in all_alerts if a.alert_level == AlertLevel.CRITICAL),
        high_count=sum(1 for a in all_alerts if a.alert_level == AlertLevel.HIGH),
        medium_count=sum(1 for a in all_alerts if a.alert_level == AlertLevel.MEDIUM),
        low_count=sum(1 for a in all_alerts if a.alert_level == AlertLevel.LOW),
        alerts=all_alerts,
        competitors_with_alerts=competitors_with_alerts,
    )

    export_alerts(report, output_path)
    return report


def export_alerts(
    report: AlertReport,
    output_path: Path,
) -> None:
    """Export alert report to JSON.

    Args:
        report: The AlertReport to serialize.
        output_path: Destination file path.
    """
    alerts_data = []
    for a in report.alerts:
        alerts_data.append(
            {
                "alert_id": a.alert_id,
                "competitor": a.competitor,
                "category": a.category.value,
                "alert_level": a.alert_level.value,
                "metric_name": a.metric_name,
                "previous_value": a.previous_value,
                "current_value": a.current_value,
                "pct_change": a.pct_change,
                "description": a.description,
                "detected_date": a.detected_date,
                "data_source": a.data_source,
                "recommended_action": a.recommended_action,
            }
        )

    output = {
        "analysis_date": report.analysis_date,
        "total_alerts": report.total_alerts,
        "critical_count": report.critical_count,
        "high_count": report.high_count,
        "medium_count": report.medium_count,
        "low_count": report.low_count,
        "competitors_with_alerts": report.competitors_with_alerts,
        "alerts": alerts_data,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    logger.info("Exported %d alerts to %s", report.total_alerts, output_path)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Competitive change detection and alerting")
    parser.add_argument(
        "--current-data",
        type=Path,
        required=True,
        help="Path to current competitive_landscape.json",
    )
    parser.add_argument(
        "--previous-data",
        type=Path,
        required=True,
        help="Path to previous period competitive_landscape.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("workspace/analysis/competitive_alerts.json"),
        help="Output path for competitive alerts JSON",
    )
    args = parser.parse_args()

    report = run_alerting(
        current_data_path=args.current_data,
        previous_data_path=args.previous_data,
        output_path=args.output,
    )
    logger.info(
        "Alerting complete: %d alerts (%d critical, %d high)",
        report.total_alerts,
        report.critical_count,
        report.high_count,
    )
