"""Strategic scorecard aggregation for competitive intelligence.

Aggregates all competitive signals (keyword gaps, share of voice, ad creative
activity, pricing intelligence, alerts) into a per-competitor strategic
scorecard. Produces trajectory analysis and data-grounded strategic
recommendations.

Usage:
    python competitive_synthesis.py \
        --landscape workspace/analysis/competitive_landscape.json \
        --keyword-gaps workspace/analysis/keyword_gap.json \
        --alerts workspace/analysis/competitive_alerts.json \
        --output workspace/reports/competitive_briefing.html
"""

from __future__ import annotations

import html
import json
import logging
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
from scipy import stats

logger = logging.getLogger(__name__)


class Trajectory(str):
    """Competitor investment trajectory classification."""

    ACCELERATING = "accelerating"
    STABLE = "stable"
    DECELERATING = "decelerating"


@dataclass
class DimensionScore:
    """Score for a single competitive dimension."""

    dimension: str
    raw_value: float
    normalized_score: float  # 0-100
    weight: float
    contributing_metrics: list[str] = field(default_factory=list)
    data_sources: list[str] = field(default_factory=list)


@dataclass
class CompetitiveScorecard:
    """Full strategic scorecard for one competitor."""

    competitor: str
    competitor_domain: str
    analysis_date: str
    search_strength: DimensionScore | None = None
    paid_intensity: DimensionScore | None = None
    social_presence: DimensionScore | None = None
    content_quality: DimensionScore | None = None
    market_positioning: DimensionScore | None = None
    composite_score: float = 0.0
    trajectory: str = Trajectory.STABLE
    trajectory_slope: float = 0.0
    key_strengths: list[str] = field(default_factory=list)
    key_vulnerabilities: list[str] = field(default_factory=list)


@dataclass
class StrategicRecommendation:
    """A data-grounded strategic recommendation."""

    recommendation: str
    rationale: str
    supporting_data_points: list[str]
    estimated_impact: str  # "high", "medium", "low"
    implementation_effort: str  # "high", "medium", "low"
    priority_score: float
    related_competitors: list[str]


@dataclass
class CompetitiveBriefing:
    """Complete competitive intelligence briefing."""

    analysis_date: str
    executive_summary: str
    scorecards: list[CompetitiveScorecard] = field(default_factory=list)
    recommendations: list[StrategicRecommendation] = field(default_factory=list)
    market_trends: list[str] = field(default_factory=list)
    methodology_notes: list[str] = field(default_factory=list)


# Default dimension weights per references/competitive_methodology.md.
DEFAULT_DIMENSION_WEIGHTS: dict[str, float] = {
    "search_strength": 0.25,
    "paid_intensity": 0.20,
    "social_presence": 0.20,
    "content_quality": 0.20,
    "market_positioning": 0.15,
}


def normalize_score(
    raw_value: float,
    min_value: float,
    max_value: float,
) -> float:
    """Normalize a raw metric to a 0-100 scale using min-max scaling.

    Args:
        raw_value: The raw metric value.
        min_value: Minimum value across the competitive set.
        max_value: Maximum value across the competitive set.

    Returns:
        Normalized score between 0 and 100. Returns 0 if min equals max.
    """
    if max_value == min_value:
        return 0.0
    normalized = (raw_value - min_value) / (max_value - min_value) * 100.0
    return max(0.0, min(100.0, normalized))


def _get_competitor_metric(
    data: dict[str, Any],
    competitor: str,
    metric: str,
    default: float = 0.0,
) -> float:
    """Safely extract a metric for a competitor from landscape data."""
    # Try direct competitor key
    comp_data = data.get(competitor, {})
    if isinstance(comp_data, dict) and metric in comp_data:
        try:
            return float(comp_data[metric])
        except (ValueError, TypeError):
            pass

    # Try competitors sub-key
    competitors_section = data.get("competitors", {})
    if isinstance(competitors_section, dict):
        comp_data = competitors_section.get(competitor, {})
        if isinstance(comp_data, dict) and metric in comp_data:
            try:
                return float(comp_data[metric])
            except (ValueError, TypeError):
                pass

    # Try _raw list format
    raw_list = data.get("_raw", [])
    if isinstance(raw_list, list):
        for entry in raw_list:
            if isinstance(entry, dict) and entry.get("competitor") == competitor:
                if metric in entry:
                    try:
                        return float(entry[metric])
                    except (ValueError, TypeError):
                        pass

    return default


def _collect_raw_values(
    data: dict[str, Any],
    all_competitors: list[str],
    metric: str,
    default: float = 0.0,
) -> dict[str, float]:
    """Collect raw values for a metric across all competitors."""
    return {comp: _get_competitor_metric(data, comp, metric, default) for comp in all_competitors}


def score_search_strength(
    competitor: str,
    landscape_data: dict[str, Any],
    keyword_gap_data: dict[str, Any],
    all_competitors: list[str],
) -> DimensionScore:
    """Score a competitor's search presence strength.

    Inputs: organic SOV, keyword overlap count, content velocity.

    Args:
        competitor: Competitor name.
        landscape_data: Parsed competitive_landscape.json.
        keyword_gap_data: Parsed keyword_gap.json.
        all_competitors: Full list of competitors for normalization.

    Returns:
        DimensionScore for search strength.
    """
    # Gather organic SOV values
    organic_values = _collect_raw_values(landscape_data, all_competitors, "organic_sov")

    # Gather keyword counts from gap data
    keyword_counts: dict[str, float] = {}
    gap_entries = keyword_gap_data if isinstance(keyword_gap_data, list) else keyword_gap_data.get("data", [])
    if isinstance(gap_entries, list):
        for entry in gap_entries:
            if isinstance(entry, dict):
                comp_name = entry.get("competitor", "")
                keyword_counts[comp_name] = float(entry.get("total_keywords_analyzed", 0))

    # Content velocity (keywords with recent ranking changes)
    content_velocity = _collect_raw_values(landscape_data, all_competitors, "content_velocity")

    # Build composite raw value: weighted combination
    raw_values: dict[str, float] = {}
    for comp in all_competitors:
        org_sov = organic_values.get(comp, 0.0)
        kw_count = keyword_counts.get(comp, 0.0)
        velocity = content_velocity.get(comp, 0.0)
        # Normalize keyword count to roughly same scale as SOV
        kw_norm = kw_count / 1000.0 if kw_count > 0 else 0.0
        raw_values[comp] = org_sov * 0.5 + kw_norm * 0.3 + velocity * 0.2

    all_raw = list(raw_values.values())
    min_val = min(all_raw) if all_raw else 0.0
    max_val = max(all_raw) if all_raw else 0.0

    raw = raw_values.get(competitor, 0.0)

    return DimensionScore(
        dimension="search_strength",
        raw_value=raw,
        normalized_score=normalize_score(raw, min_val, max_val),
        weight=DEFAULT_DIMENSION_WEIGHTS["search_strength"],
        contributing_metrics=["organic_sov", "keyword_count", "content_velocity"],
        data_sources=["competitive_landscape.json", "keyword_gap.json"],
    )


def score_paid_intensity(
    competitor: str,
    landscape_data: dict[str, Any],
    all_competitors: list[str],
) -> DimensionScore:
    """Score a competitor's paid media intensity.

    Inputs: paid SOV, ad creative freshness, offer frequency.

    Args:
        competitor: Competitor name.
        landscape_data: Parsed competitive_landscape.json.
        all_competitors: Full list of competitors for normalization.

    Returns:
        DimensionScore for paid intensity.
    """
    paid_values = _collect_raw_values(landscape_data, all_competitors, "paid_sov")
    creative_freshness = _collect_raw_values(landscape_data, all_competitors, "creative_change_count")
    offer_counts = _collect_raw_values(landscape_data, all_competitors, "offer_count")

    raw_values: dict[str, float] = {}
    for comp in all_competitors:
        p_sov = paid_values.get(comp, 0.0)
        fresh = creative_freshness.get(comp, 0.0)
        offers = offer_counts.get(comp, 0.0)
        fresh_norm = fresh / 10.0 if fresh > 0 else 0.0
        offer_norm = offers / 10.0 if offers > 0 else 0.0
        raw_values[comp] = p_sov * 0.5 + fresh_norm * 0.3 + offer_norm * 0.2

    all_raw = list(raw_values.values())
    min_val = min(all_raw) if all_raw else 0.0
    max_val = max(all_raw) if all_raw else 0.0
    raw = raw_values.get(competitor, 0.0)

    return DimensionScore(
        dimension="paid_intensity",
        raw_value=raw,
        normalized_score=normalize_score(raw, min_val, max_val),
        weight=DEFAULT_DIMENSION_WEIGHTS["paid_intensity"],
        contributing_metrics=["paid_sov", "creative_change_count", "offer_count"],
        data_sources=["competitive_landscape.json"],
    )


def score_social_presence(
    competitor: str,
    landscape_data: dict[str, Any],
    all_competitors: list[str],
) -> DimensionScore:
    """Score a competitor's social media presence.

    Inputs: social SOV, audience growth rate, engagement quality.

    Args:
        competitor: Competitor name.
        landscape_data: Parsed competitive_landscape.json.
        all_competitors: Full list of competitors for normalization.

    Returns:
        DimensionScore for social presence.
    """
    social_values = _collect_raw_values(landscape_data, all_competitors, "social_sov")
    growth_rates = _collect_raw_values(landscape_data, all_competitors, "audience_growth_rate")
    engagement_quality = _collect_raw_values(landscape_data, all_competitors, "engagement_quality")

    raw_values: dict[str, float] = {}
    for comp in all_competitors:
        s_sov = social_values.get(comp, 0.0)
        growth = growth_rates.get(comp, 0.0)
        quality = engagement_quality.get(comp, 0.0)
        raw_values[comp] = s_sov * 0.4 + growth * 0.3 + quality * 0.3

    all_raw = list(raw_values.values())
    min_val = min(all_raw) if all_raw else 0.0
    max_val = max(all_raw) if all_raw else 0.0
    raw = raw_values.get(competitor, 0.0)

    return DimensionScore(
        dimension="social_presence",
        raw_value=raw,
        normalized_score=normalize_score(raw, min_val, max_val),
        weight=DEFAULT_DIMENSION_WEIGHTS["social_presence"],
        contributing_metrics=["social_sov", "audience_growth_rate", "engagement_quality"],
        data_sources=["competitive_landscape.json"],
    )


def score_content_quality(
    competitor: str,
    landscape_data: dict[str, Any],
    all_competitors: list[str],
) -> DimensionScore:
    """Score a competitor's content quality indicators.

    Inputs: backlink profile strength, domain authority delta, content depth.

    Args:
        competitor: Competitor name.
        landscape_data: Parsed competitive_landscape.json.
        all_competitors: Full list of competitors for normalization.

    Returns:
        DimensionScore for content quality.
    """
    backlinks = _collect_raw_values(landscape_data, all_competitors, "backlinks")
    domain_authority = _collect_raw_values(landscape_data, all_competitors, "domain_authority")
    content_depth = _collect_raw_values(landscape_data, all_competitors, "content_depth")

    raw_values: dict[str, float] = {}
    for comp in all_competitors:
        bl = backlinks.get(comp, 0.0)
        da = domain_authority.get(comp, 0.0)
        cd = content_depth.get(comp, 0.0)
        # Normalize backlinks to comparable scale (log scale for large variance)
        bl_norm = np.log1p(bl) / 10.0
        da_norm = da / 100.0
        cd_norm = cd / 100.0 if cd > 1.0 else cd
        raw_values[comp] = bl_norm * 0.4 + da_norm * 0.4 + cd_norm * 0.2

    all_raw = list(raw_values.values())
    min_val = min(all_raw) if all_raw else 0.0
    max_val = max(all_raw) if all_raw else 0.0
    raw = raw_values.get(competitor, 0.0)

    return DimensionScore(
        dimension="content_quality",
        raw_value=raw,
        normalized_score=normalize_score(raw, min_val, max_val),
        weight=DEFAULT_DIMENSION_WEIGHTS["content_quality"],
        contributing_metrics=["backlinks", "domain_authority", "content_depth"],
        data_sources=["competitive_landscape.json"],
    )


def score_market_positioning(
    competitor: str,
    landscape_data: dict[str, Any],
    all_competitors: list[str],
) -> DimensionScore:
    """Score a competitor's market positioning.

    Inputs: pricing position, offer differentiation, brand mention volume.

    Args:
        competitor: Competitor name.
        landscape_data: Parsed competitive_landscape.json.
        all_competitors: Full list of competitors for normalization.

    Returns:
        DimensionScore for market positioning.
    """
    price_index = _collect_raw_values(landscape_data, all_competitors, "price_index")
    offer_count = _collect_raw_values(landscape_data, all_competitors, "offer_count")
    brand_mentions = _collect_raw_values(landscape_data, all_competitors, "brand_mentions")

    raw_values: dict[str, float] = {}
    for comp in all_competitors:
        pi = price_index.get(comp, 0.0)
        oc = offer_count.get(comp, 0.0)
        bm = brand_mentions.get(comp, 0.0)
        # Normalize brand mentions (log scale)
        bm_norm = np.log1p(bm) / 10.0
        oc_norm = oc / 10.0 if oc > 0 else 0.0
        # Price index: higher could mean premium positioning -- keep as-is
        pi_norm = pi / 100.0 if pi > 1.0 else pi
        raw_values[comp] = bm_norm * 0.4 + oc_norm * 0.3 + pi_norm * 0.3

    all_raw = list(raw_values.values())
    min_val = min(all_raw) if all_raw else 0.0
    max_val = max(all_raw) if all_raw else 0.0
    raw = raw_values.get(competitor, 0.0)

    return DimensionScore(
        dimension="market_positioning",
        raw_value=raw,
        normalized_score=normalize_score(raw, min_val, max_val),
        weight=DEFAULT_DIMENSION_WEIGHTS["market_positioning"],
        contributing_metrics=["price_index", "offer_count", "brand_mentions"],
        data_sources=["competitive_landscape.json"],
    )


def calculate_composite_score(
    scorecard: CompetitiveScorecard,
    weights: dict[str, float] | None = None,
) -> float:
    """Calculate the weighted composite competitive score.

    Args:
        scorecard: Scorecard with individual dimension scores populated.
        weights: Optional dimension weight overrides.

    Returns:
        Composite score between 0 and 100.
    """
    w = weights or DEFAULT_DIMENSION_WEIGHTS.copy()

    # Normalize weights to sum to 1.0
    total_weight = sum(w.values())
    if total_weight > 0:
        w = {k: v / total_weight for k, v in w.items()}

    score = 0.0
    dimensions = {
        "search_strength": scorecard.search_strength,
        "paid_intensity": scorecard.paid_intensity,
        "social_presence": scorecard.social_presence,
        "content_quality": scorecard.content_quality,
        "market_positioning": scorecard.market_positioning,
    }

    for dim_name, dim_score in dimensions.items():
        if dim_score is not None:
            score += dim_score.normalized_score * w.get(dim_name, 0.0)

    return max(0.0, min(100.0, score))


def detect_trajectory(
    historical_scores: list[float],
    periods: int = 4,
    acceleration_threshold: float = 5.0,
) -> tuple[str, float]:
    """Determine competitor trajectory from historical composite scores.

    Computes the slope of the composite score over the trailing N periods.
    Slope > +threshold: accelerating
    Slope between -threshold and +threshold: stable
    Slope < -threshold: decelerating

    Args:
        historical_scores: List of composite scores ordered by period.
        periods: Number of trailing periods to evaluate (default 4).
        acceleration_threshold: Points-per-period threshold for classification.

    Returns:
        Tuple of (trajectory string, slope value).
    """
    if len(historical_scores) < 2:
        return Trajectory.STABLE, 0.0

    # Use trailing N periods
    scores = historical_scores[-periods:] if len(historical_scores) >= periods else historical_scores

    # Compute linear regression slope
    x = np.arange(len(scores), dtype=float)
    y = np.array(scores, dtype=float)

    slope, _intercept, _r_value, _p_value, _std_err = stats.linregress(x, y)

    if slope > acceleration_threshold:
        trajectory = Trajectory.ACCELERATING
    elif slope < -acceleration_threshold:
        trajectory = Trajectory.DECELERATING
    else:
        trajectory = Trajectory.STABLE

    return trajectory, float(slope)


def build_scorecard(
    competitor: str,
    competitor_domain: str,
    landscape_data: dict[str, Any],
    keyword_gap_data: dict[str, Any],
    all_competitors: list[str],
    historical_scores: list[float] | None = None,
    analysis_date: str = "",
) -> CompetitiveScorecard:
    """Build a complete competitive scorecard for one competitor.

    Args:
        competitor: Competitor name.
        competitor_domain: Competitor primary domain.
        landscape_data: Parsed competitive_landscape.json.
        keyword_gap_data: Parsed keyword_gap.json.
        all_competitors: Full list of competitors for normalization.
        historical_scores: Optional prior-period composite scores for trajectory.
        analysis_date: Date string (YYYY-MM-DD).

    Returns:
        Populated CompetitiveScorecard.
    """
    if not analysis_date:
        analysis_date = date.today().isoformat()

    scorecard = CompetitiveScorecard(
        competitor=competitor,
        competitor_domain=competitor_domain,
        analysis_date=analysis_date,
    )

    # Score each dimension
    scorecard.search_strength = score_search_strength(competitor, landscape_data, keyword_gap_data, all_competitors)
    scorecard.paid_intensity = score_paid_intensity(competitor, landscape_data, all_competitors)
    scorecard.social_presence = score_social_presence(competitor, landscape_data, all_competitors)
    scorecard.content_quality = score_content_quality(competitor, landscape_data, all_competitors)
    scorecard.market_positioning = score_market_positioning(competitor, landscape_data, all_competitors)

    # Calculate composite score
    scorecard.composite_score = calculate_composite_score(scorecard)

    # Detect trajectory
    if historical_scores:
        all_scores = historical_scores + [scorecard.composite_score]
        scorecard.trajectory, scorecard.trajectory_slope = detect_trajectory(all_scores)
    else:
        scorecard.trajectory = Trajectory.STABLE
        scorecard.trajectory_slope = 0.0

    # Identify strengths and vulnerabilities
    dimensions = [
        ("Search strength", scorecard.search_strength),
        ("Paid intensity", scorecard.paid_intensity),
        ("Social presence", scorecard.social_presence),
        ("Content quality", scorecard.content_quality),
        ("Market positioning", scorecard.market_positioning),
    ]

    for dim_name, dim_score in dimensions:
        if dim_score is None:
            continue
        if dim_score.normalized_score >= 70:
            scorecard.key_strengths.append(
                f"{dim_name}: score {dim_score.normalized_score:.0f}/100 "
                f"(metrics: {', '.join(dim_score.contributing_metrics)})"
            )
        elif dim_score.normalized_score <= 30:
            scorecard.key_vulnerabilities.append(
                f"{dim_name}: score {dim_score.normalized_score:.0f}/100 "
                f"(metrics: {', '.join(dim_score.contributing_metrics)})"
            )

    return scorecard


def generate_recommendations(
    scorecards: list[CompetitiveScorecard],
    keyword_gap_data: dict[str, Any],
    alerts_data: dict[str, Any],
    max_recommendations: int = 10,
) -> list[StrategicRecommendation]:
    """Generate data-grounded strategic recommendations.

    Every recommendation must link to at least one specific data point.
    Recommendations are prioritized by estimated impact and implementation effort.

    Args:
        scorecards: Completed scorecards for all competitors.
        keyword_gap_data: Parsed keyword_gap.json for opportunity data.
        alerts_data: Parsed competitive_alerts.json for recent changes.
        max_recommendations: Maximum number of recommendations to produce.

    Returns:
        List of StrategicRecommendation sorted by priority_score descending.
    """
    recommendations: list[StrategicRecommendation] = []

    # --- Recommendation 1: Keyword gap opportunities ---
    gap_entries = keyword_gap_data if isinstance(keyword_gap_data, list) else keyword_gap_data.get("data", [])
    if isinstance(gap_entries, list):
        for entry in gap_entries:
            if not isinstance(entry, dict):
                continue
            comp_name = entry.get("competitor", "unknown")
            missing_count = entry.get("missing_count", 0)
            top_opps = entry.get("top_opportunities", [])

            if missing_count > 0 and top_opps:
                # Pick top 3 opportunities by score
                top_kws = sorted(
                    top_opps,
                    key=lambda x: x.get("opportunity_score", 0),
                    reverse=True,
                )[:3]
                kw_list = [
                    f"'{kw.get('keyword', '')}' (vol={kw.get('search_volume', 0)}, "
                    f"score={kw.get('opportunity_score', 0):.0f})"
                    for kw in top_kws
                ]
                data_points = [
                    f"{comp_name} ranks for {missing_count} keywords where we have no presence",
                ] + [f"Top opportunity: {kw}" for kw in kw_list]

                recommendations.append(
                    StrategicRecommendation(
                        recommendation=(
                            f"Close keyword gaps against {comp_name}: target "
                            f"{min(missing_count, 20)} high-opportunity keywords"
                        ),
                        rationale=(
                            f"{comp_name} has {missing_count} keyword positions "
                            f"we are missing. Top opportunities have strong volume "
                            f"and manageable difficulty."
                        ),
                        supporting_data_points=data_points,
                        estimated_impact="high" if missing_count > 50 else "medium",
                        implementation_effort="medium",
                        priority_score=float(missing_count) * 0.5
                        + sum(kw.get("opportunity_score", 0) for kw in top_kws) * 0.01,
                        related_competitors=[comp_name],
                    )
                )

    # --- Recommendation 2: Respond to competitor trajectory changes ---
    for sc in scorecards:
        if sc.trajectory == Trajectory.ACCELERATING:
            recommendations.append(
                StrategicRecommendation(
                    recommendation=(f"Monitor and counter {sc.competitor}'s accelerating investment"),
                    rationale=(
                        f"{sc.competitor} composite score is trending upward "
                        f"(slope: {sc.trajectory_slope:+.1f} pts/period). "
                        f"Their strengths: {', '.join(sc.key_strengths[:2]) or 'broad gains'}."
                    ),
                    supporting_data_points=[
                        f"{sc.competitor} composite score: {sc.composite_score:.1f}/100",
                        f"Trajectory slope: {sc.trajectory_slope:+.1f} points/period",
                    ]
                    + [f"Strength: {s}" for s in sc.key_strengths[:2]],
                    estimated_impact="high",
                    implementation_effort="high",
                    priority_score=sc.composite_score * 0.5 + abs(sc.trajectory_slope) * 2,
                    related_competitors=[sc.competitor],
                )
            )

    # --- Recommendation 3: Exploit competitor vulnerabilities ---
    for sc in scorecards:
        if sc.key_vulnerabilities:
            vuln_details = sc.key_vulnerabilities[:2]
            recommendations.append(
                StrategicRecommendation(
                    recommendation=(f"Exploit {sc.competitor}'s weakness in {vuln_details[0].split(':')[0].lower()}"),
                    rationale=(
                        f"{sc.competitor} scores poorly on "
                        f"{', '.join(v.split(':')[0] for v in vuln_details)}. "
                        f"Investing here could widen our competitive advantage."
                    ),
                    supporting_data_points=[f"Vulnerability: {v}" for v in vuln_details],
                    estimated_impact="medium",
                    implementation_effort="low",
                    priority_score=50.0 + (100.0 - sc.composite_score) * 0.3,
                    related_competitors=[sc.competitor],
                )
            )

    # --- Recommendation 4: Respond to critical/high alerts ---
    alerts_list = alerts_data.get("alerts", []) if isinstance(alerts_data, dict) else []
    critical_high_alerts = [
        a for a in alerts_list if isinstance(a, dict) and a.get("alert_level") in ("critical", "high")
    ]

    if critical_high_alerts:
        # Group by competitor
        comp_alerts: dict[str, list[dict[str, Any]]] = {}
        for alert in critical_high_alerts:
            comp = alert.get("competitor", "unknown")
            comp_alerts.setdefault(comp, []).append(alert)

        for comp, comp_alert_list in comp_alerts.items():
            data_points = [
                f"Alert: {a.get('description', 'N/A')} ({a.get('alert_level', 'N/A')})" for a in comp_alert_list[:3]
            ]
            recommendations.append(
                StrategicRecommendation(
                    recommendation=(f"Respond to {len(comp_alert_list)} high-priority competitive changes from {comp}"),
                    rationale=(
                        f"{comp} has triggered {len(comp_alert_list)} critical/high alerts "
                        f"indicating significant strategy shifts."
                    ),
                    supporting_data_points=data_points,
                    estimated_impact="high",
                    implementation_effort="medium",
                    priority_score=80.0 + len(comp_alert_list) * 5,
                    related_competitors=[comp],
                )
            )

    # --- Recommendation 5: Defend strengths under threat ---
    for sc in scorecards:
        if sc.trajectory == Trajectory.ACCELERATING and sc.key_strengths:
            # Check if competitor is gaining in our strong areas
            for strength in sc.key_strengths[:1]:
                dim_name = strength.split(":")[0].strip()
                recommendations.append(
                    StrategicRecommendation(
                        recommendation=(f"Defend our position as {sc.competitor} gains in {dim_name.lower()}"),
                        rationale=(
                            f"{sc.competitor} is accelerating and showing strength in "
                            f"{dim_name.lower()}. Proactive defense needed to maintain advantage."
                        ),
                        supporting_data_points=[
                            f"{sc.competitor} trajectory: {sc.trajectory} (slope: {sc.trajectory_slope:+.1f})",
                            f"Their {strength}",
                        ],
                        estimated_impact="high",
                        implementation_effort="medium",
                        priority_score=70.0 + abs(sc.trajectory_slope) * 3,
                        related_competitors=[sc.competitor],
                    )
                )

    # Sort by priority_score descending
    recommendations.sort(key=lambda r: r.priority_score, reverse=True)

    # Deduplicate similar recommendations (same competitor and dimension)
    seen: set[str] = set()
    deduplicated: list[StrategicRecommendation] = []
    for rec in recommendations:
        key = f"{rec.recommendation[:50]}|{'|'.join(rec.related_competitors)}"
        if key not in seen:
            seen.add(key)
            deduplicated.append(rec)

    return deduplicated[:max_recommendations]


def compile_briefing(
    scorecards: list[CompetitiveScorecard],
    recommendations: list[StrategicRecommendation],
    analysis_date: str = "",
) -> CompetitiveBriefing:
    """Compile the full competitive intelligence briefing.

    Args:
        scorecards: All competitor scorecards.
        recommendations: Prioritized strategic recommendations.
        analysis_date: Date string (YYYY-MM-DD).

    Returns:
        CompetitiveBriefing ready for export.
    """
    if not analysis_date:
        analysis_date = date.today().isoformat()

    # Generate executive summary
    sorted_cards = sorted(scorecards, key=lambda s: s.composite_score, reverse=True)

    summary_parts: list[str] = []
    summary_parts.append(f"Competitive analysis as of {analysis_date} covering {len(scorecards)} competitors.")

    if sorted_cards:
        leader = sorted_cards[0]
        summary_parts.append(
            f"Top competitor: {leader.competitor} "
            f"(composite score: {leader.composite_score:.1f}/100, "
            f"trajectory: {leader.trajectory})."
        )

    # Identify market trends
    accelerating = [sc for sc in scorecards if sc.trajectory == Trajectory.ACCELERATING]
    decelerating = [sc for sc in scorecards if sc.trajectory == Trajectory.DECELERATING]

    market_trends: list[str] = []
    if accelerating:
        names = ", ".join(sc.competitor for sc in accelerating)
        summary_parts.append(f"Accelerating competitors: {names}.")
        market_trends.append(f"{len(accelerating)} competitor(s) showing accelerating investment: {names}")
    if decelerating:
        names = ", ".join(sc.competitor for sc in decelerating)
        market_trends.append(f"{len(decelerating)} competitor(s) showing decelerating activity: {names}")

    if recommendations:
        summary_parts.append(
            f"{len(recommendations)} strategic recommendations generated, "
            f"top priority: {recommendations[0].recommendation}"
        )

    executive_summary = " ".join(summary_parts)

    methodology_notes = [
        "Scores normalized using min-max scaling across the competitive set (0-100).",
        "Composite score is a weighted sum of 5 dimensions: search (25%), paid (20%), "
        "social (20%), content (20%), market positioning (15%).",
        "Trajectory computed via linear regression slope over trailing 4 periods.",
        "All recommendations are grounded in at least one specific data point.",
    ]

    return CompetitiveBriefing(
        analysis_date=analysis_date,
        executive_summary=executive_summary,
        scorecards=scorecards,
        recommendations=recommendations,
        market_trends=market_trends,
        methodology_notes=methodology_notes,
    )


def export_briefing_json(
    briefing: CompetitiveBriefing,
    output_path: Path,
) -> None:
    """Export competitive briefing as JSON.

    Args:
        briefing: The CompetitiveBriefing to serialize.
        output_path: Destination file path.
    """

    def _dimension_to_dict(ds: DimensionScore | None) -> dict[str, Any] | None:
        if ds is None:
            return None
        return {
            "dimension": ds.dimension,
            "raw_value": round(ds.raw_value, 4),
            "normalized_score": round(ds.normalized_score, 2),
            "weight": ds.weight,
            "contributing_metrics": ds.contributing_metrics,
            "data_sources": ds.data_sources,
        }

    scorecards_data = []
    for sc in briefing.scorecards:
        scorecards_data.append(
            {
                "competitor": sc.competitor,
                "competitor_domain": sc.competitor_domain,
                "analysis_date": sc.analysis_date,
                "search_strength": _dimension_to_dict(sc.search_strength),
                "paid_intensity": _dimension_to_dict(sc.paid_intensity),
                "social_presence": _dimension_to_dict(sc.social_presence),
                "content_quality": _dimension_to_dict(sc.content_quality),
                "market_positioning": _dimension_to_dict(sc.market_positioning),
                "composite_score": round(sc.composite_score, 2),
                "trajectory": sc.trajectory,
                "trajectory_slope": round(sc.trajectory_slope, 2),
                "key_strengths": sc.key_strengths,
                "key_vulnerabilities": sc.key_vulnerabilities,
            }
        )

    recommendations_data = []
    for rec in briefing.recommendations:
        recommendations_data.append(
            {
                "recommendation": rec.recommendation,
                "rationale": rec.rationale,
                "supporting_data_points": rec.supporting_data_points,
                "estimated_impact": rec.estimated_impact,
                "implementation_effort": rec.implementation_effort,
                "priority_score": round(rec.priority_score, 2),
                "related_competitors": rec.related_competitors,
            }
        )

    output = {
        "analysis_date": briefing.analysis_date,
        "executive_summary": briefing.executive_summary,
        "scorecards": scorecards_data,
        "recommendations": recommendations_data,
        "market_trends": briefing.market_trends,
        "methodology_notes": briefing.methodology_notes,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    logger.info("Exported briefing JSON to %s", output_path)


def export_briefing_html(
    briefing: CompetitiveBriefing,
    output_path: Path,
) -> None:
    """Export competitive briefing as an HTML report.

    Generates a styled HTML document suitable for executive review,
    including scorecard tables, trajectory indicators, and recommendation
    cards.

    Args:
        briefing: The CompetitiveBriefing to render.
        output_path: Destination HTML file path.
    """
    h = html.escape

    # Trajectory indicator symbols
    trajectory_indicators = {
        Trajectory.ACCELERATING: "&#9650; Accelerating",
        Trajectory.STABLE: "&#9644; Stable",
        Trajectory.DECELERATING: "&#9660; Decelerating",
    }

    # Impact/effort badge colors
    badge_colors = {
        "high": "#dc3545",
        "medium": "#ffc107",
        "low": "#28a745",
    }

    # Build scorecard rows
    scorecard_rows = ""
    for sc in sorted(briefing.scorecards, key=lambda s: s.composite_score, reverse=True):
        traj_display = trajectory_indicators.get(sc.trajectory, sc.trajectory)
        traj_color = {
            Trajectory.ACCELERATING: "#dc3545",
            Trajectory.STABLE: "#6c757d",
            Trajectory.DECELERATING: "#28a745",
        }.get(sc.trajectory, "#6c757d")

        def _dim_cell(dim: DimensionScore | None) -> str:
            if dim is None:
                return "<td>N/A</td>"
            score = dim.normalized_score
            color = "#28a745" if score >= 70 else ("#ffc107" if score >= 40 else "#dc3545")
            return f'<td style="color:{color};font-weight:bold">{score:.0f}</td>'

        scorecard_rows += f"""
        <tr>
            <td><strong>{h(sc.competitor)}</strong><br><small>{h(sc.competitor_domain)}</small></td>
            {_dim_cell(sc.search_strength)}
            {_dim_cell(sc.paid_intensity)}
            {_dim_cell(sc.social_presence)}
            {_dim_cell(sc.content_quality)}
            {_dim_cell(sc.market_positioning)}
            <td style="font-weight:bold;font-size:1.1em">{sc.composite_score:.1f}</td>
            <td style="color:{traj_color}">{traj_display}<br><small>({sc.trajectory_slope:+.1f}/period)</small></td>
        </tr>"""

    # Build recommendation cards
    rec_cards = ""
    for i, rec in enumerate(briefing.recommendations, 1):
        impact_color = badge_colors.get(rec.estimated_impact, "#6c757d")
        effort_color = badge_colors.get(rec.implementation_effort, "#6c757d")
        data_points_html = "".join(f"<li>{h(dp)}</li>" for dp in rec.supporting_data_points)
        competitors_html = ", ".join(h(c) for c in rec.related_competitors)

        rec_cards += f"""
        <div style="border:1px solid #dee2e6;border-radius:8px;padding:16px;margin-bottom:12px;background:#fff">
            <div style="display:flex;justify-content:space-between;align-items:start">
                <h4 style="margin:0 0 8px 0">#{i}: {h(rec.recommendation)}</h4>
                <span style="font-weight:bold;font-size:0.9em">Priority: {rec.priority_score:.0f}</span>
            </div>
            <p style="margin:4px 0">{h(rec.rationale)}</p>
            <div style="margin:8px 0">
                <span style="background:{impact_color};color:#fff;padding:2px 8px;border-radius:4px;font-size:0.8em;margin-right:4px">Impact: {rec.estimated_impact}</span>
                <span style="background:{effort_color};color:#fff;padding:2px 8px;border-radius:4px;font-size:0.8em">Effort: {rec.implementation_effort}</span>
            </div>
            <details>
                <summary style="cursor:pointer;font-size:0.9em">Supporting data ({len(rec.supporting_data_points)} points)</summary>
                <ul style="font-size:0.85em;margin-top:4px">{data_points_html}</ul>
            </details>
            <p style="font-size:0.85em;color:#6c757d;margin:4px 0 0 0">Competitors: {competitors_html}</p>
        </div>"""

    # Market trends
    trends_html = ""
    if briefing.market_trends:
        trends_items = "".join(f"<li>{h(t)}</li>" for t in briefing.market_trends)
        trends_html = f"<ul>{trends_items}</ul>"
    else:
        trends_html = "<p>No significant market trends detected.</p>"

    # Methodology
    methodology_html = "".join(f"<li>{h(n)}</li>" for n in briefing.methodology_notes)

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Competitive Intelligence Briefing - {h(briefing.analysis_date)}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
               max-width: 1200px; margin: 0 auto; padding: 20px; background: #f8f9fa; color: #212529; }}
        h1 {{ color: #343a40; border-bottom: 3px solid #007bff; padding-bottom: 8px; }}
        h2 {{ color: #495057; margin-top: 32px; }}
        table {{ width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px;
                 overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
        th {{ background: #007bff; color: #fff; padding: 12px 8px; text-align: left; font-size: 0.9em; }}
        td {{ padding: 10px 8px; border-bottom: 1px solid #dee2e6; font-size: 0.9em; }}
        tr:hover {{ background: #f1f3f5; }}
        .executive-summary {{ background: #fff; border-left: 4px solid #007bff; padding: 16px;
                              border-radius: 4px; margin-bottom: 24px; }}
    </style>
</head>
<body>
    <h1>Competitive Intelligence Briefing</h1>
    <p style="color:#6c757d">Analysis date: {h(briefing.analysis_date)}</p>

    <div class="executive-summary">
        <h2 style="margin-top:0">Executive Summary</h2>
        <p>{h(briefing.executive_summary)}</p>
    </div>

    <h2>Competitive Scorecards</h2>
    <table>
        <thead>
            <tr>
                <th>Competitor</th>
                <th>Search (25%)</th>
                <th>Paid (20%)</th>
                <th>Social (20%)</th>
                <th>Content (20%)</th>
                <th>Market (15%)</th>
                <th>Composite</th>
                <th>Trajectory</th>
            </tr>
        </thead>
        <tbody>
            {scorecard_rows}
        </tbody>
    </table>

    <h2>Strategic Recommendations</h2>
    {rec_cards}

    <h2>Market Trends</h2>
    {trends_html}

    <h2>Methodology</h2>
    <ul style="font-size:0.9em;color:#6c757d">{methodology_html}</ul>

    <footer style="margin-top:40px;padding-top:16px;border-top:1px solid #dee2e6;
                    font-size:0.8em;color:#adb5bd">
        Generated by competitive-intel skill | {h(briefing.analysis_date)}
    </footer>
</body>
</html>"""

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    logger.info("Exported briefing HTML to %s", output_path)


def load_json_data(filepath: Path) -> dict[str, Any]:
    """Load and validate a JSON data file.

    Args:
        filepath: Path to JSON file.

    Returns:
        Parsed JSON as a dictionary.

    Raises:
        FileNotFoundError: If the file does not exist.
        json.JSONDecodeError: If the file is not valid JSON.
    """
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, list):
        return {"data": data}

    if not isinstance(data, dict):
        return {"data": data}

    return data


def run_synthesis(
    landscape_path: Path,
    keyword_gap_path: Path,
    alerts_path: Path,
    competitors: list[str],
    competitor_domains: dict[str, str],
    output_path: Path,
    max_recommendations: int = 10,
) -> CompetitiveBriefing:
    """Orchestrate the full competitive synthesis pipeline.

    Args:
        landscape_path: Path to competitive_landscape.json.
        keyword_gap_path: Path to keyword_gap.json.
        alerts_path: Path to competitive_alerts.json.
        competitors: List of competitor names.
        competitor_domains: Mapping of competitor name to domain.
        output_path: Path for competitive_briefing.html output.
        max_recommendations: Maximum strategic recommendations.

    Returns:
        The compiled CompetitiveBriefing.
    """
    # Load all data with graceful degradation
    try:
        landscape_data = load_json_data(landscape_path)
    except FileNotFoundError:
        logger.warning("Landscape data not found at %s. Using empty data.", landscape_path)
        landscape_data = {}

    try:
        keyword_gap_data = load_json_data(keyword_gap_path)
    except FileNotFoundError:
        logger.warning("Keyword gap data not found at %s. Using empty data.", keyword_gap_path)
        keyword_gap_data = {}

    try:
        alerts_data = load_json_data(alerts_path)
    except FileNotFoundError:
        logger.warning("Alerts data not found at %s. Using empty data.", alerts_path)
        alerts_data = {}

    analysis_date = date.today().isoformat()

    # Build scorecards for all competitors
    scorecards: list[CompetitiveScorecard] = []
    for comp in competitors:
        domain = competitor_domains.get(comp, "")
        scorecard = build_scorecard(
            competitor=comp,
            competitor_domain=domain,
            landscape_data=landscape_data,
            keyword_gap_data=keyword_gap_data,
            all_competitors=competitors,
            historical_scores=None,  # Historical scores would come from prior runs
            analysis_date=analysis_date,
        )
        scorecards.append(scorecard)

    # Generate recommendations
    recommendations = generate_recommendations(
        scorecards=scorecards,
        keyword_gap_data=keyword_gap_data,
        alerts_data=alerts_data,
        max_recommendations=max_recommendations,
    )

    # Compile briefing
    briefing = compile_briefing(
        scorecards=scorecards,
        recommendations=recommendations,
        analysis_date=analysis_date,
    )

    # Export both JSON and HTML
    json_output = output_path.with_suffix(".json")
    export_briefing_json(briefing, json_output)
    export_briefing_html(briefing, output_path)

    return briefing


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Competitive strategic scorecard and briefing synthesis")
    parser.add_argument(
        "--landscape",
        type=Path,
        required=True,
        help="Path to competitive_landscape.json",
    )
    parser.add_argument(
        "--keyword-gaps",
        type=Path,
        required=True,
        help="Path to keyword_gap.json",
    )
    parser.add_argument(
        "--alerts",
        type=Path,
        required=True,
        help="Path to competitive_alerts.json",
    )
    parser.add_argument(
        "--competitors",
        nargs="+",
        required=True,
        help="List of competitor names",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("workspace/reports/competitive_briefing.html"),
        help="Output path for competitive briefing",
    )
    parser.add_argument(
        "--max-recommendations",
        type=int,
        default=10,
        help="Maximum number of strategic recommendations",
    )
    args = parser.parse_args()

    briefing = run_synthesis(
        landscape_path=args.landscape,
        keyword_gap_path=args.keyword_gaps,
        alerts_path=args.alerts,
        competitors=args.competitors,
        competitor_domains={},  # TODO: Accept from config
        output_path=args.output,
        max_recommendations=args.max_recommendations,
    )
    logger.info(
        "Synthesis complete: %d scorecards, %d recommendations",
        len(briefing.scorecards),
        len(briefing.recommendations),
    )
