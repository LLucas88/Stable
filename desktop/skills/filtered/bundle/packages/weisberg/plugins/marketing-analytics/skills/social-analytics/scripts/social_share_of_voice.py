"""Competitive mention volume and sentiment comparison (Share of Voice).

Computes share of voice metrics by comparing brand mention volume against
competitors across social platforms. Includes sentiment-weighted share of
voice, platform breakdowns, and trend analysis over time.

Usage:
    python social_share_of_voice.py \
        --mentions workspace/raw/social_mentions.csv \
        --competitors workspace/raw/competitor_social.csv \
        --output workspace/analysis/social_benchmarks.json
"""

from __future__ import annotations

import argparse
import json
import logging
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def load_mention_data(
    mentions_path: Path,
    competitors_path: Path,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Load brand mention and competitor social data.

    Parameters
    ----------
    mentions_path : Path
        Path to the brand mentions CSV containing columns: ``date``,
        ``platform``, ``brand``, ``text``, ``engagements``.
    competitors_path : Path
        Path to the competitor social data CSV containing columns:
        ``date``, ``platform``, ``brand``, ``mention_count``,
        ``engagement_count``, ``follower_count``.

    Returns
    -------
    tuple[pd.DataFrame, pd.DataFrame]
        Tuple of (brand_mentions_df, competitor_df).

    Raises
    ------
    FileNotFoundError
        If either CSV file does not exist.
    """
    mentions_path = Path(mentions_path)
    competitors_path = Path(competitors_path)

    if not mentions_path.exists():
        raise FileNotFoundError(f"Brand mentions file not found: {mentions_path}")
    if not competitors_path.exists():
        raise FileNotFoundError(f"Competitor data file not found: {competitors_path}")

    brand_mentions = pd.read_csv(mentions_path)
    competitor_data = pd.read_csv(competitors_path)

    # Parse dates
    if "date" in brand_mentions.columns:
        brand_mentions["date"] = pd.to_datetime(brand_mentions["date"], errors="coerce")
    if "date" in competitor_data.columns:
        competitor_data["date"] = pd.to_datetime(competitor_data["date"], errors="coerce")

    # Validate required columns
    mention_required = {"date", "platform", "brand"}
    competitor_required = {"date", "platform", "brand"}

    missing_mention = mention_required - set(brand_mentions.columns)
    if missing_mention:
        logger.warning("Brand mentions missing columns: %s", missing_mention)

    missing_competitor = competitor_required - set(competitor_data.columns)
    if missing_competitor:
        logger.warning("Competitor data missing columns: %s", missing_competitor)

    logger.info(
        "Loaded %d brand mentions and %d competitor rows",
        len(brand_mentions),
        len(competitor_data),
    )
    return brand_mentions, competitor_data


def _resample_key(time_window: str) -> str:
    """Map time_window label to pandas frequency string."""
    return {"daily": "D", "weekly": "W", "monthly": "MS"}.get(time_window, "W")


def compute_share_of_voice(
    brand_mentions: pd.DataFrame,
    competitor_data: pd.DataFrame,
    time_window: str = "weekly",
) -> dict[str, Any]:
    """Calculate share of voice as brand mentions / total category mentions.

    Parameters
    ----------
    brand_mentions : pd.DataFrame
        Brand mention data with ``date``, ``platform``, and ``brand`` columns.
    competitor_data : pd.DataFrame
        Competitor mention data with the same schema.
    time_window : str
        Aggregation window: ``"daily"``, ``"weekly"``, or ``"monthly"``.
        Defaults to ``"weekly"``.

    Returns
    -------
    dict[str, Any]
        Share of voice results containing:
        - ``overall_sov``: brand share as a percentage
        - ``by_platform``: per-platform SOV breakdown
        - ``by_period``: SOV over time at the specified granularity
        - ``competitor_ranking``: all brands ranked by mention volume
    """
    freq = _resample_key(time_window)

    # Build unified mention counts per brand
    # Brand mentions: each row is a mention, count them
    brand_counts = brand_mentions.groupby("brand").size().reset_index(name="mention_count")

    # Competitor data may already have mention_count aggregated
    if "mention_count" in competitor_data.columns:
        comp_counts = competitor_data.groupby("brand")["mention_count"].sum().reset_index()
    else:
        comp_counts = competitor_data.groupby("brand").size().reset_index(name="mention_count")

    # Combine all brands
    all_counts = pd.concat([brand_counts, comp_counts], ignore_index=True)
    all_counts = all_counts.groupby("brand")["mention_count"].sum().reset_index()
    total_mentions = all_counts["mention_count"].sum()

    # Overall SOV per brand
    all_counts["sov_pct"] = all_counts["mention_count"] / max(total_mentions, 1) * 100
    overall_sov = all_counts.set_index("brand")["sov_pct"].to_dict()
    overall_sov = {str(k): round(float(v), 2) for k, v in overall_sov.items()}

    # By platform
    by_platform: dict[str, dict[str, float]] = {}
    brand_plat = brand_mentions.groupby(["platform", "brand"]).size().reset_index(name="mention_count")

    if "mention_count" in competitor_data.columns:
        comp_plat = competitor_data.groupby(["platform", "brand"])["mention_count"].sum().reset_index()
    else:
        comp_plat = competitor_data.groupby(["platform", "brand"]).size().reset_index(name="mention_count")

    all_plat = pd.concat([brand_plat, comp_plat], ignore_index=True)
    all_plat = all_plat.groupby(["platform", "brand"])["mention_count"].sum().reset_index()

    for platform, plat_df in all_plat.groupby("platform"):
        plat_total = plat_df["mention_count"].sum()
        plat_sov = {}
        for _, row in plat_df.iterrows():
            plat_sov[str(row["brand"])] = round(float(row["mention_count"] / max(plat_total, 1) * 100), 2)
        by_platform[str(platform)] = plat_sov

    # By period
    by_period: list[dict[str, Any]] = []
    brand_mentions_ts = brand_mentions.copy()
    if "date" in brand_mentions_ts.columns:
        brand_mentions_ts = brand_mentions_ts.set_index("date")
        for brand_name in brand_mentions_ts["brand"].unique():
            brand_ts = brand_mentions_ts[brand_mentions_ts["brand"] == brand_name]
            period_counts = brand_ts.resample(freq).size()
            for period, count in period_counts.items():
                by_period.append(
                    {
                        "period": str(period.date()) if hasattr(period, "date") else str(period),
                        "brand": str(brand_name),
                        "mention_count": int(count),
                    }
                )

    # Competitor ranking
    ranking = all_counts.sort_values("mention_count", ascending=False).reset_index(drop=True)
    competitor_ranking = [
        {
            "rank": i + 1,
            "brand": str(row["brand"]),
            "mention_count": int(row["mention_count"]),
            "sov_pct": round(float(row["sov_pct"]), 2),
        }
        for i, (_, row) in enumerate(ranking.iterrows())
    ]

    logger.info("Computed SOV for %d brands", len(all_counts))
    return {
        "overall_sov": overall_sov,
        "by_platform": by_platform,
        "by_period": by_period,
        "competitor_ranking": competitor_ranking,
    }


def compute_sentiment_weighted_sov(
    brand_mentions: pd.DataFrame,
    competitor_data: pd.DataFrame,
    time_window: str = "weekly",
) -> dict[str, Any]:
    """Calculate sentiment-weighted share of voice.

    Weights positive mentions as +1, neutral as 0, and negative as -1
    to produce a net sentiment share that accounts for both volume and
    tone of conversation.

    Parameters
    ----------
    brand_mentions : pd.DataFrame
        Brand mentions with ``sentiment_label`` column populated.
    competitor_data : pd.DataFrame
        Competitor data with ``sentiment_label`` column populated.
    time_window : str
        Aggregation window. Defaults to ``"weekly"``.

    Returns
    -------
    dict[str, Any]
        Sentiment-weighted SOV containing:
        - ``net_sentiment_sov``: sentiment-adjusted share
        - ``by_platform``: per-platform sentiment SOV
        - ``sentiment_comparison``: side-by-side sentiment distribution per brand
    """
    sentiment_weight = {"positive": 1.0, "neutral": 0.0, "negative": -1.0, "uncertain": 0.0}

    def _compute_net_sentiment(df: pd.DataFrame) -> pd.DataFrame:
        """Add a net_sentiment_score column."""
        df = df.copy()
        if "sentiment_label" in df.columns:
            df["_sent_weight"] = df["sentiment_label"].map(sentiment_weight).fillna(0.0)
        else:
            df["_sent_weight"] = 0.0
        return df

    brand_w = _compute_net_sentiment(brand_mentions)
    comp_w = _compute_net_sentiment(competitor_data)

    # Net sentiment score per brand
    brand_net = brand_w.groupby("brand")["_sent_weight"].agg(["sum", "count"]).reset_index()
    brand_net.columns = ["brand", "net_sentiment", "mention_count"]

    if "mention_count" in comp_w.columns:
        # Competitor data is pre-aggregated; use sentiment distribution if available
        comp_net = (
            comp_w.groupby("brand")
            .agg(
                net_sentiment=("_sent_weight", "sum"),
                mention_count=("mention_count", "sum"),
            )
            .reset_index()
        )
    else:
        comp_net = comp_w.groupby("brand")["_sent_weight"].agg(["sum", "count"]).reset_index()
        comp_net.columns = ["brand", "net_sentiment", "mention_count"]

    all_net = pd.concat([brand_net, comp_net], ignore_index=True)
    all_net = (
        all_net.groupby("brand")
        .agg(
            net_sentiment=("net_sentiment", "sum"),
            mention_count=("mention_count", "sum"),
        )
        .reset_index()
    )

    # Net sentiment SOV: share of positive sentiment volume
    total_positive_sentiment = all_net["net_sentiment"][all_net["net_sentiment"] > 0].sum()
    all_net["net_sentiment_sov"] = np.where(
        total_positive_sentiment > 0,
        all_net["net_sentiment"].clip(lower=0) / total_positive_sentiment * 100,
        0.0,
    )

    net_sov = {str(row["brand"]): round(float(row["net_sentiment_sov"]), 2) for _, row in all_net.iterrows()}

    # By platform
    by_platform: dict[str, dict[str, float]] = {}
    brand_plat_w = brand_w.groupby(["platform", "brand"])["_sent_weight"].sum().reset_index()
    brand_plat_w.columns = ["platform", "brand", "net_sentiment"]

    if "mention_count" not in comp_w.columns:
        comp_plat_w = comp_w.groupby(["platform", "brand"])["_sent_weight"].sum().reset_index()
        comp_plat_w.columns = ["platform", "brand", "net_sentiment"]
    else:
        comp_plat_w = (
            comp_w.groupby(["platform", "brand"])
            .agg(
                net_sentiment=("_sent_weight", "sum"),
            )
            .reset_index()
        )

    all_plat_w = pd.concat([brand_plat_w, comp_plat_w], ignore_index=True)
    all_plat_w = all_plat_w.groupby(["platform", "brand"])["net_sentiment"].sum().reset_index()

    for platform, plat_df in all_plat_w.groupby("platform"):
        pos_total = plat_df["net_sentiment"][plat_df["net_sentiment"] > 0].sum()
        plat_sov = {}
        for _, row in plat_df.iterrows():
            share = float(max(row["net_sentiment"], 0) / pos_total * 100) if pos_total > 0 else 0.0
            plat_sov[str(row["brand"])] = round(share, 2)
        by_platform[str(platform)] = plat_sov

    # Sentiment comparison: distribution per brand
    sentiment_comparison: dict[str, dict[str, Any]] = {}

    for source_df, label in [(brand_mentions, "brand"), (competitor_data, "competitor")]:
        if "sentiment_label" not in source_df.columns:
            continue
        for brand_name, brand_df in source_df.groupby("brand"):
            total = len(brand_df)
            if total == 0:
                continue
            dist = brand_df["sentiment_label"].value_counts().to_dict()
            sentiment_comparison[str(brand_name)] = {
                "total_mentions": total,
                "positive_pct": round(dist.get("positive", 0) / total * 100, 1),
                "neutral_pct": round(dist.get("neutral", 0) / total * 100, 1),
                "negative_pct": round(dist.get("negative", 0) / total * 100, 1),
                "net_sentiment": round((dist.get("positive", 0) - dist.get("negative", 0)) / total, 3),
            }

    logger.info("Computed sentiment-weighted SOV for %d brands", len(net_sov))
    return {
        "net_sentiment_sov": net_sov,
        "by_platform": by_platform,
        "sentiment_comparison": sentiment_comparison,
    }


def benchmark_engagement_rates(
    brand_data: pd.DataFrame,
    competitor_data: pd.DataFrame,
) -> dict[str, Any]:
    """Compare engagement rates between brand and competitor accounts.

    Computes engagement rate, posting frequency, and follower growth
    for each brand and ranks them.

    Parameters
    ----------
    brand_data : pd.DataFrame
        Brand social performance data with ``engagements``, ``reach``,
        ``date``, and ``platform`` columns.
    competitor_data : pd.DataFrame
        Competitor social performance data with the same schema.

    Returns
    -------
    dict[str, Any]
        Benchmarking results containing:
        - ``engagement_rate_ranking``: brands ranked by engagement rate
        - ``posting_frequency``: posts per week per brand
        - ``follower_growth``: period-over-period follower change
        - ``content_mix``: distribution of content types per brand
    """
    # Combine data
    brand_data = brand_data.copy()
    competitor_data = competitor_data.copy()

    brand_data["_source"] = "brand"
    competitor_data["_source"] = "competitor"

    all_data = pd.concat([brand_data, competitor_data], ignore_index=True)

    if "date" in all_data.columns:
        all_data["date"] = pd.to_datetime(all_data["date"], errors="coerce")

    # Engagement rate ranking
    engagement_ranking: list[dict[str, Any]] = []

    for brand_name, brand_df in all_data.groupby("brand"):
        # Compute engagement rate
        if "engagement_rate" in brand_df.columns:
            avg_er = float(brand_df["engagement_rate"].mean())
        elif "engagements" in brand_df.columns and "reach" in brand_df.columns:
            reach = brand_df["reach"].replace(0, np.nan)
            avg_er = float((brand_df["engagements"] / reach).mean())
        elif "engagements" in brand_df.columns and "engagement_count" not in brand_df.columns:
            avg_er = 0.0
        elif "engagement_count" in brand_df.columns and "follower_count" in brand_df.columns:
            followers = brand_df["follower_count"].replace(0, np.nan)
            avg_er = float((brand_df["engagement_count"] / followers).mean())
        else:
            avg_er = 0.0

        engagement_ranking.append(
            {
                "brand": str(brand_name),
                "avg_engagement_rate": round(avg_er, 6),
                "total_posts": int(len(brand_df)),
            }
        )

    engagement_ranking.sort(key=lambda x: x["avg_engagement_rate"], reverse=True)
    for i, item in enumerate(engagement_ranking):
        item["rank"] = i + 1

    # Posting frequency (posts per week)
    posting_frequency: dict[str, float] = {}
    if "date" in all_data.columns:
        for brand_name, brand_df in all_data.groupby("brand"):
            brand_df = brand_df.dropna(subset=["date"])
            if len(brand_df) < 2:
                posting_frequency[str(brand_name)] = float(len(brand_df))
                continue
            date_range = (brand_df["date"].max() - brand_df["date"].min()).days
            weeks = max(date_range / 7, 1)
            posting_frequency[str(brand_name)] = round(float(len(brand_df) / weeks), 1)

    # Follower growth
    follower_growth: dict[str, Any] = {}
    follower_col = "follower_count" if "follower_count" in all_data.columns else None
    if follower_col and "date" in all_data.columns:
        for brand_name, brand_df in all_data.groupby("brand"):
            brand_df = brand_df.dropna(subset=["date", follower_col]).sort_values("date")
            if len(brand_df) < 2:
                continue
            first = float(brand_df[follower_col].iloc[0])
            last = float(brand_df[follower_col].iloc[-1])
            if first > 0:
                growth_pct = round((last - first) / first * 100, 2)
            else:
                growth_pct = 0.0
            follower_growth[str(brand_name)] = {
                "start": int(first),
                "end": int(last),
                "growth_pct": growth_pct,
            }

    # Content mix
    content_mix: dict[str, dict[str, float]] = {}
    type_col = None
    for candidate in ("post_type", "content_type", "type"):
        if candidate in all_data.columns:
            type_col = candidate
            break

    if type_col:
        for brand_name, brand_df in all_data.groupby("brand"):
            total = len(brand_df)
            if total == 0:
                continue
            dist = brand_df[type_col].value_counts()
            content_mix[str(brand_name)] = {str(k): round(float(v / total * 100), 1) for k, v in dist.items()}

    logger.info("Benchmarked engagement rates for %d brands", len(engagement_ranking))
    return {
        "engagement_rate_ranking": engagement_ranking,
        "posting_frequency": posting_frequency,
        "follower_growth": follower_growth,
        "content_mix": content_mix,
    }


def analyze_competitor_content_strategy(
    competitor_data: pd.DataFrame,
    top_n: int = 10,
) -> dict[str, Any]:
    """Identify content strategies that drive outsized engagement for competitors.

    Analyzes top-performing competitor posts to extract patterns in
    content type, topic, timing, and format.

    Parameters
    ----------
    competitor_data : pd.DataFrame
        Competitor post-level data with ``post_type``, ``topic``,
        ``engagement_rate``, and ``date`` columns.
    top_n : int
        Number of top posts per competitor to analyze. Defaults to 10.

    Returns
    -------
    dict[str, Any]
        Strategy insights containing:
        - ``top_content_types``: best-performing formats per competitor
        - ``top_topics``: highest-engagement topics per competitor
        - ``posting_patterns``: day/time patterns for top posts
        - ``actionable_insights``: summary recommendations
    """
    comp = competitor_data.copy()

    if "date" in comp.columns:
        comp["date"] = pd.to_datetime(comp["date"], errors="coerce")

    # Determine engagement metric column
    eng_col = None
    for candidate in ("engagement_rate", "engagement_count", "engagements"):
        if candidate in comp.columns:
            eng_col = candidate
            break

    top_content_types: dict[str, dict[str, float]] = {}
    top_topics: dict[str, list[dict[str, Any]]] = {}
    posting_patterns: dict[str, dict[str, Any]] = {}
    actionable_insights: list[str] = []

    type_col = None
    for candidate in ("post_type", "content_type", "type"):
        if candidate in comp.columns:
            type_col = candidate
            break

    topic_col = "topic" if "topic" in comp.columns else None

    for brand_name, brand_df in comp.groupby("brand"):
        brand_str = str(brand_name)

        # Top content types by engagement
        if type_col and eng_col:
            type_eng = brand_df.groupby(type_col)[eng_col].mean().sort_values(ascending=False)
            top_content_types[brand_str] = {str(k): round(float(v), 6) for k, v in type_eng.items()}

        # Top topics
        if topic_col and eng_col:
            topic_eng = (
                brand_df.groupby(topic_col)
                .agg(
                    avg_engagement=(eng_col, "mean"),
                    post_count=(eng_col, "count"),
                )
                .sort_values("avg_engagement", ascending=False)
                .head(5)
            )
            top_topics[brand_str] = [
                {
                    "topic": str(idx),
                    "avg_engagement": round(float(row["avg_engagement"]), 6),
                    "post_count": int(row["post_count"]),
                }
                for idx, row in topic_eng.iterrows()
            ]

        # Posting patterns for top posts
        if eng_col and "date" in brand_df.columns:
            top_posts = brand_df.nlargest(top_n, eng_col)
            if not top_posts.empty:
                day_dist = top_posts["date"].dt.day_name().value_counts().to_dict()
                hour_col = "post_hour" if "post_hour" in top_posts.columns else None
                hour_dist = {}
                if hour_col:
                    hour_dist = top_posts[hour_col].value_counts().to_dict()
                elif "date" in top_posts.columns:
                    hour_dist = top_posts["date"].dt.hour.value_counts().to_dict()

                posting_patterns[brand_str] = {
                    "top_days": {str(k): int(v) for k, v in day_dist.items()},
                    "top_hours": {str(k): int(v) for k, v in hour_dist.items()},
                }

    # Generate actionable insights
    if top_content_types:
        # Find the most common top content type across competitors
        all_top_types: list[str] = []
        for brand_types in top_content_types.values():
            if brand_types:
                best = max(brand_types.items(), key=lambda x: x[1])
                all_top_types.append(best[0])
        if all_top_types:
            most_common_type = Counter(all_top_types).most_common(1)[0][0]
            actionable_insights.append(
                f"'{most_common_type}' is the highest-engagement content type "
                f"across competitors. Consider increasing {most_common_type} "
                f"production."
            )

    if posting_patterns:
        all_days: list[str] = []
        for pp in posting_patterns.values():
            days = pp.get("top_days", {})
            if days:
                best_day = max(days.items(), key=lambda x: x[1])[0]
                all_days.append(best_day)
        if all_days:
            best_day = Counter(all_days).most_common(1)[0][0]
            actionable_insights.append(
                f"Top competitor posts cluster on {best_day}. Test posting on {best_day} for higher reach."
            )

    logger.info("Analyzed content strategy for %d competitors", len(top_content_types))
    return {
        "top_content_types": top_content_types,
        "top_topics": top_topics,
        "posting_patterns": posting_patterns,
        "actionable_insights": actionable_insights,
    }


def compute_sov_trends(
    sov_data: dict[str, Any],
    lookback_periods: int = 12,
) -> dict[str, Any]:
    """Track share of voice trends over time to measure campaign impact.

    Computes period-over-period changes and identifies inflection points
    that may correlate with campaign launches or PR events.

    Parameters
    ----------
    sov_data : dict[str, Any]
        Share of voice data from ``compute_share_of_voice`` with
        ``by_period`` time series.
    lookback_periods : int
        Number of historical periods to include. Defaults to 12.

    Returns
    -------
    dict[str, Any]
        Trend analysis containing:
        - ``trend_direction``: rising / stable / declining
        - ``period_over_period_change``: percentage change per period
        - ``inflection_points``: dates where SOV changed significantly
        - ``correlation_events``: potential campaign/event correlations
    """
    by_period = sov_data.get("by_period", [])

    if not by_period:
        return {
            "trend_direction": {},
            "period_over_period_change": {},
            "inflection_points": [],
            "correlation_events": [],
        }

    # Convert to DataFrame for easier manipulation
    period_df = pd.DataFrame(by_period)
    if "period" not in period_df.columns or "brand" not in period_df.columns:
        return {
            "trend_direction": {},
            "period_over_period_change": {},
            "inflection_points": [],
            "correlation_events": [],
        }

    period_df["period"] = pd.to_datetime(period_df["period"], errors="coerce")
    period_df = period_df.dropna(subset=["period"]).sort_values("period")

    # Compute total mentions per period for SOV calculation
    period_totals = period_df.groupby("period")["mention_count"].sum().reset_index()
    period_totals.columns = ["period", "total_mentions"]
    period_df = period_df.merge(period_totals, on="period", how="left")
    period_df["sov_pct"] = period_df["mention_count"] / period_df["total_mentions"].replace(0, np.nan) * 100

    trend_direction: dict[str, str] = {}
    period_over_period_change: dict[str, list[dict[str, Any]]] = {}
    inflection_points: list[dict[str, Any]] = []

    for brand_name, brand_df in period_df.groupby("brand"):
        brand_str = str(brand_name)
        brand_df = brand_df.sort_values("period").tail(lookback_periods)

        if len(brand_df) < 2:
            trend_direction[brand_str] = "stable"
            continue

        sov_values = brand_df["sov_pct"].values

        # Period-over-period changes
        changes: list[dict[str, Any]] = []
        for j in range(1, len(brand_df)):
            prev = float(sov_values[j - 1])
            curr = float(sov_values[j])
            pct_change = (curr - prev) / prev * 100 if prev != 0 else 0.0
            period_str = (
                str(brand_df.iloc[j]["period"].date())
                if hasattr(brand_df.iloc[j]["period"], "date")
                else str(brand_df.iloc[j]["period"])
            )
            changes.append(
                {
                    "period": period_str,
                    "sov_pct": round(curr, 2),
                    "change_pct": round(pct_change, 2),
                }
            )

        period_over_period_change[brand_str] = changes

        # Trend direction via simple linear slope
        try:
            from scipy.stats import linregress

            x = np.arange(len(sov_values))
            slope, _, _, p_value, _ = linregress(x, sov_values)
            if p_value < 0.1:
                if slope > 0.5:
                    trend_direction[brand_str] = "rising"
                elif slope < -0.5:
                    trend_direction[brand_str] = "declining"
                else:
                    trend_direction[brand_str] = "stable"
            else:
                trend_direction[brand_str] = "stable"
        except (ImportError, ValueError):
            # Fallback: compare first half vs second half
            mid = len(sov_values) // 2
            first_avg = float(sov_values[:mid].mean())
            second_avg = float(sov_values[mid:].mean())
            if second_avg > first_avg * 1.1:
                trend_direction[brand_str] = "rising"
            elif second_avg < first_avg * 0.9:
                trend_direction[brand_str] = "declining"
            else:
                trend_direction[brand_str] = "stable"

        # Inflection points: periods with > 2 std dev change
        if len(changes) > 2:
            change_values = [c["change_pct"] for c in changes]
            mean_change = np.mean(change_values)
            std_change = np.std(change_values)
            if std_change > 0:
                for c in changes:
                    z = abs(c["change_pct"] - mean_change) / std_change
                    if z > 2.0:
                        inflection_points.append(
                            {
                                "brand": brand_str,
                                "period": c["period"],
                                "sov_change_pct": c["change_pct"],
                                "z_score": round(float(z), 2),
                            }
                        )

    logger.info("Computed SOV trends for %d brands", len(trend_direction))
    return {
        "trend_direction": trend_direction,
        "period_over_period_change": period_over_period_change,
        "inflection_points": inflection_points,
        "correlation_events": [],  # Populated when event data is available
    }


def generate_benchmarks_report(
    sov: dict[str, Any],
    sentiment_sov: dict[str, Any],
    engagement_benchmarks: dict[str, Any],
    content_strategy: dict[str, Any],
    sov_trends: dict[str, Any],
) -> dict[str, Any]:
    """Assemble the full competitive benchmarking report.

    Parameters
    ----------
    sov : dict[str, Any]
        Share of voice results.
    sentiment_sov : dict[str, Any]
        Sentiment-weighted SOV results.
    engagement_benchmarks : dict[str, Any]
        Engagement rate benchmarking results.
    content_strategy : dict[str, Any]
        Competitor content strategy insights.
    sov_trends : dict[str, Any]
        SOV trend analysis.

    Returns
    -------
    dict[str, Any]
        Unified benchmarking report suitable for JSON serialization.
    """
    # Build executive summary
    top_brand = None
    if sov.get("competitor_ranking"):
        top_brand = sov["competitor_ranking"][0]["brand"]

    top_engagement_brand = None
    if engagement_benchmarks.get("engagement_rate_ranking"):
        top_engagement_brand = engagement_benchmarks["engagement_rate_ranking"][0]["brand"]

    summary: dict[str, Any] = {
        "sov_leader": top_brand,
        "engagement_leader": top_engagement_brand,
        "total_brands_tracked": len(sov.get("overall_sov", {})),
        "trend_summary": sov_trends.get("trend_direction", {}),
    }

    # Add actionable insights from content strategy
    insights = content_strategy.get("actionable_insights", [])

    report: dict[str, Any] = {
        "summary": summary,
        "share_of_voice": sov,
        "sentiment_weighted_sov": sentiment_sov,
        "engagement_benchmarks": engagement_benchmarks,
        "competitor_content_strategy": content_strategy,
        "sov_trends": sov_trends,
        "actionable_insights": insights,
    }

    logger.info("Generated competitive benchmarking report")
    return report


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Compute share of voice and competitive benchmarks.",
    )
    parser.add_argument(
        "--mentions",
        type=Path,
        default=Path("workspace/raw/social_mentions.csv"),
        help="Path to the brand mentions CSV.",
    )
    parser.add_argument(
        "--competitors",
        type=Path,
        default=Path("workspace/raw/competitor_social.csv"),
        help="Path to the competitor social data CSV.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("workspace/analysis/social_benchmarks.json"),
        help="Output path for the benchmarking JSON.",
    )
    parser.add_argument(
        "--time-window",
        type=str,
        default="weekly",
        choices=["daily", "weekly", "monthly"],
        help="Aggregation window for SOV calculations.",
    )
    return parser.parse_args()


def main() -> None:
    """Entry point for share of voice and competitive benchmarking."""
    args = parse_args()

    brand_mentions, competitor_data = load_mention_data(
        args.mentions,
        args.competitors,
    )

    sov = compute_share_of_voice(brand_mentions, competitor_data, args.time_window)
    sentiment_sov = compute_sentiment_weighted_sov(
        brand_mentions,
        competitor_data,
        args.time_window,
    )
    engagement = benchmark_engagement_rates(brand_mentions, competitor_data)
    strategy = analyze_competitor_content_strategy(competitor_data)
    trends = compute_sov_trends(sov)

    report = generate_benchmarks_report(sov, sentiment_sov, engagement, strategy, trends)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(report, f, indent=2, default=str)

    logger.info("Benchmarking report written to %s", args.output)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
