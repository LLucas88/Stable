"""Competitor keyword overlap/gap analysis with opportunity scoring.

Compares your keyword rankings against each defined competitor to identify
gaps, overlaps, and prioritized opportunities. Outputs a scored list of
keyword opportunities suitable for content strategy planning.

Usage:
    python keyword_gap.py \
        --your-keywords workspace/analysis/keyword_performance.json \
        --competitor-data workspace/raw/competitor_data.csv \
        --output workspace/analysis/keyword_gap.json
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)


class GapType(Enum):
    """Classification of keyword gap between you and a competitor."""

    MISSING = "missing"  # Competitor ranks, you do not
    WEAK = "weak"  # Both rank, competitor significantly higher
    STRONG = "strong"  # Both rank, you significantly higher
    SHARED = "shared"  # Both rank in similar positions
    UNIQUE = "unique"  # You rank, competitor does not


@dataclass
class KeywordRecord:
    """A single keyword ranking record for one entity."""

    keyword: str
    position: int | None
    search_volume: int
    keyword_difficulty: float
    url: str | None = None


@dataclass
class KeywordGapResult:
    """Result of a keyword gap analysis for one keyword-competitor pair."""

    keyword: str
    search_volume: int
    keyword_difficulty: float
    your_position: int | None
    competitor: str
    competitor_position: int | None
    gap_type: GapType
    opportunity_score: float
    business_relevance: float


@dataclass
class GapAnalysisSummary:
    """Aggregate summary of keyword gap analysis for one competitor."""

    competitor: str
    total_keywords_analyzed: int
    missing_count: int
    weak_count: int
    strong_count: int
    shared_count: int
    unique_count: int
    top_opportunities: list[KeywordGapResult] = field(default_factory=list)


def load_your_keywords(filepath: Path) -> list[KeywordRecord]:
    """Load your keyword performance data from the seo-content skill output.

    Args:
        filepath: Path to workspace/analysis/keyword_performance.json.

    Returns:
        List of KeywordRecord instances for your domain.
    """
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Support both a top-level list and a dict with a "keywords" key
    records_raw: list[dict[str, Any]]
    if isinstance(data, list):
        records_raw = data
    elif isinstance(data, dict):
        records_raw = data.get("keywords", data.get("data", []))
    else:
        records_raw = []

    records: list[KeywordRecord] = []
    for item in records_raw:
        kw = item.get("keyword", item.get("term", ""))
        pos = item.get("position", item.get("rank"))
        vol = int(item.get("search_volume", item.get("volume", 0)))
        diff = float(item.get("keyword_difficulty", item.get("difficulty", 0.5)))
        url = item.get("url", item.get("landing_page"))

        # Normalize difficulty to 0-1 if provided on a 0-100 scale
        if diff > 1.0:
            diff = diff / 100.0

        records.append(
            KeywordRecord(
                keyword=kw.lower().strip(),
                position=int(pos) if pos is not None else None,
                search_volume=vol,
                keyword_difficulty=diff,
                url=url,
            )
        )

    logger.info("Loaded %d keyword records from %s", len(records), filepath)
    return records


def load_competitor_keywords(
    filepath: Path,
    competitor_name: str,
) -> list[KeywordRecord]:
    """Load competitor keyword data from third-party export.

    Supports CSV exports from Semrush, Ahrefs, SpyFu, and DataForSEO.
    Auto-detects format based on column headers.

    Args:
        filepath: Path to workspace/raw/competitor_data.csv.
        competitor_name: Name of the competitor to filter for.

    Returns:
        List of KeywordRecord instances for the specified competitor.
    """
    try:
        df = pd.read_csv(filepath, encoding="utf-8")
    except UnicodeDecodeError:
        df = pd.read_csv(filepath, encoding="latin-1")

    cols_lower = {c.lower().strip(): c for c in df.columns}

    # Auto-detect format based on column names
    # Determine competitor column
    competitor_col = None
    for candidate in ["competitor", "domain", "competitor_name", "brand"]:
        if candidate in cols_lower:
            competitor_col = cols_lower[candidate]
            break

    if competitor_col is not None:
        mask = df[competitor_col].astype(str).str.lower().str.strip() == competitor_name.lower().strip()
        df = df[mask]

    # Map keyword column
    kw_col = None
    for candidate in ["keyword", "term", "search term", "query"]:
        if candidate in cols_lower:
            kw_col = cols_lower[candidate]
            break
    if kw_col is None:
        raise ValueError(f"Cannot detect keyword column in {filepath}. Columns: {list(df.columns)}")

    # Map position column
    pos_col = None
    for candidate in ["position", "rank", "ranking", "pos"]:
        if candidate in cols_lower:
            pos_col = cols_lower[candidate]
            break

    # Map volume column
    vol_col = None
    for candidate in ["search_volume", "volume", "search volume", "avg. monthly searches"]:
        if candidate in cols_lower:
            vol_col = cols_lower[candidate]
            break

    # Map difficulty column
    diff_col = None
    for candidate in ["keyword_difficulty", "difficulty", "kd", "kd %", "keyword difficulty"]:
        if candidate in cols_lower:
            diff_col = cols_lower[candidate]
            break

    # Map URL column
    url_col = None
    for candidate in ["url", "landing_page", "landing page", "target url"]:
        if candidate in cols_lower:
            url_col = cols_lower[candidate]
            break

    records: list[KeywordRecord] = []
    for _, row in df.iterrows():
        kw = str(row[kw_col]).lower().strip()
        pos = row.get(pos_col) if pos_col else None
        if pd.notna(pos):
            pos = int(float(pos))
        else:
            pos = None

        vol = int(float(row[vol_col])) if vol_col and pd.notna(row.get(vol_col)) else 0
        diff = float(row[diff_col]) if diff_col and pd.notna(row.get(diff_col)) else 0.5
        url = str(row[url_col]) if url_col and pd.notna(row.get(url_col)) else None

        # Normalize difficulty to 0-1 if provided on a 0-100 scale
        if diff > 1.0:
            diff = diff / 100.0

        records.append(
            KeywordRecord(
                keyword=kw,
                position=pos,
                search_volume=vol,
                keyword_difficulty=diff,
                url=url,
            )
        )

    logger.info(
        "Loaded %d keyword records for competitor '%s' from %s",
        len(records),
        competitor_name,
        filepath,
    )
    return records


def classify_gap(
    your_position: int | None,
    competitor_position: int | None,
    position_threshold: int = 10,
) -> GapType:
    """Classify the gap type for a keyword between you and a competitor.

    Args:
        your_position: Your ranking position (None if not ranking).
        competitor_position: Competitor ranking position (None if not ranking).
        position_threshold: Minimum position difference to classify as
            weak/strong rather than shared.

    Returns:
        The GapType classification.
    """
    if your_position is None and competitor_position is None:
        # Neither ranks -- treat as shared (no actionable gap)
        return GapType.SHARED

    if your_position is None and competitor_position is not None:
        # Competitor ranks, you do not
        return GapType.MISSING

    if your_position is not None and competitor_position is None:
        # You rank, competitor does not
        return GapType.UNIQUE

    # Both rank -- lower position number is better
    assert your_position is not None and competitor_position is not None
    delta = your_position - competitor_position  # positive = you're worse

    if delta > position_threshold:
        # You are significantly worse
        return GapType.WEAK
    elif delta < -position_threshold:
        # You are significantly better
        return GapType.STRONG
    else:
        return GapType.SHARED


def calculate_opportunity_score(
    search_volume: int,
    keyword_difficulty: float,
    business_relevance: float,
) -> float:
    """Calculate the composite opportunity score for a keyword gap.

    Formula: search_volume * (1 - keyword_difficulty) * business_relevance

    Args:
        search_volume: Monthly average search volume.
        keyword_difficulty: Normalized difficulty score (0-1).
        business_relevance: Business relevance score (0-1).

    Returns:
        The opportunity score as a float.
    """
    # Clamp inputs to valid ranges
    kd = max(0.0, min(1.0, keyword_difficulty))
    br = max(0.0, min(1.0, business_relevance))
    vol = max(0, search_volume)
    return float(vol) * (1.0 - kd) * br


def assign_business_relevance(
    keyword: str,
    relevance_map: dict[str, float] | None = None,
    default_relevance: float = 0.4,
) -> float:
    """Assign a business relevance score to a keyword.

    Uses a predefined relevance map if provided, otherwise falls back to
    a default score. Relevance tiers:
        - Core (1.0): Directly describes a product/service
        - Adjacent (0.7): Related topic for qualified prospects
        - Informational (0.4): Top-of-funnel educational
        - Tangential (0.1): Loosely related, low commercial intent

    Args:
        keyword: The search term to score.
        relevance_map: Optional mapping of keyword patterns to relevance scores.
        default_relevance: Fallback relevance score when no map match is found.

    Returns:
        Business relevance score between 0 and 1.
    """
    if relevance_map is None:
        return default_relevance

    kw_lower = keyword.lower().strip()

    # First try exact match
    if kw_lower in relevance_map:
        return max(0.0, min(1.0, relevance_map[kw_lower]))

    # Then try pattern (substring / regex) matching -- longest pattern first
    # to prefer more specific matches
    best_score: float | None = None
    best_len = 0
    for pattern, score in relevance_map.items():
        pattern_lower = pattern.lower().strip()
        try:
            if re.search(pattern_lower, kw_lower):
                if len(pattern_lower) > best_len:
                    best_len = len(pattern_lower)
                    best_score = score
        except re.error:
            # Fall back to simple substring match if pattern is not valid regex
            if pattern_lower in kw_lower:
                if len(pattern_lower) > best_len:
                    best_len = len(pattern_lower)
                    best_score = score

    if best_score is not None:
        return max(0.0, min(1.0, best_score))

    return default_relevance


def analyze_keyword_gaps(
    your_keywords: list[KeywordRecord],
    competitor_keywords: list[KeywordRecord],
    competitor_name: str,
    relevance_map: dict[str, float] | None = None,
    position_threshold: int = 10,
    top_n: int = 50,
) -> GapAnalysisSummary:
    """Run full keyword gap analysis against one competitor.

    Merges your keyword set with the competitor's, classifies each gap,
    scores opportunities, and returns a summary with the top-N results.

    Args:
        your_keywords: Your keyword ranking records.
        competitor_keywords: Competitor keyword ranking records.
        competitor_name: Human-readable competitor name.
        relevance_map: Optional keyword-to-relevance mapping.
        position_threshold: Position delta to distinguish weak/strong from shared.
        top_n: Number of top opportunities to include in summary.

    Returns:
        GapAnalysisSummary with classified gaps and scored opportunities.
    """
    # Build lookup dicts keyed by keyword string
    your_map: dict[str, KeywordRecord] = {r.keyword: r for r in your_keywords}
    comp_map: dict[str, KeywordRecord] = {r.keyword: r for r in competitor_keywords}

    all_keywords = set(your_map.keys()) | set(comp_map.keys())

    gap_results: list[KeywordGapResult] = []
    counts = {gt: 0 for gt in GapType}

    for kw in all_keywords:
        your_rec = your_map.get(kw)
        comp_rec = comp_map.get(kw)

        your_pos = your_rec.position if your_rec else None
        comp_pos = comp_rec.position if comp_rec else None

        # Use the best available volume and difficulty data
        if your_rec and comp_rec:
            vol = max(your_rec.search_volume, comp_rec.search_volume)
            diff = your_rec.keyword_difficulty  # prefer your data
        elif your_rec:
            vol = your_rec.search_volume
            diff = your_rec.keyword_difficulty
        elif comp_rec:
            vol = comp_rec.search_volume
            diff = comp_rec.keyword_difficulty
        else:
            vol = 0
            diff = 0.5

        gap_type = classify_gap(your_pos, comp_pos, position_threshold)
        counts[gap_type] += 1

        business_rel = assign_business_relevance(kw, relevance_map)
        opp_score = calculate_opportunity_score(vol, diff, business_rel)

        gap_results.append(
            KeywordGapResult(
                keyword=kw,
                search_volume=vol,
                keyword_difficulty=diff,
                your_position=your_pos,
                competitor=competitor_name,
                competitor_position=comp_pos,
                gap_type=gap_type,
                opportunity_score=opp_score,
                business_relevance=business_rel,
            )
        )

    # Sort by opportunity score descending, prioritizing MISSING and WEAK gaps
    gap_priority = {
        GapType.MISSING: 0,
        GapType.WEAK: 1,
        GapType.SHARED: 2,
        GapType.UNIQUE: 3,
        GapType.STRONG: 4,
    }
    gap_results.sort(
        key=lambda r: (-gap_priority.get(r.gap_type, 99), -r.opportunity_score),
        reverse=True,
    )
    # Actually sort purely by opportunity score descending since that's the
    # primary ranking; gap_type is informational
    gap_results.sort(key=lambda r: r.opportunity_score, reverse=True)

    top_opportunities = gap_results[:top_n]

    summary = GapAnalysisSummary(
        competitor=competitor_name,
        total_keywords_analyzed=len(all_keywords),
        missing_count=counts[GapType.MISSING],
        weak_count=counts[GapType.WEAK],
        strong_count=counts[GapType.STRONG],
        shared_count=counts[GapType.SHARED],
        unique_count=counts[GapType.UNIQUE],
        top_opportunities=top_opportunities,
    )

    logger.info(
        "Gap analysis for '%s': %d total, %d missing, %d weak, %d strong, %d shared, %d unique",
        competitor_name,
        summary.total_keywords_analyzed,
        summary.missing_count,
        summary.weak_count,
        summary.strong_count,
        summary.shared_count,
        summary.unique_count,
    )
    return summary


def detect_new_competitor_keywords(
    current_keywords: list[KeywordRecord],
    previous_keywords: list[KeywordRecord],
    competitor_name: str,
) -> list[KeywordRecord]:
    """Detect keywords a competitor has started ranking for since last analysis.

    Args:
        current_keywords: Competitor's current keyword rankings.
        previous_keywords: Competitor's keyword rankings from prior period.
        competitor_name: Human-readable competitor name.

    Returns:
        List of newly acquired keyword records.
    """
    previous_set = {r.keyword for r in previous_keywords}
    new_keywords = [r for r in current_keywords if r.keyword not in previous_set]

    # Sort by search volume descending to surface the most impactful new entries
    new_keywords.sort(key=lambda r: r.search_volume, reverse=True)

    logger.info(
        "Detected %d new keywords for competitor '%s'",
        len(new_keywords),
        competitor_name,
    )
    return new_keywords


def run_gap_analysis(
    your_keywords_path: Path,
    competitor_data_path: Path,
    competitors: list[str],
    output_path: Path,
    relevance_map: dict[str, float] | None = None,
    top_n: int = 50,
) -> list[GapAnalysisSummary]:
    """Orchestrate keyword gap analysis across all defined competitors.

    Args:
        your_keywords_path: Path to your keyword performance JSON.
        competitor_data_path: Path to competitor data CSV.
        competitors: List of competitor names to analyze.
        output_path: Path to write the keyword_gap.json output.
        relevance_map: Optional keyword-to-relevance mapping.
        top_n: Number of top opportunities per competitor.

    Returns:
        List of GapAnalysisSummary, one per competitor.
    """
    your_keywords = load_your_keywords(your_keywords_path)

    summaries: list[GapAnalysisSummary] = []
    for competitor_name in competitors:
        try:
            comp_keywords = load_competitor_keywords(competitor_data_path, competitor_name)
        except Exception as exc:
            logger.warning(
                "Failed to load keywords for competitor '%s': %s. Skipping (graceful degradation).",
                competitor_name,
                exc,
            )
            continue

        summary = analyze_keyword_gaps(
            your_keywords=your_keywords,
            competitor_keywords=comp_keywords,
            competitor_name=competitor_name,
            relevance_map=relevance_map,
            top_n=top_n,
        )
        summaries.append(summary)

    export_results(summaries, output_path)
    return summaries


def export_results(
    summaries: list[GapAnalysisSummary],
    output_path: Path,
) -> None:
    """Export gap analysis results to JSON.

    Args:
        summaries: List of GapAnalysisSummary results.
        output_path: Destination file path.
    """
    output_data: list[dict[str, Any]] = []
    for summary in summaries:
        opportunities = []
        for opp in summary.top_opportunities:
            opportunities.append(
                {
                    "keyword": opp.keyword,
                    "search_volume": opp.search_volume,
                    "keyword_difficulty": opp.keyword_difficulty,
                    "your_position": opp.your_position,
                    "competitor": opp.competitor,
                    "competitor_position": opp.competitor_position,
                    "gap_type": opp.gap_type.value,
                    "opportunity_score": round(opp.opportunity_score, 2),
                    "business_relevance": opp.business_relevance,
                }
            )

        output_data.append(
            {
                "competitor": summary.competitor,
                "total_keywords_analyzed": summary.total_keywords_analyzed,
                "missing_count": summary.missing_count,
                "weak_count": summary.weak_count,
                "strong_count": summary.strong_count,
                "shared_count": summary.shared_count,
                "unique_count": summary.unique_count,
                "top_opportunities": opportunities,
            }
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)

    logger.info("Exported gap analysis results to %s", output_path)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Competitor keyword gap analysis with opportunity scoring")
    parser.add_argument(
        "--your-keywords",
        type=Path,
        required=True,
        help="Path to your keyword_performance.json",
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
        help="List of competitor names to analyze",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("workspace/analysis/keyword_gap.json"),
        help="Output path for keyword gap JSON",
    )
    parser.add_argument(
        "--top-n",
        type=int,
        default=50,
        help="Number of top opportunities per competitor",
    )
    args = parser.parse_args()

    results = run_gap_analysis(
        your_keywords_path=args.your_keywords,
        competitor_data_path=args.competitor_data,
        competitors=args.competitors,
        output_path=args.output,
        top_n=args.top_n,
    )
    logger.info("Gap analysis complete for %d competitors", len(results))
