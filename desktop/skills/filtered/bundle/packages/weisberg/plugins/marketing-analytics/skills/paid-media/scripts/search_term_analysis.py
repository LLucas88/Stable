"""Search term analysis for paid media campaigns."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from difflib import SequenceMatcher
from typing import Optional

try:
    import pandas as pd
except ModuleNotFoundError:  # pragma: no cover
    pd = None  # type: ignore[assignment]


DEFAULT_CPA_MULTIPLIER = 3.0
DEFAULT_MIN_IMPRESSIONS = 50
DEFAULT_MIN_SPEND = Decimal("5.00")


@dataclass
class WastedTerm:
    search_term: str
    campaign_id: str
    ad_group_id: str
    impressions: int
    clicks: int
    spend: Decimal
    conversions: int
    cpa: Optional[Decimal]
    waste_reason: str


@dataclass
class NegativeKeywordRecommendation:
    keyword: str
    match_type: str
    campaign_id: str
    cluster_label: str
    estimated_monthly_waste: Decimal
    term_count: int
    contributing_terms: list[str]


def _require_pandas():
    if pd is None:
        raise ImportError("pandas is required for search term analysis")
    return pd


def _to_decimal(value: object) -> Decimal:
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0")


def load_search_terms(
    file_path: str,
    platform: str,
) -> "pd.DataFrame":
    pandas = _require_pandas()
    frame = pandas.read_csv(file_path)
    mapping = {
        "google": {
            "Search term": "search_term",
            "Campaign ID": "campaign_id",
            "Ad group ID": "ad_group_id",
            "Cost": "spend",
            "Conversions": "conversions",
        },
        "microsoft": {
            "search query": "search_term",
            "campaign id": "campaign_id",
            "ad group id": "ad_group_id",
            "spend": "spend",
            "conversions": "conversions",
        },
    }
    frame = frame.rename(columns=mapping.get(platform, {}))
    for column in ("search_term", "campaign_id", "ad_group_id", "impressions", "clicks", "spend", "conversions"):
        if column not in frame.columns:
            frame[column] = 0 if column not in {"search_term", "campaign_id", "ad_group_id"} else ""
    frame["spend"] = frame["spend"].apply(_to_decimal)
    frame["platform"] = platform
    return frame


def flag_zero_conversion_terms(
    df: "pd.DataFrame",
    min_impressions: int = DEFAULT_MIN_IMPRESSIONS,
    min_spend: Decimal = DEFAULT_MIN_SPEND,
) -> "pd.DataFrame":
    return df[
        (df["conversions"].astype(float) <= 0)
        & (df["impressions"].astype(int) >= min_impressions)
        & (df["spend"].apply(_to_decimal) >= min_spend)
    ].copy()


def flag_high_cpa_terms(
    df: "pd.DataFrame",
    campaign_avg_cpa: Decimal,
    cpa_multiplier: float = DEFAULT_CPA_MULTIPLIER,
) -> "pd.DataFrame":
    working = df.copy()
    working["cpa"] = working.apply(
        lambda row: (
            (_to_decimal(row["spend"]) / Decimal(str(int(row["conversions"])))) if int(row["conversions"]) > 0 else None
        ),
        axis=1,
    )
    threshold = campaign_avg_cpa * Decimal(str(cpa_multiplier))
    return working[working["cpa"].apply(lambda value: value is not None and value > threshold)].copy()


def flag_irrelevant_terms(
    df: "pd.DataFrame",
    brand_terms: list[str] | None = None,
    competitor_terms: list[str] | None = None,
) -> "pd.DataFrame":
    brand_terms = [term.lower() for term in (brand_terms or [])]
    competitor_terms = [term.lower() for term in (competitor_terms or [])]

    def is_irrelevant(term: str) -> bool:
        lowered = term.lower()
        if any(competitor in lowered for competitor in competitor_terms):
            return True
        return any(SequenceMatcher(None, lowered, brand).ratio() >= 0.9 for brand in brand_terms if brand != lowered)

    return df[df["search_term"].astype(str).apply(is_irrelevant)].copy()


def identify_wasted_terms(
    df: "pd.DataFrame",
    campaign_avg_cpa: Decimal,
    min_impressions: int = DEFAULT_MIN_IMPRESSIONS,
    min_spend: Decimal = DEFAULT_MIN_SPEND,
    cpa_multiplier: float = DEFAULT_CPA_MULTIPLIER,
    brand_terms: list[str] | None = None,
    competitor_terms: list[str] | None = None,
) -> list[WastedTerm]:
    flagged = []
    frames = [
        ("zero_conversions", flag_zero_conversion_terms(df, min_impressions=min_impressions, min_spend=min_spend)),
        ("high_cpa", flag_high_cpa_terms(df, campaign_avg_cpa=campaign_avg_cpa, cpa_multiplier=cpa_multiplier)),
        ("irrelevant_term", flag_irrelevant_terms(df, brand_terms=brand_terms, competitor_terms=competitor_terms)),
    ]
    seen = set()
    for reason, frame in frames:
        for _, row in frame.iterrows():
            key = (row["search_term"], row["campaign_id"], row["ad_group_id"])
            if key in seen:
                continue
            seen.add(key)
            conversions = int(row["conversions"])
            cpa = (_to_decimal(row["spend"]) / Decimal(str(conversions))) if conversions > 0 else None
            flagged.append(
                WastedTerm(
                    search_term=str(row["search_term"]),
                    campaign_id=str(row["campaign_id"]),
                    ad_group_id=str(row["ad_group_id"]),
                    impressions=int(row["impressions"]),
                    clicks=int(row["clicks"]),
                    spend=_to_decimal(row["spend"]),
                    conversions=conversions,
                    cpa=cpa,
                    waste_reason=reason,
                )
            )
    return sorted(flagged, key=lambda item: item.spend, reverse=True)


def cluster_terms(
    terms: list[str],
    n_clusters: int | None = None,
) -> dict[str, list[str]]:
    del n_clusters
    stopwords = {"the", "a", "for", "to", "and", "of", "in"}
    clusters: dict[str, list[str]] = {}
    for term in terms:
        tokens = [token for token in term.lower().split() if token not in stopwords]
        label = tokens[0] if tokens else term.lower()
        clusters.setdefault(label, []).append(term)
    return clusters


def recommend_match_type(term: str) -> str:
    return "exact" if len(term.split()) >= 2 else "phrase"


def estimate_monthly_waste(
    terms: list[WastedTerm],
    lookback_days: int = 30,
) -> Decimal:
    total_spend = sum((term.spend for term in terms), Decimal("0"))
    if lookback_days <= 0:
        return total_spend
    return total_spend * Decimal("30") / Decimal(str(lookback_days))


def generate_negative_keywords(
    wasted_terms: list[WastedTerm],
    lookback_days: int = 30,
) -> list[NegativeKeywordRecommendation]:
    if not wasted_terms:
        return []
    grouped_by_campaign: dict[str, list[WastedTerm]] = {}
    for term in wasted_terms:
        grouped_by_campaign.setdefault(term.campaign_id, []).append(term)

    recommendations: list[NegativeKeywordRecommendation] = []
    for campaign_id, terms in grouped_by_campaign.items():
        clusters = cluster_terms([term.search_term for term in terms])
        for label, cluster_terms_list in clusters.items():
            cluster_items = [term for term in terms if term.search_term in cluster_terms_list]
            keyword = min(cluster_terms_list, key=len)
            recommendations.append(
                NegativeKeywordRecommendation(
                    keyword=keyword,
                    match_type=recommend_match_type(keyword),
                    campaign_id=campaign_id,
                    cluster_label=label,
                    estimated_monthly_waste=estimate_monthly_waste(cluster_items, lookback_days=lookback_days),
                    term_count=len(cluster_items),
                    contributing_terms=cluster_terms_list,
                )
            )
    return sorted(recommendations, key=lambda item: item.estimated_monthly_waste, reverse=True)
