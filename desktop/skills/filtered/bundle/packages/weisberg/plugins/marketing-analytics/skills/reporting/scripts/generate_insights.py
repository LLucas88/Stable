"""Statistical pattern detection and natural language insight templating."""

from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass, field, asdict
from datetime import date
from pathlib import Path
from typing import Any, Literal

logger = logging.getLogger(__name__)

InsightCategory = Literal["trend", "anomaly", "comparison", "milestone", "correlation", "forecast"]
InsightSentiment = Literal["positive", "negative", "neutral"]


@dataclass
class Insight:
    pattern_id: str
    category: InsightCategory
    sentiment: InsightSentiment
    metric_name: str
    magnitude: float
    priority_score: float
    narrative: str
    date_range_start: date | None = None
    date_range_end: date | None = None
    source_skill: str | None = None
    supporting_data: dict[str, Any] = field(default_factory=dict)


def _numeric_series(data: list[dict[str, Any]], metric: str) -> list[float]:
    values = []
    for row in data:
        try:
            if row.get(metric) is not None:
                values.append(float(row.get(metric)))
        except (TypeError, ValueError):
            continue
    return values


def detect_trends(
    data: list[dict[str, Any]],
    metric_cols: list[str],
    date_col: str = "date",
    min_consecutive_periods: int = 3,
    min_cumulative_change_pct: float = 5.0,
) -> list[dict[str, Any]]:
    findings = []
    ordered = sorted(data, key=lambda row: str(row.get(date_col, "")))
    for metric in metric_cols:
        values = _numeric_series(ordered, metric)
        if len(values) < min_consecutive_periods:
            continue
        deltas = [values[index] - values[index - 1] for index in range(1, len(values))]
        direction = None
        streak = 1
        streak_start = 0
        for index, delta in enumerate(deltas, start=1):
            current_direction = 1 if delta > 0 else -1 if delta < 0 else 0
            if current_direction == direction and current_direction != 0:
                streak += 1
            else:
                direction = current_direction
                streak = 1
                streak_start = index - 1
            if streak >= min_consecutive_periods and direction != 0:
                start_value = values[streak_start]
                end_value = values[index]
                change_pct = ((end_value - start_value) / start_value * 100) if start_value else 0.0
                if abs(change_pct) >= min_cumulative_change_pct:
                    findings.append(
                        {
                            "pattern_id": "trend_sustained_increase" if direction > 0 else "trend_sustained_decrease",
                            "metric_name": metric,
                            "consecutive_periods": streak,
                            "cumulative_change_pct": change_pct,
                            "start_value": start_value,
                            "end_value": end_value,
                            "start_date": ordered[streak_start].get(date_col),
                            "end_date": ordered[index].get(date_col),
                            "category": "trend",
                        }
                    )
                    break
    return findings


def detect_anomalies(
    data: list[dict[str, Any]],
    metric_cols: list[str],
    date_col: str = "date",
    z_score_threshold: float = 2.0,
    lookback_periods: int = 12,
) -> list[dict[str, Any]]:
    findings = []
    ordered = sorted(data, key=lambda row: str(row.get(date_col, "")))
    for metric in metric_cols:
        for index in range(lookback_periods, len(ordered)):
            window = _numeric_series(ordered[index - lookback_periods : index], metric)
            if len(window) < 3:
                continue
            current = ordered[index].get(metric)
            if current is None:
                continue
            current = float(current)
            mean = sum(window) / len(window)
            std = math.sqrt(sum((value - mean) ** 2 for value in window) / len(window)) or 1.0
            z_score = (current - mean) / std
            if abs(z_score) >= z_score_threshold:
                findings.append(
                    {
                        "pattern_id": "anomaly_statistical_outlier",
                        "metric_name": metric,
                        "current_value": current,
                        "trailing_mean": mean,
                        "z_score": z_score,
                        "date": ordered[index].get(date_col),
                        "category": "anomaly",
                    }
                )
    return findings


def detect_comparisons(
    data: list[dict[str, Any]],
    comparison_data: list[dict[str, Any]],
    metric_cols: list[str],
    targets: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    findings = []
    targets = targets or {}
    latest_current = data[-1] if data else {}
    latest_previous = comparison_data[-1] if comparison_data else {}
    for metric in metric_cols:
        if metric not in latest_current or metric not in latest_previous:
            continue
        current_value = float(latest_current[metric])
        previous_value = float(latest_previous[metric])
        change_pct = ((current_value - previous_value) / previous_value * 100) if previous_value else 0.0
        finding = {
            "pattern_id": "comparison_period_over_period",
            "metric_name": metric,
            "current_value": current_value,
            "previous_value": previous_value,
            "change_pct": change_pct,
            "category": "comparison",
        }
        if metric in targets:
            finding["attainment_pct"] = (current_value / targets[metric] * 100) if targets[metric] else 0.0
        findings.append(finding)
    return findings


def detect_milestones(
    data: list[dict[str, Any]],
    metric_cols: list[str],
    historical_records: dict[str, dict[str, Any]] | None = None,
    thresholds: dict[str, list[float]] | None = None,
) -> list[dict[str, Any]]:
    findings = []
    historical_records = historical_records or {}
    thresholds = thresholds or {}
    for metric in metric_cols:
        values = _numeric_series(data, metric)
        if not values:
            continue
        current_value = values[-1]
        if current_value >= max(values):
            findings.append(
                {
                    "pattern_id": "milestone_record_high",
                    "metric_name": metric,
                    "value": current_value,
                    "category": "milestone",
                }
            )
        if current_value <= min(values):
            findings.append(
                {
                    "pattern_id": "milestone_record_low",
                    "metric_name": metric,
                    "value": current_value,
                    "category": "milestone",
                }
            )
        for threshold in thresholds.get(metric, []):
            if current_value >= threshold:
                findings.append(
                    {
                        "pattern_id": "milestone_threshold_crossed",
                        "metric_name": metric,
                        "value": current_value,
                        "threshold": threshold,
                        "category": "milestone",
                    }
                )
        if metric in historical_records and current_value > float(
            historical_records[metric].get("value", float("-inf"))
        ):
            findings.append(
                {
                    "pattern_id": "milestone_historical_record",
                    "metric_name": metric,
                    "value": current_value,
                    "category": "milestone",
                }
            )
    return findings


def detect_correlations(
    data: list[dict[str, Any]],
    metric_cols: list[str],
    min_correlation: float = 0.7,
    min_data_points: int = 10,
) -> list[dict[str, Any]]:
    findings = []
    for index, metric_a in enumerate(metric_cols):
        values_a = _numeric_series(data, metric_a)
        for metric_b in metric_cols[index + 1 :]:
            values_b = _numeric_series(data, metric_b)
            overlap = min(len(values_a), len(values_b))
            if overlap < min_data_points:
                continue
            paired_a = values_a[-overlap:]
            paired_b = values_b[-overlap:]
            mean_a = sum(paired_a) / overlap
            mean_b = sum(paired_b) / overlap
            numerator = sum((a - mean_a) * (b - mean_b) for a, b in zip(paired_a, paired_b))
            denominator = (
                math.sqrt(sum((a - mean_a) ** 2 for a in paired_a) * sum((b - mean_b) ** 2 for b in paired_b)) or 1.0
            )
            correlation = numerator / denominator
            if abs(correlation) >= min_correlation:
                findings.append(
                    {
                        "pattern_id": "correlation_metric_pair",
                        "metric_a": metric_a,
                        "metric_b": metric_b,
                        "correlation": correlation,
                        "lookback_periods": overlap,
                        "category": "correlation",
                    }
                )
    return findings


def compute_projections(
    data: list[dict[str, Any]],
    metric_cols: list[str],
    targets: dict[str, float] | None = None,
    target_date: date | None = None,
    date_col: str = "date",
) -> list[dict[str, Any]]:
    del date_col
    targets = targets or {}
    findings = []
    horizon = 7
    for metric in metric_cols:
        values = _numeric_series(data, metric)
        if len(values) < 3:
            continue
        x_values = list(range(len(values)))
        mean_x = sum(x_values) / len(x_values)
        mean_y = sum(values) / len(values)
        denominator = sum((x - mean_x) ** 2 for x in x_values) or 1.0
        slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(x_values, values)) / denominator
        intercept = mean_y - slope * mean_x
        projected = intercept + slope * (len(values) - 1 + horizon)
        findings.append(
            {
                "pattern_id": "forecast_linear_projection",
                "metric_name": metric,
                "projected_value": projected,
                "slope": slope,
                "target_value": targets.get(metric),
                "target_date": (target_date or date.today()).isoformat(),
                "category": "forecast",
            }
        )
    return findings


def detect_all_patterns(
    unified_dataset: dict[str, Any],
    comparison_dataset: dict[str, Any] | None = None,
    targets: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    data = unified_dataset.get("data", [])
    metric_cols = [
        metric["name"] for metric in unified_dataset.get("metrics", []) if metric.get("data_type") == "numeric"
    ]
    findings = []
    findings.extend(detect_trends(data, metric_cols))
    findings.extend(detect_anomalies(data, metric_cols))
    if comparison_dataset:
        findings.extend(detect_comparisons(data, comparison_dataset.get("data", []), metric_cols, targets=targets))
    findings.extend(detect_milestones(data, metric_cols))
    findings.extend(detect_correlations(data, metric_cols))
    findings.extend(compute_projections(data, metric_cols, targets=targets))
    return findings


def rank_by_business_impact(
    findings: list[dict[str, Any]],
    business_weights: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    business_weights = business_weights or {}
    ranked = []
    for finding in findings:
        metric_name = finding.get("metric_name") or finding.get("metric_a") or "unknown"
        base_magnitude = abs(
            float(
                finding.get(
                    "cumulative_change_pct",
                    finding.get(
                        "change_pct",
                        finding.get("z_score", finding.get("correlation", finding.get("projected_value", 1.0))),
                    ),
                )
            )
        )
        priority = base_magnitude * business_weights.get(metric_name, 1.0)
        enriched = dict(finding)
        enriched["priority_score"] = priority
        ranked.append(enriched)
    return sorted(ranked, key=lambda item: item["priority_score"], reverse=True)


def render_insights_to_text(
    ranked_findings: list[dict[str, Any]],
    pattern_library_path: str | Path | None = None,
    max_insights: int = 10,
) -> list[Insight]:
    del pattern_library_path
    rendered: list[Insight] = []
    for finding in ranked_findings[:max_insights]:
        category = finding.get("category", "trend")
        metric_name = finding.get("metric_name", f"{finding.get('metric_a')} vs {finding.get('metric_b')}")
        magnitude = float(
            finding.get(
                "cumulative_change_pct",
                finding.get("change_pct", finding.get("z_score", finding.get("correlation", 0.0))),
            )
        )
        if category == "trend":
            narrative = f"{metric_name} shows a sustained trend of {magnitude:.1f}%."
        elif category == "anomaly":
            narrative = f"{metric_name} produced an outlier with z-score {finding.get('z_score', 0):.2f}."
        elif category == "comparison":
            narrative = f"{metric_name} changed {magnitude:.1f}% versus the comparison period."
        elif category == "milestone":
            narrative = f"{metric_name} hit a notable milestone at {finding.get('value')}."
        elif category == "correlation":
            narrative = f"{finding.get('metric_a')} and {finding.get('metric_b')} are strongly correlated ({finding.get('correlation', 0):.2f})."
        else:
            narrative = f"{metric_name} is projected to move to {finding.get('projected_value'):.2f}."
        rendered.append(
            Insight(
                pattern_id=finding["pattern_id"],
                category=category,
                sentiment="positive" if magnitude > 0 else "negative" if magnitude < 0 else "neutral",
                metric_name=metric_name,
                magnitude=magnitude,
                priority_score=float(finding["priority_score"]),
                narrative=narrative,
                source_skill=finding.get("source_skill"),
                supporting_data=finding,
            )
        )
    return rendered


def compose_executive_summary(
    insights: list[Insight],
    max_sentences: int = 5,
) -> str:
    if not insights:
        return "No material insights were detected in the current reporting window."
    sentences = [insight.narrative for insight in insights[:max_sentences]]
    return " ".join(sentences)


def generate_insight_list(
    insights: list[Insight],
    format: Literal["html", "markdown", "plain"] = "html",
) -> str:
    if format == "markdown":
        return "\n".join(f"- {insight.narrative}" for insight in insights)
    if format == "plain":
        return "\n".join(f"{index}. {insight.narrative}" for index, insight in enumerate(insights, start=1))
    return "<ul>" + "".join(f"<li>{insight.narrative}</li>" for insight in insights) + "</ul>"


def run_insight_pipeline(
    unified_dataset: dict[str, Any],
    comparison_dataset: dict[str, Any] | None = None,
    targets: dict[str, float] | None = None,
    output_dir: str | Path | None = None,
    max_insights: int = 10,
) -> dict[str, Any]:
    findings = detect_all_patterns(unified_dataset, comparison_dataset=comparison_dataset, targets=targets)
    ranked = rank_by_business_impact(findings)
    insights = render_insights_to_text(ranked, max_insights=max_insights)
    payload = {
        "executive_summary": compose_executive_summary(insights),
        "insights": [asdict(insight) for insight in insights],
        "insight_list_html": generate_insight_list(insights, format="html"),
        "insight_list_markdown": generate_insight_list(insights, format="markdown"),
        "raw_findings_count": len(findings),
    }
    if output_dir:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "insights.json").write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    return payload
