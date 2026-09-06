"""Topic classification, content type benchmarking, and timing analysis.

Analyzes normalized social post data to identify high-performing content
types, optimal posting times, topic-level engagement patterns, and
posting cadence effects.

Usage:
    python social_content_analysis.py \
        --input workspace/processed/unified_social_performance.csv \
        --output workspace/analysis/social_content_analysis.json
"""

from __future__ import annotations

import argparse
import json
import logging
from collections import Counter
from pathlib import Path
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Content type definitions
# ---------------------------------------------------------------------------

CONTENT_TYPES: list[str] = [
    "video",
    "carousel",
    "image",
    "text",
    "story",
    "reel",
    "short",
    "poll",
]

PLATFORMS_BY_CONTENT_TYPE: dict[str, list[str]] = {
    "video": ["meta", "linkedin", "tiktok", "youtube", "x"],
    "carousel": ["meta", "linkedin"],
    "image": ["meta", "linkedin", "tiktok", "youtube", "x"],
    "text": ["linkedin", "x"],
    "story": ["meta", "linkedin"],
    "reel": ["meta", "tiktok"],
    "short": ["youtube"],
    "poll": ["linkedin", "x"],
}


def classify_topics(
    df: pd.DataFrame,
    text_column: str = "post_text",
    method: str = "tfidf_clustering",
    n_topics: int = 10,
) -> pd.DataFrame:
    """Classify posts into topic clusters based on text content.

    Uses keyword extraction and semantic clustering to assign each post
    a topic label. Supports TF-IDF with K-means clustering or LDA topic
    modeling.

    Parameters
    ----------
    df : pd.DataFrame
        Social post dataframe with a text column.
    text_column : str
        Name of the column containing post text. Defaults to ``"post_text"``.
    method : str
        Clustering method: ``"tfidf_clustering"`` or ``"lda"``.
        Defaults to ``"tfidf_clustering"``.
    n_topics : int
        Number of topic clusters to create. Defaults to 10.

    Returns
    -------
    pd.DataFrame
        Input dataframe with ``topic_id``, ``topic_label``, and
        ``topic_keywords`` columns added.
    """
    df = df.copy()

    # Handle missing text column gracefully
    if text_column not in df.columns:
        logger.warning("Text column '%s' not found. Assigning default topic.", text_column)
        df["topic_id"] = 0
        df["topic_label"] = "unknown"
        df["topic_keywords"] = ""
        return df

    # Clean texts, replacing NaN with empty string
    texts = df[text_column].fillna("").astype(str).tolist()
    non_empty_mask = [len(t.strip()) > 0 for t in texts]

    if sum(non_empty_mask) < n_topics:
        logger.warning(
            "Fewer non-empty texts (%d) than requested topics (%d). Reducing n_topics.",
            sum(non_empty_mask),
            n_topics,
        )
        n_topics = max(1, sum(non_empty_mask))

    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.cluster import KMeans
        from sklearn.decomposition import LatentDirichletAllocation

        if method == "tfidf_clustering":
            vectorizer = TfidfVectorizer(
                max_features=5000,
                stop_words="english",
                min_df=2,
                max_df=0.95,
            )
            # Only fit on non-empty texts
            non_empty_texts = [t for t, m in zip(texts, non_empty_mask) if m]
            if len(non_empty_texts) < n_topics:
                n_topics = max(1, len(non_empty_texts))

            tfidf_matrix = vectorizer.fit_transform(non_empty_texts)
            feature_names = vectorizer.get_feature_names_out()

            km = KMeans(n_clusters=n_topics, random_state=42, n_init=10)
            cluster_labels = km.fit_predict(tfidf_matrix)

            # Extract top keywords per cluster
            order_centroids = km.cluster_centers_.argsort()[:, ::-1]
            topic_keywords_map: dict[int, str] = {}
            for i in range(n_topics):
                top_words = [feature_names[idx] for idx in order_centroids[i, :5]]
                topic_keywords_map[i] = ", ".join(top_words)

            # Assign labels to all rows
            topic_ids = pd.Series(-1, index=df.index, dtype=int)
            topic_kw = pd.Series("", index=df.index)

            non_empty_idx = [i for i, m in enumerate(non_empty_mask) if m]
            for j, idx in enumerate(non_empty_idx):
                topic_ids.iloc[idx] = int(cluster_labels[j])
                topic_kw.iloc[idx] = topic_keywords_map.get(int(cluster_labels[j]), "")

            # Assign empty texts to topic -1
            df["topic_id"] = topic_ids.values
            df["topic_keywords"] = topic_kw.values
            df["topic_label"] = df["topic_id"].apply(lambda x: f"topic_{x}" if x >= 0 else "uncategorized")

        elif method == "lda":
            vectorizer = TfidfVectorizer(
                max_features=5000,
                stop_words="english",
                min_df=2,
                max_df=0.95,
            )
            non_empty_texts = [t for t, m in zip(texts, non_empty_mask) if m]
            if len(non_empty_texts) < n_topics:
                n_topics = max(1, len(non_empty_texts))

            tfidf_matrix = vectorizer.fit_transform(non_empty_texts)
            feature_names = vectorizer.get_feature_names_out()

            lda = LatentDirichletAllocation(n_components=n_topics, random_state=42)
            lda_output = lda.fit_transform(tfidf_matrix)
            cluster_labels = lda_output.argmax(axis=1)

            topic_keywords_map = {}
            for i, topic in enumerate(lda.components_):
                top_indices = topic.argsort()[::-1][:5]
                top_words = [feature_names[idx] for idx in top_indices]
                topic_keywords_map[i] = ", ".join(top_words)

            topic_ids = pd.Series(-1, index=df.index, dtype=int)
            topic_kw = pd.Series("", index=df.index)

            non_empty_idx = [i for i, m in enumerate(non_empty_mask) if m]
            for j, idx in enumerate(non_empty_idx):
                topic_ids.iloc[idx] = int(cluster_labels[j])
                topic_kw.iloc[idx] = topic_keywords_map.get(int(cluster_labels[j]), "")

            df["topic_id"] = topic_ids.values
            df["topic_keywords"] = topic_kw.values
            df["topic_label"] = df["topic_id"].apply(lambda x: f"topic_{x}" if x >= 0 else "uncategorized")
        else:
            raise ValueError(f"Unsupported method: {method}")

    except ImportError:
        logger.warning("scikit-learn not available. Using simple keyword-based topic assignment.")
        # Fallback: assign topics based on most frequent words
        all_words: list[str] = []
        for t in texts:
            all_words.extend(t.lower().split())
        word_counts = Counter(all_words)
        # Remove very common short words
        common_words = {w for w, _ in word_counts.most_common(20) if len(w) <= 3}
        top_keywords = [w for w, _ in word_counts.most_common(n_topics * 5) if w not in common_words and len(w) > 3][
            :n_topics
        ]

        def assign_topic(text: str) -> int:
            text_lower = text.lower()
            for i, kw in enumerate(top_keywords):
                if kw in text_lower:
                    return i
            return -1

        df["topic_id"] = df[text_column].fillna("").apply(assign_topic)
        df["topic_label"] = df["topic_id"].apply(lambda x: f"topic_{x}" if x >= 0 else "uncategorized")
        df["topic_keywords"] = df["topic_id"].apply(lambda x: top_keywords[x] if 0 <= x < len(top_keywords) else "")

    logger.info("Classified %d posts into %d topics", len(df), n_topics)
    return df


def benchmark_content_types(
    df: pd.DataFrame,
    metric: str = "engagement_rate",
) -> dict[str, Any]:
    """Compare performance across content types within each platform.

    Computes median, mean, and percentile distributions of the target
    metric for each content type on each platform.

    Parameters
    ----------
    df : pd.DataFrame
        Normalized social post dataframe with ``platform``, ``post_type``,
        and the specified metric column.
    metric : str
        Metric to benchmark. Defaults to ``"engagement_rate"``.

    Returns
    -------
    dict[str, Any]
        Nested dictionary: ``{platform: {content_type: {mean, median, p25, p75, count}}}``.
    """
    if metric not in df.columns:
        logger.warning("Metric '%s' not found in dataframe.", metric)
        return {}

    post_type_col = "post_type"
    if post_type_col not in df.columns:
        # Try alternative column names
        for alt in ("content_type", "type", "format"):
            if alt in df.columns:
                post_type_col = alt
                break
        else:
            logger.warning("No post type column found.")
            return {}

    results: dict[str, Any] = {}

    for platform, platform_df in df.groupby("platform"):
        platform_str = str(platform)
        results[platform_str] = {}

        for content_type, ct_df in platform_df.groupby(post_type_col):
            ct_str = str(content_type)
            values = ct_df[metric].dropna()

            if len(values) == 0:
                continue

            results[platform_str][ct_str] = {
                "mean": float(values.mean()),
                "median": float(values.median()),
                "p25": float(values.quantile(0.25)),
                "p75": float(values.quantile(0.75)),
                "count": int(len(values)),
                "std": float(values.std()) if len(values) > 1 else 0.0,
            }

    logger.info("Benchmarked content types across %d platforms", len(results))
    return results


def analyze_posting_cadence(
    df: pd.DataFrame,
    platform: str | None = None,
) -> dict[str, Any]:
    """Analyze engagement rate as a function of posting frequency.

    Identifies the optimal posting frequency per platform by measuring
    how engagement rate changes at different weekly posting volumes.
    Detects diminishing-returns thresholds.

    Parameters
    ----------
    df : pd.DataFrame
        Normalized social post dataframe with ``date``, ``platform``,
        and ``engagement_rate`` columns.
    platform : str | None
        Specific platform to analyze. If None, analyzes all platforms.

    Returns
    -------
    dict[str, Any]
        Dictionary with posting frequency buckets and corresponding
        engagement rate statistics, including the identified optimal
        frequency and diminishing-returns threshold.
    """
    if "date" not in df.columns or "engagement_rate" not in df.columns:
        logger.warning("Required columns (date, engagement_rate) not found.")
        return {}

    df = df.copy()
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"])
    df["week"] = df["date"].dt.isocalendar().week.astype(int)
    df["year"] = df["date"].dt.year

    if platform is not None:
        df = df[df["platform"] == platform]

    platforms_to_analyze = df["platform"].unique() if platform is None else [platform]
    results: dict[str, Any] = {}

    for plat in platforms_to_analyze:
        plat_df = df[df["platform"] == plat]
        plat_str = str(plat)

        # Count posts per week
        weekly_counts = (
            plat_df.groupby(["year", "week"])
            .agg(
                post_count=("engagement_rate", "count"),
                avg_engagement_rate=("engagement_rate", "mean"),
            )
            .reset_index()
        )

        if weekly_counts.empty:
            continue

        # Bucket by posting frequency
        buckets = []
        freq_values = sorted(weekly_counts["post_count"].unique())

        for freq in freq_values:
            bucket_data = weekly_counts[weekly_counts["post_count"] == freq]
            avg_er = float(bucket_data["avg_engagement_rate"].mean())
            buckets.append(
                {
                    "posts_per_week": int(freq),
                    "weeks_observed": int(len(bucket_data)),
                    "avg_engagement_rate": avg_er,
                }
            )

        # Find optimal frequency (highest avg engagement rate)
        if buckets:
            optimal = max(buckets, key=lambda b: b["avg_engagement_rate"])
            optimal_freq = optimal["posts_per_week"]

            # Detect diminishing returns: first frequency after peak where
            # engagement drops and doesn't recover
            diminishing_threshold = None
            peak_found = False
            for b in sorted(buckets, key=lambda x: x["posts_per_week"]):
                if b["posts_per_week"] == optimal_freq:
                    peak_found = True
                elif peak_found and b["avg_engagement_rate"] < optimal["avg_engagement_rate"] * 0.9:
                    diminishing_threshold = b["posts_per_week"]
                    break
        else:
            optimal_freq = 0
            diminishing_threshold = None

        results[plat_str] = {
            "frequency_buckets": buckets,
            "optimal_frequency": optimal_freq,
            "diminishing_returns_threshold": diminishing_threshold,
            "total_weeks_analyzed": int(len(weekly_counts)),
        }

    logger.info("Cadence analysis completed for %d platforms", len(results))
    return results


def compute_best_posting_times(
    df: pd.DataFrame,
    timezone: str = "UTC",
    metric: str = "engagement_rate",
) -> dict[str, Any]:
    """Build engagement heatmaps by platform, day of week, and hour.

    Produces a matrix of average engagement rates for each
    (platform, day_of_week, hour) combination to identify optimal
    posting windows.

    Parameters
    ----------
    df : pd.DataFrame
        Normalized social post dataframe with ``date``, ``platform``,
        ``post_hour`` (0-23), and the specified metric column.
    timezone : str
        Timezone for hour bucketing. Defaults to ``"UTC"``.
        Adjusts for audience timezone distribution when available.
    metric : str
        Metric to aggregate. Defaults to ``"engagement_rate"``.

    Returns
    -------
    dict[str, Any]
        Nested dictionary:
        ``{platform: {day_of_week: {hour: avg_engagement_rate}}}``.
        Includes ``top_3_windows`` per platform with day/hour and
        average metric value.
    """
    if metric not in df.columns:
        logger.warning("Metric '%s' not found.", metric)
        return {}

    df = df.copy()

    # Parse date and extract day of week
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
        try:
            if timezone != "UTC":
                df["date"] = df["date"].dt.tz_localize("UTC").dt.tz_convert(timezone)
        except Exception:
            logger.warning("Could not convert timezone to %s; using UTC.", timezone)
        df["day_of_week"] = df["date"].dt.day_name()
    elif "day_of_week" not in df.columns:
        logger.warning("No date or day_of_week column found.")
        return {}

    # Determine hour column
    hour_col = "post_hour"
    if hour_col not in df.columns:
        if "date" in df.columns:
            df[hour_col] = df["date"].dt.hour
        else:
            logger.warning("No hour information available.")
            return {}

    results: dict[str, Any] = {}
    day_order = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
    ]

    for platform, plat_df in df.groupby("platform"):
        plat_str = str(platform)
        heatmap: dict[str, dict[str, float]] = {}

        # Collect all (day, hour) engagement values for top-N ranking
        all_windows: list[tuple[str, int, float]] = []

        for day in day_order:
            day_data = plat_df[plat_df["day_of_week"] == day]
            heatmap[day] = {}
            for hour in range(24):
                hour_data = day_data[day_data[hour_col] == hour]
                if not hour_data.empty:
                    avg_val = float(hour_data[metric].mean())
                else:
                    avg_val = 0.0
                heatmap[day][str(hour)] = avg_val
                if avg_val > 0:
                    all_windows.append((day, hour, avg_val))

        # Find top 3 windows
        all_windows.sort(key=lambda x: x[2], reverse=True)
        top_3 = [{"day": w[0], "hour": w[1], f"avg_{metric}": w[2]} for w in all_windows[:3]]

        results[plat_str] = {
            "heatmap": heatmap,
            "top_3_windows": top_3,
        }

    logger.info("Computed best posting times for %d platforms", len(results))
    return results


def analyze_topic_performance(
    df: pd.DataFrame,
    metric: str = "engagement_rate",
) -> dict[str, Any]:
    """Measure engagement rates per topic across platforms.

    Requires that ``classify_topics`` has already been run to populate
    the ``topic_label`` column.

    Parameters
    ----------
    df : pd.DataFrame
        Social post dataframe with ``topic_label``, ``platform``,
        and the specified metric column.
    metric : str
        Metric to aggregate per topic. Defaults to ``"engagement_rate"``.

    Returns
    -------
    dict[str, Any]
        Dictionary with per-topic performance summaries:
        ``{topic_label: {platform: {mean, median, count}, overall: {mean, median, count}}}``.
    """
    if "topic_label" not in df.columns:
        logger.warning("topic_label column not found. Run classify_topics first.")
        return {}

    if metric not in df.columns:
        logger.warning("Metric '%s' not found.", metric)
        return {}

    results: dict[str, Any] = {}

    for topic, topic_df in df.groupby("topic_label"):
        topic_str = str(topic)
        values = topic_df[metric].dropna()

        topic_result: dict[str, Any] = {
            "overall": {
                "mean": float(values.mean()) if len(values) > 0 else 0.0,
                "median": float(values.median()) if len(values) > 0 else 0.0,
                "count": int(len(values)),
            }
        }

        # Per-platform breakdown
        if "platform" in topic_df.columns:
            for plat, plat_df in topic_df.groupby("platform"):
                plat_values = plat_df[metric].dropna()
                if len(plat_values) > 0:
                    topic_result[str(plat)] = {
                        "mean": float(plat_values.mean()),
                        "median": float(plat_values.median()),
                        "count": int(len(plat_values)),
                    }

        results[topic_str] = topic_result

    logger.info("Analyzed performance for %d topics", len(results))
    return results


def generate_content_report(
    benchmarks: dict[str, Any],
    cadence: dict[str, Any],
    best_times: dict[str, Any],
    topic_performance: dict[str, Any],
) -> dict[str, Any]:
    """Combine all content analysis outputs into a structured report.

    Parameters
    ----------
    benchmarks : dict[str, Any]
        Output from ``benchmark_content_types``.
    cadence : dict[str, Any]
        Output from ``analyze_posting_cadence``.
    best_times : dict[str, Any]
        Output from ``compute_best_posting_times``.
    topic_performance : dict[str, Any]
        Output from ``analyze_topic_performance``.

    Returns
    -------
    dict[str, Any]
        Unified content analysis report suitable for JSON serialization.
    """
    # Derive top content types per platform from benchmarks
    top_content_types: dict[str, str] = {}
    for platform, types in benchmarks.items():
        if types:
            best_type = max(
                types.items(),
                key=lambda x: x[1].get("median", 0),
            )
            top_content_types[platform] = best_type[0]

    # Derive optimal posting times summary
    optimal_times: dict[str, Any] = {}
    for platform, data in best_times.items():
        if data.get("top_3_windows"):
            optimal_times[platform] = data["top_3_windows"][0]

    # Derive top topics
    top_topics: list[dict[str, Any]] = []
    for topic, data in topic_performance.items():
        overall = data.get("overall", {})
        top_topics.append(
            {
                "topic": topic,
                "mean_engagement_rate": overall.get("mean", 0),
                "post_count": overall.get("count", 0),
            }
        )
    top_topics.sort(key=lambda x: x["mean_engagement_rate"], reverse=True)

    report: dict[str, Any] = {
        "content_type_benchmarks": benchmarks,
        "posting_cadence": cadence,
        "best_posting_times": best_times,
        "topic_performance": topic_performance,
        "summary": {
            "top_content_type_per_platform": top_content_types,
            "optimal_posting_windows": optimal_times,
            "top_topics_by_engagement": top_topics[:10],
            "optimal_cadence_per_platform": {plat: data.get("optimal_frequency") for plat, data in cadence.items()},
        },
    }

    logger.info("Generated content analysis report")
    return report


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Analyze social media content performance patterns.",
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("workspace/processed/unified_social_performance.csv"),
        help="Path to the normalized social performance CSV.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("workspace/analysis/social_content_analysis.json"),
        help="Output path for the content analysis JSON.",
    )
    parser.add_argument(
        "--n-topics",
        type=int,
        default=10,
        help="Number of topic clusters to create.",
    )
    return parser.parse_args()


def main() -> None:
    """Entry point for content performance analysis."""
    args = parse_args()
    df = pd.read_csv(args.input)

    df = classify_topics(df, n_topics=args.n_topics)
    benchmarks = benchmark_content_types(df)
    cadence = analyze_posting_cadence(df)
    best_times = compute_best_posting_times(df)
    topic_perf = analyze_topic_performance(df)

    report = generate_content_report(benchmarks, cadence, best_times, topic_perf)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(report, f, indent=2, default=str)

    logger.info("Content analysis written to %s", args.output)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
