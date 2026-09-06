"""Multi-channel share of voice aggregation.

Combines organic search, paid search, social media, and earned media signals
into a unified share-of-voice metric per competitor. Produces both channel-level
and composite SOV scores with methodology annotations.

Usage:
    python share_of_voice.py \
        --keyword-data workspace/analysis/keyword_performance.json \
        --social-data workspace/analysis/social_benchmarks.json \
        --competitor-data workspace/raw/competitor_data.csv \
        --output workspace/analysis/competitive_landscape.json
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)

# Default CTR curve mapping position to expected click-through rate.
# Based on aggregate studies; adjust per references/competitive_methodology.md.
DEFAULT_CTR_CURVE: dict[int, float] = {
    1: 0.316,
    2: 0.152,
    3: 0.097,
    4: 0.068,
    5: 0.049,
    6: 0.037,
    7: 0.029,
    8: 0.024,
    9: 0.020,
    10: 0.017,
}
CTR_POSITION_11_20 = 0.005
CTR_POSITION_21_PLUS = 0.001

# Default channel weights for composite SOV.
DEFAULT_CHANNEL_WEIGHTS: dict[str, float] = {
    "organic": 0.25,
    "paid": 0.25,
    "social": 0.25,
    "earned": 0.25,
}

# Social engagement weights.
SOCIAL_ENGAGEMENT_WEIGHTS: dict[str, float] = {
    "shares": 3.0,
    "comments": 2.0,
    "likes": 1.0,
    "posts": 0.5,
}


@dataclass
class ChannelSOV:
    """Share of voice for a single competitor on a single channel."""

    competitor: str
    channel: str
    sov_score: float
    data_source: str
    confidence: str  # "high", "medium", "low"
    methodology_note: str


@dataclass
class CompositeSOV:
    """Aggregated share of voice across all channels for one competitor."""

    competitor: str
    competitor_domain: str
    organic_sov: float
    paid_sov: float
    social_sov: float
    earned_sov: float
    composite_sov: float
    channel_details: list[ChannelSOV] = field(default_factory=list)
    methodology_notes: list[str] = field(default_factory=list)
    last_updated: str = ""


def get_ctr_for_position(position: int | None) -> float:
    """Return the expected CTR for a given SERP position.

    Args:
        position: Ranking position (1-based). None if not ranking.

    Returns:
        Expected CTR as a float between 0 and 1.
    """
    if position is None or position <= 0:
        return 0.0

    if position in DEFAULT_CTR_CURVE:
        return DEFAULT_CTR_CURVE[position]

    if 11 <= position <= 20:
        return CTR_POSITION_11_20

    if position >= 21:
        return CTR_POSITION_21_PLUS

    return 0.0


def calculate_organic_sov(
    keyword_rankings: dict[str, list[dict[str, Any]]],
    competitors: list[str],
) -> dict[str, ChannelSOV]:
    """Calculate organic search share of voice for all competitors.

    Uses CTR-curve weighted visibility: for each keyword, multiply search
    volume by the CTR at the competitor's ranking position, then compute
    each competitor's share of total weighted visibility.

    Branded keywords should be excluded from competitive SOV (tracked
    separately).

    Args:
        keyword_rankings: Mapping of competitor name to list of keyword
            records, each containing 'keyword', 'position', 'search_volume'.
        competitors: List of competitor names to include.

    Returns:
        Dict mapping competitor name to their organic ChannelSOV.
    """
    # Build per-keyword max visibility across all competitors for the
    # denominator per the methodology:
    #   organic_sov = sum(visibility(k, comp)) / sum(max visibility(k) across comps)
    # Collect all keywords across all competitors
    all_keywords: set[str] = set()
    for comp in competitors:
        for rec in keyword_rankings.get(comp, []):
            kw = rec.get("keyword", "").lower().strip()
            if kw:
                all_keywords.add(kw)

    # Calculate visibility per competitor per keyword
    comp_visibility: dict[str, float] = {comp: 0.0 for comp in competitors}
    keyword_max_visibility: dict[str, float] = {}

    for kw in all_keywords:
        max_vis = 0.0
        for comp in competitors:
            rankings = keyword_rankings.get(comp, [])
            # Find this keyword in the competitor's rankings
            vol = 0
            pos = None
            for rec in rankings:
                if rec.get("keyword", "").lower().strip() == kw:
                    vol = int(rec.get("search_volume", rec.get("volume", 0)))
                    pos_raw = rec.get("position", rec.get("rank"))
                    pos = int(pos_raw) if pos_raw is not None else None
                    break

            ctr = get_ctr_for_position(pos)
            vis = vol * ctr
            comp_visibility[comp] += vis
            if vis > max_vis:
                max_vis = vis

        keyword_max_visibility[kw] = max_vis

    total_max_visibility = sum(keyword_max_visibility.values())

    results: dict[str, ChannelSOV] = {}
    for comp in competitors:
        if total_max_visibility > 0:
            sov = comp_visibility[comp] / total_max_visibility
        else:
            sov = 0.0

        results[comp] = ChannelSOV(
            competitor=comp,
            channel="organic",
            sov_score=round(sov, 6),
            data_source="keyword_performance.json",
            confidence="medium",
            methodology_note=(
                "CTR-curve weighted visibility. SOV = sum(volume * CTR(pos)) / "
                "sum(max visibility per keyword). Branded keywords excluded."
            ),
        )

    return results


def calculate_paid_sov(
    paid_data: dict[str, dict[str, Any]],
    competitors: list[str],
) -> dict[str, ChannelSOV]:
    """Calculate paid search share of voice for all competitors.

    Uses impression share data when available. Falls back to ad position
    frequency from third-party tools when impression share is unavailable.

    Args:
        paid_data: Mapping of competitor name to paid search metrics,
            containing 'impression_share' or 'ad_position_frequency'.
        competitors: List of competitor names to include.

    Returns:
        Dict mapping competitor name to their paid ChannelSOV.
    """
    # Determine data availability: prefer impression_share, fall back to proxy
    has_impression_share = any("impression_share" in paid_data.get(c, {}) for c in competitors)

    raw_scores: dict[str, float] = {}
    confidence = "high" if has_impression_share else "low"
    data_source = "impression_share" if has_impression_share else "ad_position_frequency (proxy)"

    for comp in competitors:
        comp_data = paid_data.get(comp, {})
        if has_impression_share:
            raw_scores[comp] = float(comp_data.get("impression_share", 0.0))
        else:
            # Use ad position frequency as a proxy: weight top positions higher
            freq = comp_data.get("ad_position_frequency", {})
            if isinstance(freq, dict):
                # freq maps position bucket (string) to count/frequency
                weighted = 0.0
                for pos_str, count in freq.items():
                    try:
                        pos = int(pos_str)
                    except (ValueError, TypeError):
                        pos = 5
                    weight = max(0, 1.0 / pos)
                    weighted += float(count) * weight
                raw_scores[comp] = weighted
            else:
                raw_scores[comp] = float(comp_data.get("estimated_ad_spend", 0.0))

    total = sum(raw_scores.values())
    results: dict[str, ChannelSOV] = {}
    for comp in competitors:
        sov = raw_scores[comp] / total if total > 0 else 0.0
        method_note = (
            "Paid SOV from impression share data."
            if has_impression_share
            else "Paid SOV estimated from ad position frequency proxy. "
            "Accuracy is lower without direct impression share data."
        )
        results[comp] = ChannelSOV(
            competitor=comp,
            channel="paid",
            sov_score=round(sov, 6),
            data_source=data_source,
            confidence=confidence,
            methodology_note=method_note,
        )

    return results


def calculate_social_sov(
    social_data: dict[str, dict[str, int]],
    competitors: list[str],
    engagement_weights: dict[str, float] | None = None,
) -> dict[str, ChannelSOV]:
    """Calculate social media share of voice for all competitors.

    Uses engagement-weighted social activity: shares (3x), comments (2x),
    likes (1x), posts (0.5x).

    Args:
        social_data: Mapping of competitor name to engagement counts
            with keys: 'shares', 'comments', 'likes', 'posts'.
        competitors: List of competitor names to include.
        engagement_weights: Optional override for engagement type weights.

    Returns:
        Dict mapping competitor name to their social ChannelSOV.
    """
    weights = engagement_weights or SOCIAL_ENGAGEMENT_WEIGHTS

    weighted_scores: dict[str, float] = {}
    for comp in competitors:
        metrics = social_data.get(comp, {})
        score = 0.0
        for metric_key, weight in weights.items():
            score += float(metrics.get(metric_key, 0)) * weight
        weighted_scores[comp] = score

    total = sum(weighted_scores.values())

    results: dict[str, ChannelSOV] = {}
    for comp in competitors:
        sov = weighted_scores[comp] / total if total > 0 else 0.0
        has_data = comp in social_data and bool(social_data[comp])
        results[comp] = ChannelSOV(
            competitor=comp,
            channel="social",
            sov_score=round(sov, 6),
            data_source="social_benchmarks.json",
            confidence="medium" if has_data else "low",
            methodology_note=("Engagement-weighted social SOV: shares (3x), comments (2x), likes (1x), posts (0.5x)."),
        )

    return results


def calculate_earned_sov(
    earned_data: dict[str, dict[str, int]],
    competitors: list[str],
) -> dict[str, ChannelSOV]:
    """Calculate earned media share of voice for all competitors.

    Uses volume-weighted share of mentions, backlinks, and PR coverage.

    Args:
        earned_data: Mapping of competitor name to earned media metrics
            with keys: 'mentions', 'backlinks', 'pr_coverage_count'.
        competitors: List of competitor names to include.

    Returns:
        Dict mapping competitor name to their earned ChannelSOV.
    """
    # Earned media weights: backlinks are a stronger quality signal
    earned_weights = {
        "mentions": 1.0,
        "backlinks": 2.0,
        "pr_coverage_count": 3.0,
    }

    weighted_scores: dict[str, float] = {}
    for comp in competitors:
        metrics = earned_data.get(comp, {})
        score = 0.0
        for metric_key, weight in earned_weights.items():
            score += float(metrics.get(metric_key, 0)) * weight
        weighted_scores[comp] = score

    total = sum(weighted_scores.values())

    results: dict[str, ChannelSOV] = {}
    for comp in competitors:
        sov = weighted_scores[comp] / total if total > 0 else 0.0
        has_data = comp in earned_data and bool(earned_data[comp])
        results[comp] = ChannelSOV(
            competitor=comp,
            channel="earned",
            sov_score=round(sov, 6),
            data_source="competitor_data.csv / PR monitoring",
            confidence="medium" if has_data else "low",
            methodology_note=("Earned media SOV: weighted sum of mentions (1x), backlinks (2x), PR coverage (3x)."),
        )

    return results


def aggregate_composite_sov(
    organic: dict[str, ChannelSOV],
    paid: dict[str, ChannelSOV],
    social: dict[str, ChannelSOV],
    earned: dict[str, ChannelSOV],
    competitor_domains: dict[str, str],
    channel_weights: dict[str, float] | None = None,
    analysis_date: str = "",
) -> list[CompositeSOV]:
    """Aggregate channel-level SOV into composite scores per competitor.

    Args:
        organic: Organic SOV per competitor.
        paid: Paid SOV per competitor.
        social: Social SOV per competitor.
        earned: Earned SOV per competitor.
        competitor_domains: Mapping of competitor name to primary domain.
        channel_weights: Optional channel weight overrides. Defaults to
            equal weighting (0.25 each).
        analysis_date: Date string (YYYY-MM-DD) for the analysis.

    Returns:
        List of CompositeSOV results, one per competitor, sorted by
        composite_sov descending.
    """
    weights = channel_weights or DEFAULT_CHANNEL_WEIGHTS.copy()

    # Normalize weights to sum to 1.0
    total_weight = sum(weights.values())
    if total_weight > 0:
        weights = {k: v / total_weight for k, v in weights.items()}

    if not analysis_date:
        analysis_date = date.today().isoformat()

    all_competitors = set(organic.keys()) | set(paid.keys()) | set(social.keys()) | set(earned.keys())

    results: list[CompositeSOV] = []
    for comp in all_competitors:
        org_sov = organic[comp].sov_score if comp in organic else 0.0
        pai_sov = paid[comp].sov_score if comp in paid else 0.0
        soc_sov = social[comp].sov_score if comp in social else 0.0
        ear_sov = earned[comp].sov_score if comp in earned else 0.0

        composite = (
            org_sov * weights.get("organic", 0.25)
            + pai_sov * weights.get("paid", 0.25)
            + soc_sov * weights.get("social", 0.25)
            + ear_sov * weights.get("earned", 0.25)
        )

        channel_details: list[ChannelSOV] = []
        methodology_notes: list[str] = []
        for channel_dict, channel_name in [
            (organic, "organic"),
            (paid, "paid"),
            (social, "social"),
            (earned, "earned"),
        ]:
            if comp in channel_dict:
                channel_details.append(channel_dict[comp])
                methodology_notes.append(channel_dict[comp].methodology_note)

        results.append(
            CompositeSOV(
                competitor=comp,
                competitor_domain=competitor_domains.get(comp, ""),
                organic_sov=round(org_sov, 6),
                paid_sov=round(pai_sov, 6),
                social_sov=round(soc_sov, 6),
                earned_sov=round(ear_sov, 6),
                composite_sov=round(composite, 6),
                channel_details=channel_details,
                methodology_notes=list(set(methodology_notes)),
                last_updated=analysis_date,
            )
        )

    results.sort(key=lambda r: r.composite_sov, reverse=True)
    return results


def load_keyword_data(filepath: Path) -> dict[str, list[dict[str, Any]]]:
    """Load keyword ranking data from seo-content skill output.

    Args:
        filepath: Path to keyword_performance.json.

    Returns:
        Dict mapping competitor/entity name to keyword records.
    """
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Support multiple structures:
    # 1. Dict mapping competitor -> list of records
    # 2. List of records with a "competitor" or "domain" field
    # 3. Dict with "competitors" key
    if isinstance(data, dict):
        if "competitors" in data:
            return data["competitors"]
        # Check if values are lists (already in expected format)
        if all(isinstance(v, list) for v in data.values()):
            return data
        # Single entity -- wrap
        return {"self": data.get("keywords", data.get("data", []))}

    if isinstance(data, list):
        # Group by competitor/domain field
        grouped: dict[str, list[dict[str, Any]]] = {}
        for rec in data:
            entity = rec.get("competitor", rec.get("domain", "self"))
            grouped.setdefault(entity, []).append(rec)
        return grouped

    return {}


def load_social_data(filepath: Path) -> dict[str, dict[str, int]]:
    """Load social engagement benchmarks from social-analytics skill output.

    Args:
        filepath: Path to social_benchmarks.json.

    Returns:
        Dict mapping competitor name to engagement metrics.
    """
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        logger.warning(
            "Social data file not found at %s. Returning empty data (graceful degradation).",
            filepath,
        )
        return {}

    if isinstance(data, dict):
        # Could be {"competitors": {...}} or direct mapping
        if "competitors" in data:
            return data["competitors"]
        return data

    return {}


def load_competitor_data(filepath: Path) -> dict[str, dict[str, Any]]:
    """Load third-party competitive data from CSV export.

    Supports Semrush, Ahrefs, SimilarWeb, and SpyFu export formats.
    Auto-detects format based on column headers.

    Args:
        filepath: Path to competitor_data.csv.

    Returns:
        Dict mapping competitor name to aggregated metrics.
    """
    try:
        df = pd.read_csv(filepath, encoding="utf-8")
    except FileNotFoundError:
        logger.warning(
            "Competitor data file not found at %s. Returning empty data (graceful degradation).",
            filepath,
        )
        return {}
    except UnicodeDecodeError:
        df = pd.read_csv(filepath, encoding="latin-1")

    cols_lower = {c.lower().strip(): c for c in df.columns}

    # Detect competitor name column
    comp_col = None
    for candidate in ["competitor", "domain", "competitor_name", "brand", "company"]:
        if candidate in cols_lower:
            comp_col = cols_lower[candidate]
            break

    if comp_col is None:
        logger.warning("Cannot detect competitor column in %s", filepath)
        return {}

    result: dict[str, dict[str, Any]] = {}
    for comp_name, group in df.groupby(comp_col):
        comp_name_str = str(comp_name).strip()
        metrics: dict[str, Any] = {}

        # Aggregate all columns for the competitor
        for col in df.columns:
            if col == comp_col:
                continue
            col_data = group[col]
            if pd.api.types.is_numeric_dtype(col_data):
                metrics[col.lower().strip()] = float(col_data.sum())
            else:
                # Take first non-null value
                non_null = col_data.dropna()
                if len(non_null) > 0:
                    metrics[col.lower().strip()] = str(non_null.iloc[0])

        result[comp_name_str] = metrics

    return result


def run_sov_analysis(
    keyword_data_path: Path,
    social_data_path: Path,
    competitor_data_path: Path,
    competitors: list[str],
    competitor_domains: dict[str, str],
    output_path: Path,
    channel_weights: dict[str, float] | None = None,
) -> list[CompositeSOV]:
    """Orchestrate full share of voice analysis across all channels.

    Args:
        keyword_data_path: Path to keyword_performance.json.
        social_data_path: Path to social_benchmarks.json.
        competitor_data_path: Path to competitor_data.csv.
        competitors: List of competitor names.
        competitor_domains: Mapping of competitor name to domain.
        output_path: Path for competitive_landscape.json output.
        channel_weights: Optional channel weight overrides.

    Returns:
        List of CompositeSOV results.
    """
    # Load all data sources with graceful degradation
    keyword_rankings = load_keyword_data(keyword_data_path)
    social_data = load_social_data(social_data_path)
    competitor_data = load_competitor_data(competitor_data_path)

    # Extract paid and earned data from competitor_data
    paid_data: dict[str, dict[str, Any]] = {}
    earned_data: dict[str, dict[str, int]] = {}

    for comp in competitors:
        comp_metrics = competitor_data.get(comp, {})
        # Build paid data
        paid_data[comp] = {
            k: v
            for k, v in comp_metrics.items()
            if k in ("impression_share", "ad_position_frequency", "estimated_ad_spend")
        }
        # Build earned data
        earned_data[comp] = {
            k: int(float(v))
            for k, v in comp_metrics.items()
            if k in ("mentions", "backlinks", "pr_coverage_count") and v is not None
        }

    # Calculate per-channel SOV
    organic = calculate_organic_sov(keyword_rankings, competitors)
    paid = calculate_paid_sov(paid_data, competitors)
    social = calculate_social_sov(social_data, competitors)
    earned = calculate_earned_sov(earned_data, competitors)

    # Aggregate into composite
    results = aggregate_composite_sov(
        organic=organic,
        paid=paid,
        social=social,
        earned=earned,
        competitor_domains=competitor_domains,
        channel_weights=channel_weights,
        analysis_date=date.today().isoformat(),
    )

    export_results(results, output_path)
    return results


def export_results(
    results: list[CompositeSOV],
    output_path: Path,
) -> None:
    """Export SOV results to JSON with methodology documentation.

    Args:
        results: List of CompositeSOV results.
        output_path: Destination file path.
    """
    output_data: list[dict[str, Any]] = []
    for r in results:
        channel_details = []
        for cd in r.channel_details:
            channel_details.append(
                {
                    "competitor": cd.competitor,
                    "channel": cd.channel,
                    "sov_score": cd.sov_score,
                    "data_source": cd.data_source,
                    "confidence": cd.confidence,
                    "methodology_note": cd.methodology_note,
                }
            )
        output_data.append(
            {
                "competitor": r.competitor,
                "competitor_domain": r.competitor_domain,
                "organic_sov": r.organic_sov,
                "paid_sov": r.paid_sov,
                "social_sov": r.social_sov,
                "earned_sov": r.earned_sov,
                "composite_sov": r.composite_sov,
                "channel_details": channel_details,
                "methodology_notes": r.methodology_notes,
                "last_updated": r.last_updated,
            }
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)

    logger.info("Exported SOV results to %s", output_path)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Multi-channel share of voice aggregation")
    parser.add_argument(
        "--keyword-data",
        type=Path,
        required=True,
        help="Path to keyword_performance.json",
    )
    parser.add_argument(
        "--social-data",
        type=Path,
        required=True,
        help="Path to social_benchmarks.json",
    )
    parser.add_argument(
        "--competitor-data",
        type=Path,
        required=True,
        help="Path to competitor_data.csv",
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
        default=Path("workspace/analysis/competitive_landscape.json"),
        help="Output path for competitive landscape JSON",
    )
    args = parser.parse_args()

    results = run_sov_analysis(
        keyword_data_path=args.keyword_data,
        social_data_path=args.social_data,
        competitor_data_path=args.competitor_data,
        competitors=args.competitors,
        competitor_domains={},  # TODO: Accept from config
        output_path=args.output,
    )
    logger.info("SOV analysis complete for %d competitors", len(results))
