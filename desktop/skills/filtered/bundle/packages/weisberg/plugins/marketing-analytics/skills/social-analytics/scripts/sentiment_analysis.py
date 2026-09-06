"""Sentiment scoring using transformer models on social media mentions and comments.

Classifies brand mentions into positive, neutral, and negative categories
using a pre-trained RoBERTa model. Computes aggregate sentiment indices,
detects crisis signals via anomaly detection on negative sentiment volume,
and identifies emerging conversation themes.

Usage:
    python sentiment_analysis.py \
        --input workspace/raw/social_mentions.csv \
        --output workspace/analysis/social_sentiment.json \
        --model cardiffnlp/twitter-roberta-base-sentiment-latest \
        --crisis-threshold 3.0
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default configuration
# ---------------------------------------------------------------------------

DEFAULT_MODEL: str = "cardiffnlp/twitter-roberta-base-sentiment-latest"
SENTIMENT_LABELS: list[str] = ["negative", "neutral", "positive"]
CONFIDENCE_THRESHOLD: float = 0.6
CRISIS_THRESHOLD_MULTIPLIER: float = 3.0
ROLLING_WINDOW_DAYS: int = 28

# ---------------------------------------------------------------------------
# Keyword-based fallback sentiment lexicon
# ---------------------------------------------------------------------------

_POSITIVE_KEYWORDS: set[str] = {
    "love",
    "great",
    "amazing",
    "awesome",
    "excellent",
    "fantastic",
    "wonderful",
    "best",
    "happy",
    "good",
    "thank",
    "thanks",
    "beautiful",
    "perfect",
    "brilliant",
    "outstanding",
    "impressive",
    "recommend",
    "excited",
    "enjoy",
    "joy",
    "delighted",
    "superb",
    "incredible",
    "positive",
    "pleased",
    "glad",
    "appreciate",
    "bravo",
    "win",
}

_NEGATIVE_KEYWORDS: set[str] = {
    "hate",
    "terrible",
    "awful",
    "worst",
    "bad",
    "horrible",
    "disgusting",
    "disappointing",
    "poor",
    "angry",
    "sad",
    "fail",
    "scam",
    "fraud",
    "broken",
    "useless",
    "annoying",
    "pathetic",
    "waste",
    "ugly",
    "complaint",
    "unhappy",
    "furious",
    "disaster",
    "nightmare",
    "boycott",
    "shame",
    "unacceptable",
    "trash",
    "toxic",
}


def load_model(model_name: str = DEFAULT_MODEL) -> Any:
    """Load a pre-trained transformer model and tokenizer for sentiment analysis.

    Parameters
    ----------
    model_name : str
        Hugging Face model identifier. Defaults to
        ``cardiffnlp/twitter-roberta-base-sentiment-latest``.

    Returns
    -------
    Any
        Tuple of ``(model, tokenizer)`` ready for inference.

    Raises
    ------
    RuntimeError
        If the model cannot be loaded (e.g., missing dependencies).
    """
    try:
        from transformers import AutoModelForSequenceClassification, AutoTokenizer
        import torch  # noqa: F401 — verify torch is available

        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForSequenceClassification.from_pretrained(model_name)
        model.eval()
        logger.info("Loaded transformer model: %s", model_name)
        return model, tokenizer
    except ImportError as exc:
        logger.warning(
            "transformers/torch not available (%s). Falling back to keyword-based sentiment.",
            exc,
        )
        return None, None
    except Exception as exc:
        raise RuntimeError(f"Failed to load model '{model_name}': {exc}") from exc


def preprocess_text(text: str) -> str:
    """Clean and normalize social media text for model input.

    Preprocessing steps:
    - Replace URLs with ``[URL]`` token.
    - Normalize @mentions to ``@user``.
    - Preserve emojis (model trained with emoji context).
    - Handle encoding issues (smart quotes, unicode normalization).
    - Truncation is handled at the tokenizer level (512 tokens).

    Parameters
    ----------
    text : str
        Raw social media text (post, comment, or mention).

    Returns
    -------
    str
        Cleaned text ready for tokenization.
    """
    if not isinstance(text, str):
        return ""

    # Unicode normalization (NFC form)
    text = unicodedata.normalize("NFC", text)

    # Replace smart quotes with standard quotes
    text = text.replace("\u2018", "'").replace("\u2019", "'")
    text = text.replace("\u201c", '"').replace("\u201d", '"')

    # Replace URLs with [URL] token
    text = re.sub(r"https?://\S+|www\.\S+", "[URL]", text)

    # Normalize @mentions to @user
    text = re.sub(r"@\w+", "@user", text)

    # Collapse multiple spaces / newlines
    text = re.sub(r"\s+", " ", text).strip()

    return text


def _keyword_sentiment(text: str) -> dict[str, Any]:
    """Fallback keyword-based sentiment classification."""
    words = set(text.lower().split())
    pos_count = len(words & _POSITIVE_KEYWORDS)
    neg_count = len(words & _NEGATIVE_KEYWORDS)

    total = pos_count + neg_count
    if total == 0:
        return {
            "sentiment_label": "neutral",
            "sentiment_score": 0.5,
            "negative_prob": 0.2,
            "neutral_prob": 0.6,
            "positive_prob": 0.2,
        }

    pos_ratio = pos_count / total
    neg_ratio = neg_count / total

    if pos_ratio > 0.6:
        label = "positive"
        score = min(0.5 + pos_ratio * 0.4, 0.95)
    elif neg_ratio > 0.6:
        label = "negative"
        score = min(0.5 + neg_ratio * 0.4, 0.95)
    else:
        label = "neutral"
        score = 0.5

    return {
        "sentiment_label": label,
        "sentiment_score": score,
        "negative_prob": neg_ratio * 0.8 + 0.1,
        "neutral_prob": max(0.0, 1.0 - (pos_ratio + neg_ratio) * 0.8 - 0.2),
        "positive_prob": pos_ratio * 0.8 + 0.1,
    }


def classify_sentiment(
    texts: list[str],
    model: Any,
    tokenizer: Any,
    batch_size: int = 32,
    confidence_threshold: float = CONFIDENCE_THRESHOLD,
) -> list[dict[str, Any]]:
    """Run sentiment classification on a batch of texts.

    Processes texts in batches, applies softmax to model logits, and
    returns per-text sentiment labels with confidence scores. Texts
    below the confidence threshold are labeled as ``"uncertain"``.

    Parameters
    ----------
    texts : list[str]
        List of preprocessed social media texts.
    model : Any
        Loaded transformer model.
    tokenizer : Any
        Corresponding tokenizer.
    batch_size : int
        Number of texts to process per batch. Defaults to 32.
    confidence_threshold : float
        Minimum probability for a confident classification.
        Defaults to 0.6.

    Returns
    -------
    list[dict[str, Any]]
        List of dicts, each containing:
        - ``sentiment_label``: positive / neutral / negative / uncertain
        - ``sentiment_score``: probability of assigned class
        - ``negative_prob``: probability of negative class
        - ``neutral_prob``: probability of neutral class
        - ``positive_prob``: probability of positive class
    """
    # Fallback to keyword-based when model is not available
    if model is None or tokenizer is None:
        logger.info("Using keyword-based sentiment fallback for %d texts", len(texts))
        return [_keyword_sentiment(t) for t in texts]

    try:
        import torch
    except ImportError:
        logger.warning("torch not available; using keyword fallback.")
        return [_keyword_sentiment(t) for t in texts]

    results: list[dict[str, Any]] = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]

        # Tokenize
        encoded = tokenizer(
            batch,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="pt",
        )

        # Inference
        with torch.no_grad():
            outputs = model(**encoded)
            logits = outputs.logits

        # Softmax to get probabilities
        probs = torch.nn.functional.softmax(logits, dim=-1).numpy()

        for prob_row in probs:
            neg_prob = float(prob_row[0])
            neu_prob = float(prob_row[1])
            pos_prob = float(prob_row[2])

            max_idx = int(np.argmax(prob_row))
            max_prob = float(prob_row[max_idx])

            if max_prob >= confidence_threshold:
                label = SENTIMENT_LABELS[max_idx]
            else:
                label = "uncertain"

            results.append(
                {
                    "sentiment_label": label,
                    "sentiment_score": max_prob,
                    "negative_prob": neg_prob,
                    "neutral_prob": neu_prob,
                    "positive_prob": pos_prob,
                }
            )

    logger.info("Classified sentiment for %d texts", len(results))
    return results


def compute_daily_sentiment_index(
    df: pd.DataFrame,
    date_column: str = "date",
) -> pd.DataFrame:
    """Aggregate per-mention sentiment into daily brand sentiment scores.

    Computes two indices:
    - Simple index: ``(positive_count - negative_count) / total_count``
    - Weighted index: confidence-weighted directional score

    Parameters
    ----------
    df : pd.DataFrame
        Mention-level dataframe with ``sentiment_label``,
        ``sentiment_score``, and the specified date column.
    date_column : str
        Column containing the date. Defaults to ``"date"``.

    Returns
    -------
    pd.DataFrame
        Daily aggregation with columns: ``date``, ``total_mentions``,
        ``positive_count``, ``neutral_count``, ``negative_count``,
        ``uncertain_count``, ``sentiment_index``, ``weighted_sentiment_index``.
    """
    df = df.copy()
    df[date_column] = pd.to_datetime(df[date_column], errors="coerce")
    df["_date"] = df[date_column].dt.date

    # Compute directional weight for weighted index
    direction_map = {"positive": 1.0, "neutral": 0.0, "negative": -1.0, "uncertain": 0.0}
    df["_direction"] = df["sentiment_label"].map(direction_map).fillna(0.0)
    df["_weighted_score"] = df["_direction"] * df.get("sentiment_score", pd.Series(0.5, index=df.index))

    daily = (
        df.groupby("_date")
        .agg(
            total_mentions=("sentiment_label", "count"),
            positive_count=("sentiment_label", lambda x: (x == "positive").sum()),
            neutral_count=("sentiment_label", lambda x: (x == "neutral").sum()),
            negative_count=("sentiment_label", lambda x: (x == "negative").sum()),
            uncertain_count=("sentiment_label", lambda x: (x == "uncertain").sum()),
            _weighted_sum=("_weighted_score", "sum"),
        )
        .reset_index()
        .rename(columns={"_date": "date"})
    )

    # Simple sentiment index
    daily["sentiment_index"] = (daily["positive_count"] - daily["negative_count"]) / daily["total_mentions"].replace(
        0, np.nan
    )

    # Weighted sentiment index
    daily["weighted_sentiment_index"] = daily["_weighted_sum"] / daily["total_mentions"].replace(0, np.nan)

    daily = daily.drop(columns=["_weighted_sum"])
    daily["date"] = pd.to_datetime(daily["date"])
    daily = daily.sort_values("date").reset_index(drop=True)

    logger.info("Computed daily sentiment index for %d days", len(daily))
    return daily


def detect_crisis_signals(
    daily_sentiment: pd.DataFrame,
    threshold_multiplier: float = CRISIS_THRESHOLD_MULTIPLIER,
    rolling_window: int = ROLLING_WINDOW_DAYS,
) -> list[dict[str, Any]]:
    """Detect anomalous spikes in negative sentiment volume.

    Uses a rolling mean and standard deviation to identify days where
    negative mention volume exceeds the configurable threshold.

    Parameters
    ----------
    daily_sentiment : pd.DataFrame
        Output from ``compute_daily_sentiment_index`` with
        ``negative_count`` column.
    threshold_multiplier : float
        Number of standard deviations above the rolling mean to trigger
        an alert. Defaults to 3.0.
    rolling_window : int
        Number of days for the rolling baseline. Defaults to 28.

    Returns
    -------
    list[dict[str, Any]]
        List of crisis alert dicts, each containing:
        - ``date``: alert date
        - ``severity``: watch / warning / critical
        - ``negative_count``: observed negative mention count
        - ``rolling_mean``: baseline mean
        - ``rolling_std``: baseline standard deviation
        - ``z_score``: how many std devs above the mean
    """
    if "negative_count" not in daily_sentiment.columns:
        logger.warning("negative_count column not found.")
        return []

    df = daily_sentiment.copy().sort_values("date").reset_index(drop=True)

    # Compute rolling statistics (shift by 1 to exclude current day)
    df["rolling_mean"] = (
        df["negative_count"].shift(1).rolling(window=rolling_window, min_periods=max(1, rolling_window // 4)).mean()
    )
    df["rolling_std"] = (
        df["negative_count"].shift(1).rolling(window=rolling_window, min_periods=max(1, rolling_window // 4)).std()
    )

    alerts: list[dict[str, Any]] = []

    for _, row in df.iterrows():
        r_mean = row["rolling_mean"]
        r_std = row["rolling_std"]

        if pd.isna(r_mean) or pd.isna(r_std) or r_std == 0:
            continue

        z_score = (row["negative_count"] - r_mean) / r_std

        # Determine severity based on reference methodology
        if z_score >= 5.0:
            severity = "critical"
        elif z_score >= threshold_multiplier:
            severity = "warning"
        elif z_score >= 2.0:
            severity = "watch"
        else:
            continue

        alerts.append(
            {
                "date": str(row["date"].date()) if hasattr(row["date"], "date") else str(row["date"]),
                "severity": severity,
                "negative_count": int(row["negative_count"]),
                "rolling_mean": round(float(r_mean), 2),
                "rolling_std": round(float(r_std), 2),
                "z_score": round(float(z_score), 2),
            }
        )

    logger.info("Detected %d crisis signals", len(alerts))
    return alerts


def extract_trending_themes(
    df: pd.DataFrame,
    text_column: str = "text",
    n_themes: int = 10,
    method: str = "tfidf",
) -> list[dict[str, Any]]:
    """Identify emerging conversation themes from mention text.

    Uses TF-IDF keyword extraction to surface recurring themes in
    recent mentions. Tracks theme volume over time to detect rising
    narratives.

    Parameters
    ----------
    df : pd.DataFrame
        Mention-level dataframe with a text column.
    text_column : str
        Column containing mention text. Defaults to ``"text"``.
    n_themes : int
        Number of themes to extract. Defaults to 10.
    method : str
        Theme extraction method: ``"tfidf"`` or ``"lda"``.
        Defaults to ``"tfidf"``.

    Returns
    -------
    list[dict[str, Any]]
        List of theme dicts, each containing:
        - ``theme_id``: numeric identifier
        - ``keywords``: top keywords for the theme
        - ``mention_count``: number of mentions in this theme
        - ``avg_sentiment``: average sentiment score
        - ``trend_direction``: rising / stable / declining
    """
    if text_column not in df.columns:
        logger.warning("Text column '%s' not found.", text_column)
        return []

    texts = df[text_column].fillna("").astype(str).tolist()
    non_empty = [t for t in texts if len(t.strip()) > 0]

    if len(non_empty) < n_themes:
        n_themes = max(1, len(non_empty))

    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.cluster import KMeans

        vectorizer = TfidfVectorizer(
            max_features=3000,
            stop_words="english",
            min_df=2,
            max_df=0.95,
        )
        tfidf_matrix = vectorizer.fit_transform(non_empty)
        feature_names = vectorizer.get_feature_names_out()

        km = KMeans(n_clusters=n_themes, random_state=42, n_init=10)
        labels = km.fit_predict(tfidf_matrix)

    except ImportError:
        logger.warning("scikit-learn not available; using word frequency fallback.")
        # Simple word frequency approach
        all_words: list[str] = []
        for t in non_empty:
            words = re.sub(r"[^\w\s]", "", t.lower()).split()
            all_words.extend(w for w in words if len(w) > 3)
        word_counts = Counter(all_words)
        top_words = [w for w, _ in word_counts.most_common(n_themes * 3)]

        themes: list[dict[str, Any]] = []
        for i in range(min(n_themes, len(top_words))):
            kw = top_words[i]
            matching = df[df[text_column].fillna("").str.contains(kw, case=False, na=False)]
            avg_sent = 0.0
            if "sentiment_score" in matching.columns and "sentiment_label" in matching.columns:
                direction = (
                    matching["sentiment_label"]
                    .map({"positive": 1, "neutral": 0, "negative": -1, "uncertain": 0})
                    .fillna(0)
                )
                avg_sent = float((direction * matching["sentiment_score"].fillna(0.5)).mean())

            themes.append(
                {
                    "theme_id": i,
                    "keywords": [kw],
                    "mention_count": len(matching),
                    "avg_sentiment": round(avg_sent, 3),
                    "trend_direction": "stable",
                }
            )
        return themes

    # Assign clusters to original df rows (only non-empty)
    df_non_empty = df[df[text_column].fillna("").str.strip().astype(bool)].copy()
    df_non_empty = df_non_empty.reset_index(drop=True)
    df_non_empty["_cluster"] = labels

    themes: list[dict[str, Any]] = []
    order_centroids = km.cluster_centers_.argsort()[:, ::-1]

    for i in range(n_themes):
        top_kw = [str(feature_names[idx]) for idx in order_centroids[i, :5]]
        cluster_df = df_non_empty[df_non_empty["_cluster"] == i]
        mention_count = len(cluster_df)

        # Average sentiment
        avg_sent = 0.0
        if "sentiment_score" in cluster_df.columns and "sentiment_label" in cluster_df.columns:
            direction = (
                cluster_df["sentiment_label"]
                .map({"positive": 1, "neutral": 0, "negative": -1, "uncertain": 0})
                .fillna(0)
            )
            avg_sent = (
                float((direction * cluster_df["sentiment_score"].fillna(0.5)).mean()) if mention_count > 0 else 0.0
            )

        # Trend direction: compare first half vs second half mention volume
        trend = "stable"
        if "date" in cluster_df.columns and mention_count > 4:
            cluster_sorted = cluster_df.sort_values("date")
            mid = len(cluster_sorted) // 2
            first_half = len(cluster_sorted.iloc[:mid])
            second_half = len(cluster_sorted.iloc[mid:])
            if second_half > first_half * 1.3:
                trend = "rising"
            elif second_half < first_half * 0.7:
                trend = "declining"

        themes.append(
            {
                "theme_id": i,
                "keywords": top_kw,
                "mention_count": mention_count,
                "avg_sentiment": round(avg_sent, 3),
                "trend_direction": trend,
            }
        )

    themes.sort(key=lambda x: x["mention_count"], reverse=True)
    logger.info("Extracted %d trending themes", len(themes))
    return themes


def enrich_crisis_context(
    df: pd.DataFrame,
    alert_date: str,
    top_n: int = 5,
) -> dict[str, Any]:
    """Provide context for a crisis alert with sample mentions and themes.

    Parameters
    ----------
    df : pd.DataFrame
        Mention-level dataframe filtered to negative mentions on the alert date.
    alert_date : str
        Date of the crisis alert (YYYY-MM-DD).
    top_n : int
        Number of top-engaged negative mentions to include. Defaults to 5.

    Returns
    -------
    dict[str, Any]
        Context dict containing:
        - ``top_mentions``: most-engaged negative mentions
        - ``common_themes``: keyword themes driving the spike
        - ``affected_platforms``: platforms with elevated negative volume
        - ``geographic_concentration``: top geographies if available
    """
    df = df.copy()

    # Parse date and filter to alert date
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
        alert_dt = pd.to_datetime(alert_date)
        day_df = df[df["date"].dt.date == alert_dt.date()]
    else:
        day_df = df

    # Filter to negative sentiment
    neg_df = day_df[day_df.get("sentiment_label", pd.Series()) == "negative"]

    # Top mentions by engagement
    eng_col = "engagements"
    if eng_col not in neg_df.columns:
        eng_col = "engagement_rate" if "engagement_rate" in neg_df.columns else None

    if eng_col and not neg_df.empty:
        top_mentions_df = neg_df.nlargest(top_n, eng_col)
    else:
        top_mentions_df = neg_df.head(top_n)

    text_col = "text" if "text" in top_mentions_df.columns else "clean_text"
    top_mentions = []
    for _, row in top_mentions_df.iterrows():
        mention: dict[str, Any] = {}
        if text_col in row.index:
            mention["text"] = str(row[text_col])[:500]
        if "platform" in row.index:
            mention["platform"] = str(row["platform"])
        if eng_col and eng_col in row.index:
            mention["engagements"] = float(row[eng_col]) if pd.notna(row[eng_col]) else 0
        top_mentions.append(mention)

    # Common themes via word frequency on negative mentions
    common_themes: list[str] = []
    if text_col in neg_df.columns:
        all_words: list[str] = []
        for text in neg_df[text_col].fillna(""):
            words = re.sub(r"[^\w\s]", "", str(text).lower()).split()
            all_words.extend(w for w in words if len(w) > 3)
        word_counts = Counter(all_words)
        # Remove very common words
        stop_words = {"this", "that", "with", "from", "have", "been", "they", "their", "were", "will", "your"}
        common_themes = [w for w, _ in word_counts.most_common(20) if w not in stop_words][:10]

    # Affected platforms
    affected_platforms: dict[str, int] = {}
    if "platform" in neg_df.columns:
        affected_platforms = neg_df["platform"].value_counts().to_dict()
        affected_platforms = {str(k): int(v) for k, v in affected_platforms.items()}

    # Geographic concentration
    geo: dict[str, int] = {}
    for geo_col in ("geography", "geo", "country", "region", "location"):
        if geo_col in neg_df.columns:
            geo = neg_df[geo_col].value_counts().head(5).to_dict()
            geo = {str(k): int(v) for k, v in geo.items()}
            break

    return {
        "alert_date": alert_date,
        "top_mentions": top_mentions,
        "common_themes": common_themes,
        "affected_platforms": affected_platforms,
        "geographic_concentration": geo,
    }


def generate_sentiment_report(
    daily_sentiment: pd.DataFrame,
    crisis_alerts: list[dict[str, Any]],
    themes: list[dict[str, Any]],
) -> dict[str, Any]:
    """Assemble the full sentiment analysis report.

    Parameters
    ----------
    daily_sentiment : pd.DataFrame
        Daily sentiment index dataframe.
    crisis_alerts : list[dict[str, Any]]
        Crisis alert records.
    themes : list[dict[str, Any]]
        Trending theme records.

    Returns
    -------
    dict[str, Any]
        Unified sentiment report suitable for JSON serialization.
    """
    # Summary statistics
    total_mentions = int(daily_sentiment["total_mentions"].sum()) if "total_mentions" in daily_sentiment.columns else 0
    total_positive = int(daily_sentiment["positive_count"].sum()) if "positive_count" in daily_sentiment.columns else 0
    total_negative = int(daily_sentiment["negative_count"].sum()) if "negative_count" in daily_sentiment.columns else 0
    total_neutral = int(daily_sentiment["neutral_count"].sum()) if "neutral_count" in daily_sentiment.columns else 0

    avg_sentiment_index = (
        float(daily_sentiment["sentiment_index"].mean())
        if "sentiment_index" in daily_sentiment.columns and not daily_sentiment.empty
        else 0.0
    )

    # Convert daily sentiment to records for JSON
    daily_records = daily_sentiment.to_dict(orient="records")

    report: dict[str, Any] = {
        "summary": {
            "total_mentions": total_mentions,
            "total_positive": total_positive,
            "total_neutral": total_neutral,
            "total_negative": total_negative,
            "avg_sentiment_index": round(avg_sentiment_index, 4),
            "sentiment_distribution": {
                "positive_pct": round(total_positive / max(total_mentions, 1) * 100, 1),
                "neutral_pct": round(total_neutral / max(total_mentions, 1) * 100, 1),
                "negative_pct": round(total_negative / max(total_mentions, 1) * 100, 1),
            },
            "crisis_alerts_count": len(crisis_alerts),
        },
        "daily_sentiment": daily_records,
        "crisis_alerts": crisis_alerts,
        "trending_themes": themes,
    }

    logger.info("Generated sentiment report covering %d days", len(daily_records))
    return report


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Run sentiment analysis on social media mentions.",
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("workspace/raw/social_mentions.csv"),
        help="Path to the social mentions CSV.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("workspace/analysis/social_sentiment.json"),
        help="Output path for the sentiment analysis JSON.",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=DEFAULT_MODEL,
        help="Hugging Face model identifier for sentiment classification.",
    )
    parser.add_argument(
        "--crisis-threshold",
        type=float,
        default=CRISIS_THRESHOLD_MULTIPLIER,
        help="Standard deviations above rolling mean to trigger crisis alert.",
    )
    parser.add_argument(
        "--confidence-threshold",
        type=float,
        default=CONFIDENCE_THRESHOLD,
        help="Minimum confidence for a non-uncertain classification.",
    )
    return parser.parse_args()


def main() -> None:
    """Entry point for sentiment analysis pipeline."""
    args = parse_args()

    # Load model
    model, tokenizer = load_model(args.model)

    # Load and preprocess mentions
    df = pd.read_csv(args.input)
    df["clean_text"] = df["text"].apply(preprocess_text)

    # Classify sentiment
    results = classify_sentiment(
        df["clean_text"].tolist(),
        model,
        tokenizer,
        confidence_threshold=args.confidence_threshold,
    )
    for key in results[0]:
        df[key] = [r[key] for r in results]

    # Aggregate and detect
    daily = compute_daily_sentiment_index(df)
    alerts = detect_crisis_signals(daily, threshold_multiplier=args.crisis_threshold)
    themes = extract_trending_themes(df)

    # Generate report
    report = generate_sentiment_report(daily, alerts, themes)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(report, f, indent=2, default=str)

    logger.info("Sentiment analysis written to %s", args.output)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
