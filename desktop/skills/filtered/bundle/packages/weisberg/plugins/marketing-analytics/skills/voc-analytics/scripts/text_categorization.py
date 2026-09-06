"""
Theme extraction from open-text survey responses using LLM API calls.

This module categorizes free-text customer feedback into predefined and
emergent themes using Claude API with structured output. It also performs
sentiment scoring (positive/neutral/negative with intensity) on each
response.

Usage:
    python text_categorization.py \
        --input workspace/raw/survey_responses.csv \
        --taxonomy references/theme_taxonomy.json \
        --output workspace/analysis/text_themes.json \
        --batch-size 30

Dependencies:
    anthropic, pandas, json
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import time
from dataclasses import dataclass, asdict
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Optional

import pandas as pd

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class ThemeClassification:
    """A single theme assigned to a response."""

    theme_name: str
    is_predefined: bool
    confidence: float  # 0.0 to 1.0


@dataclass
class SentimentScore:
    """Sentiment assessment for a single response."""

    polarity: str  # "positive", "neutral", "negative"
    intensity: float  # 0.0 to 1.0
    mixed: bool = False  # True if response contains conflicting sentiment


@dataclass
class ResponseClassification:
    """Complete classification result for a single survey response."""

    respondent_id: str
    response_text: str
    themes: list[ThemeClassification]
    sentiment: SentimentScore
    language: str  # ISO 639-1 code


@dataclass
class ThemeSummary:
    """Aggregated theme statistics across all responses."""

    theme_name: str
    count: int
    pct_of_responses: float
    net_sentiment: float  # -1.0 to 1.0
    is_emergent: bool
    first_detected: Optional[str] = None  # ISO date string


@dataclass
class CategorizationResult:
    """Complete output of the text categorization pipeline."""

    total_responses: int
    classifications: list[ResponseClassification]
    theme_summaries: list[ThemeSummary]
    emergent_themes: list[ThemeSummary]


# ---------------------------------------------------------------------------
# Theme taxonomy
# ---------------------------------------------------------------------------

DEFAULT_THEME_TAXONOMY: list[str] = [
    "Product Quality",
    "Customer Service",
    "Pricing & Value",
    "Digital Experience",
    "Onboarding",
    "Communication",
    "Trust & Security",
    "Speed & Efficiency",
]

# Keyword mapping for fallback classification when LLM is unavailable
_KEYWORD_THEME_MAP: dict[str, list[str]] = {
    "Product Quality": [
        "product",
        "quality",
        "feature",
        "functionality",
        "reliable",
        "reliability",
        "performance",
        "broken",
        "defect",
        "bug",
    ],
    "Customer Service": [
        "service",
        "support",
        "agent",
        "representative",
        "helpdesk",
        "help",
        "responsive",
        "rude",
        "friendly",
        "resolution",
    ],
    "Pricing & Value": [
        "price",
        "pricing",
        "cost",
        "expensive",
        "cheap",
        "value",
        "fee",
        "billing",
        "charge",
        "afford",
        "money",
        "worth",
    ],
    "Digital Experience": [
        "app",
        "website",
        "online",
        "digital",
        "mobile",
        "ui",
        "ux",
        "interface",
        "usability",
        "navigate",
        "login",
        "portal",
    ],
    "Onboarding": [
        "onboarding",
        "setup",
        "started",
        "getting started",
        "sign up",
        "signup",
        "registration",
        "welcome",
        "initial",
        "first time",
    ],
    "Communication": [
        "email",
        "notification",
        "communicate",
        "communication",
        "update",
        "inform",
        "message",
        "letter",
        "newsletter",
    ],
    "Trust & Security": [
        "trust",
        "security",
        "safe",
        "privacy",
        "fraud",
        "protect",
        "data",
        "breach",
        "transparent",
        "transparency",
        "secure",
    ],
    "Speed & Efficiency": [
        "speed",
        "fast",
        "slow",
        "wait",
        "delay",
        "efficient",
        "efficiency",
        "quick",
        "turnaround",
        "processing",
        "time",
    ],
}

# Simple sentiment keywords for fallback
_POSITIVE_KEYWORDS = [
    "great",
    "excellent",
    "amazing",
    "love",
    "wonderful",
    "fantastic",
    "happy",
    "good",
    "best",
    "awesome",
    "pleased",
    "satisfied",
    "helpful",
    "easy",
    "perfect",
    "outstanding",
    "impressed",
]
_NEGATIVE_KEYWORDS = [
    "bad",
    "terrible",
    "awful",
    "horrible",
    "worst",
    "hate",
    "angry",
    "disappointed",
    "frustrating",
    "poor",
    "useless",
    "difficult",
    "annoying",
    "slow",
    "broken",
    "rude",
    "unhappy",
    "dissatisfied",
]


def load_theme_taxonomy(taxonomy_path: Optional[Path] = None) -> list[str]:
    """Load predefined theme taxonomy from a JSON file.

    If no path is provided, returns the default taxonomy.

    Args:
        taxonomy_path: Optional path to a JSON file containing a list of
            theme name strings.

    Returns:
        List of predefined theme names.

    Raises:
        FileNotFoundError: If the specified taxonomy file does not exist.
        ValueError: If the file does not contain a valid JSON list of strings.
    """
    if taxonomy_path is None:
        return list(DEFAULT_THEME_TAXONOMY)

    taxonomy_path = Path(taxonomy_path)
    if not taxonomy_path.exists():
        raise FileNotFoundError(f"Taxonomy file not found: {taxonomy_path}")

    with open(taxonomy_path, "r") as f:
        data = json.load(f)

    if not isinstance(data, list):
        raise ValueError(f"Taxonomy file must contain a JSON array, got {type(data).__name__}.")
    for item in data:
        if not isinstance(item, str):
            raise ValueError(f"All taxonomy entries must be strings, got {type(item).__name__}: {item!r}")

    return data


# ---------------------------------------------------------------------------
# Keyword-based fallback classification
# ---------------------------------------------------------------------------


def _fallback_classify_single(
    respondent_id: str,
    response_text: str,
    taxonomy: list[str],
) -> ResponseClassification:
    """Classify a single response using keyword matching (fallback)."""
    text_lower = response_text.lower()
    themes: list[ThemeClassification] = []

    # Theme detection via keywords
    for theme_name in taxonomy:
        keywords = _KEYWORD_THEME_MAP.get(theme_name, [])
        matched = sum(1 for kw in keywords if kw in text_lower)
        if matched > 0:
            confidence = min(0.4 + matched * 0.15, 0.85)
            themes.append(
                ThemeClassification(
                    theme_name=theme_name,
                    is_predefined=True,
                    confidence=round(confidence, 2),
                )
            )

    # If no themes matched, assign a generic theme
    if not themes:
        themes.append(
            ThemeClassification(
                theme_name="General Feedback",
                is_predefined=False,
                confidence=0.3,
            )
        )

    # Sentiment detection via keywords
    pos_count = sum(1 for kw in _POSITIVE_KEYWORDS if kw in text_lower)
    neg_count = sum(1 for kw in _NEGATIVE_KEYWORDS if kw in text_lower)
    mixed = pos_count > 0 and neg_count > 0

    if pos_count > neg_count:
        polarity = "positive"
        intensity = min(0.3 + pos_count * 0.15, 1.0)
    elif neg_count > pos_count:
        polarity = "negative"
        intensity = min(0.3 + neg_count * 0.15, 1.0)
    else:
        polarity = "neutral"
        intensity = 0.2

    sentiment = SentimentScore(
        polarity=polarity,
        intensity=round(intensity, 2),
        mixed=mixed,
    )

    return ResponseClassification(
        respondent_id=str(respondent_id),
        response_text=response_text,
        themes=themes,
        sentiment=sentiment,
        language="en",  # Fallback assumes English
    )


# ---------------------------------------------------------------------------
# LLM-based classification
# ---------------------------------------------------------------------------


def build_classification_prompt(
    responses: list[dict[str, str]],
    taxonomy: list[str],
) -> list[dict[str, str]]:
    """Build the message list for the Claude API classification call.

    Constructs a system prompt defining the analyst role and output schema,
    and a user prompt containing the theme taxonomy and batch of responses
    to classify.

    Args:
        responses: List of dicts with keys "respondent_id" and
            "response_text".
        taxonomy: List of predefined theme names.

    Returns:
        List of message dicts suitable for the Anthropic messages API,
        with "role" and "content" keys.
    """
    system_prompt = (
        "You are a customer feedback analyst. Your task is to categorize "
        "open-text survey responses into themes and assess sentiment.\n\n"
        "You will receive a batch of customer responses. For each response, "
        "output a JSON object with the following fields:\n"
        "- respondent_id: the ID of the respondent\n"
        "- themes: array of theme objects, each with:\n"
        "  - theme_name: string matching a predefined theme OR a new emergent theme\n"
        "  - is_predefined: boolean indicating if the theme is from the predefined list\n"
        "  - confidence: float 0.0-1.0 indicating classification confidence\n"
        "- sentiment: object with:\n"
        '  - polarity: one of "positive", "neutral", "negative"\n'
        "  - intensity: float 0.0-1.0 (0 = barely detectable, 1 = very strong)\n"
        "  - mixed: boolean, true if response contains conflicting sentiment\n"
        "- language: ISO 639-1 code of the detected language\n\n"
        "Return ONLY a valid JSON array of classification objects. No other text."
    )

    # Format the batch of responses for the user message
    response_lines = []
    for r in responses:
        response_lines.append(f"[{r['respondent_id']}]: {r['response_text']}")
    responses_block = "\n".join(response_lines)

    taxonomy_str = ", ".join(taxonomy)

    user_prompt = (
        f"Predefined themes: {taxonomy_str}\n\n"
        "Classify the following survey responses. Each response may belong to "
        "multiple themes. If a response does not fit any predefined theme, create "
        "a new theme name that is concise and descriptive.\n\n"
        f"Responses:\n{responses_block}\n\n"
        "Return a JSON array of classification objects."
    )

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def call_llm_classification(
    messages: list[dict[str, str]],
    model: str = "claude-sonnet-4-20250514",
    max_tokens: int = 4096,
    api_key: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Call the Claude API to classify a batch of responses.

    Sends the classification prompt to the Anthropic messages API and
    parses the structured JSON output.

    Args:
        messages: Message list from build_classification_prompt.
        model: Anthropic model identifier.
        max_tokens: Maximum tokens in the response.
        api_key: Anthropic API key. If None, reads from ANTHROPIC_API_KEY
            environment variable.

    Returns:
        List of classification dicts parsed from the LLM JSON response.
        Each dict contains: respondent_id, themes, sentiment, language.

    Raises:
        RuntimeError: If the API call fails or the response is not valid JSON.
    """
    try:
        import anthropic
    except ImportError:
        raise RuntimeError("anthropic package is not installed. Install with: pip install anthropic")

    client_kwargs: dict[str, Any] = {}
    if api_key:
        client_kwargs["api_key"] = api_key

    client = anthropic.Anthropic(**client_kwargs)

    # Separate system from user/assistant messages
    system_content = None
    api_messages = []
    for msg in messages:
        if msg["role"] == "system":
            system_content = msg["content"]
        else:
            api_messages.append(msg)

    create_kwargs: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": api_messages,
    }
    if system_content:
        create_kwargs["system"] = system_content

    try:
        response = client.messages.create(**create_kwargs)
    except Exception as exc:
        raise RuntimeError(f"Anthropic API call failed: {exc}") from exc

    # Extract text content from the response
    raw_text = ""
    for block in response.content:
        if hasattr(block, "text"):
            raw_text += block.text

    # Parse JSON from the response, handling potential markdown fences
    raw_text = raw_text.strip()
    # Remove markdown code fences if present
    if raw_text.startswith("```"):
        raw_text = re.sub(r"^```(?:json)?\s*\n?", "", raw_text)
        raw_text = re.sub(r"\n?```\s*$", "", raw_text)

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Failed to parse LLM response as JSON: {exc}\nRaw response (first 500 chars): {raw_text[:500]}"
        ) from exc

    if not isinstance(parsed, list):
        raise RuntimeError(f"Expected a JSON array from LLM, got {type(parsed).__name__}.")

    return parsed


def parse_llm_response(
    raw_classifications: list[dict[str, Any]],
    response_texts: dict[str, str],
) -> list[ResponseClassification]:
    """Parse raw LLM classification output into typed dataclasses.

    Validates theme names, sentiment values, and confidence scores.
    Logs warnings for any malformed entries.

    Args:
        raw_classifications: List of classification dicts from the LLM.
        response_texts: Mapping of respondent_id to original response text.

    Returns:
        List of validated ResponseClassification objects.
    """
    results: list[ResponseClassification] = []

    for entry in raw_classifications:
        try:
            rid = str(entry.get("respondent_id", ""))
            if not rid:
                logger.warning("Skipping entry with missing respondent_id.")
                continue

            # Parse themes
            raw_themes = entry.get("themes", [])
            themes: list[ThemeClassification] = []
            for t in raw_themes:
                theme_name = str(t.get("theme_name", "Unknown"))
                is_predefined = bool(t.get("is_predefined", False))
                confidence = float(t.get("confidence", 0.5))
                confidence = max(0.0, min(1.0, confidence))
                themes.append(
                    ThemeClassification(
                        theme_name=theme_name,
                        is_predefined=is_predefined,
                        confidence=round(confidence, 2),
                    )
                )

            if not themes:
                themes.append(
                    ThemeClassification(
                        theme_name="Uncategorized",
                        is_predefined=False,
                        confidence=0.0,
                    )
                )

            # Parse sentiment
            raw_sentiment = entry.get("sentiment", {})
            polarity = str(raw_sentiment.get("polarity", "neutral")).lower()
            if polarity not in ("positive", "neutral", "negative"):
                logger.warning(
                    "Invalid polarity '%s' for %s, defaulting to neutral.",
                    polarity,
                    rid,
                )
                polarity = "neutral"
            intensity = float(raw_sentiment.get("intensity", 0.5))
            intensity = max(0.0, min(1.0, intensity))
            mixed = bool(raw_sentiment.get("mixed", False))

            sentiment = SentimentScore(
                polarity=polarity,
                intensity=round(intensity, 2),
                mixed=mixed,
            )

            # Parse language
            language = str(entry.get("language", "en"))[:5]

            response_text = response_texts.get(rid, "")

            results.append(
                ResponseClassification(
                    respondent_id=rid,
                    response_text=response_text,
                    themes=themes,
                    sentiment=sentiment,
                    language=language,
                )
            )

        except Exception as exc:
            logger.warning(
                "Failed to parse classification entry: %s. Error: %s",
                entry,
                exc,
            )
            continue

    return results


# ---------------------------------------------------------------------------
# Batch processing
# ---------------------------------------------------------------------------


def extract_open_text_responses(df: pd.DataFrame) -> list[dict[str, str]]:
    """Extract open-text responses from the survey DataFrame.

    Filters to rows with non-empty text in the 'response' column and
    returns a list of dicts with respondent_id and response_text.

    Args:
        df: Survey response DataFrame with columns: respondent_id,
            question_id, response, score, timestamp.

    Returns:
        List of dicts, each with "respondent_id" and "response_text" keys.
    """
    # Filter to rows that have non-empty text responses
    text_df = df[df["response"].notna() & (df["response"].astype(str).str.strip() != "")].copy()

    # Exclude rows where response is purely numeric (likely score-only rows)
    text_df = text_df[~text_df["response"].astype(str).str.strip().str.match(r"^\d+\.?\d*$")]

    responses = []
    for _, row in text_df.iterrows():
        responses.append(
            {
                "respondent_id": str(row["respondent_id"]),
                "response_text": str(row["response"]).strip(),
            }
        )

    return responses


def classify_responses_in_batches(
    responses: list[dict[str, str]],
    taxonomy: list[str],
    batch_size: int = 30,
    model: str = "claude-sonnet-4-20250514",
    api_key: Optional[str] = None,
) -> list[ResponseClassification]:
    """Classify all responses by processing them in batches through the LLM.

    Batches responses into groups of batch_size, calls the LLM for each
    batch, and aggregates results. Handles rate limiting with exponential
    backoff.

    Args:
        responses: List of dicts with "respondent_id" and "response_text".
        taxonomy: List of predefined theme names.
        batch_size: Number of responses per LLM call (20-50 recommended).
        model: Anthropic model identifier.
        api_key: Anthropic API key.

    Returns:
        List of ResponseClassification objects for all responses.

    Raises:
        RuntimeError: If more than 3 consecutive batch calls fail.
    """
    all_classifications: list[ResponseClassification] = []
    total_batches = (len(responses) + batch_size - 1) // batch_size
    consecutive_failures = 0
    use_fallback = False

    # Build response text lookup
    response_texts = {r["respondent_id"]: r["response_text"] for r in responses}

    for batch_idx in range(total_batches):
        start = batch_idx * batch_size
        end = min(start + batch_size, len(responses))
        batch = responses[start:end]

        logger.info(
            "Processing batch %d/%d (%d responses)",
            batch_idx + 1,
            total_batches,
            len(batch),
        )

        if use_fallback:
            # Use keyword-based fallback for remaining batches
            for r in batch:
                classification = _fallback_classify_single(
                    r["respondent_id"],
                    r["response_text"],
                    taxonomy,
                )
                all_classifications.append(classification)
            continue

        # Try LLM classification with retries
        max_retries = 3
        success = False
        for attempt in range(max_retries):
            try:
                messages = build_classification_prompt(batch, taxonomy)
                raw_results = call_llm_classification(
                    messages,
                    model=model,
                    api_key=api_key,
                )
                batch_texts = {r["respondent_id"]: r["response_text"] for r in batch}
                parsed = parse_llm_response(raw_results, batch_texts)
                all_classifications.extend(parsed)

                # Handle any responses not returned by the LLM
                returned_ids = {c.respondent_id for c in parsed}
                for r in batch:
                    if r["respondent_id"] not in returned_ids:
                        logger.warning(
                            "LLM did not return classification for %s, using fallback.",
                            r["respondent_id"],
                        )
                        fallback = _fallback_classify_single(
                            r["respondent_id"],
                            r["response_text"],
                            taxonomy,
                        )
                        all_classifications.append(fallback)

                consecutive_failures = 0
                success = True
                break

            except RuntimeError as exc:
                logger.warning(
                    "Batch %d attempt %d failed: %s",
                    batch_idx + 1,
                    attempt + 1,
                    exc,
                )
                if attempt < max_retries - 1:
                    wait = 2 ** (attempt + 1)
                    logger.info("Retrying in %d seconds...", wait)
                    time.sleep(wait)

        if not success:
            consecutive_failures += 1
            logger.warning(
                "Batch %d failed after %d retries. Using keyword fallback.",
                batch_idx + 1,
                max_retries,
            )
            for r in batch:
                fallback = _fallback_classify_single(
                    r["respondent_id"],
                    r["response_text"],
                    taxonomy,
                )
                all_classifications.append(fallback)

            if consecutive_failures >= 3:
                logger.warning("3 consecutive batch failures. Switching to keyword fallback for all remaining batches.")
                use_fallback = True

    return all_classifications


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------


def compute_theme_summaries(
    classifications: list[ResponseClassification],
    taxonomy: list[str],
) -> tuple[list[ThemeSummary], list[ThemeSummary]]:
    """Aggregate theme frequencies and sentiment across all classifications.

    Args:
        classifications: List of per-response classification results.
        taxonomy: Predefined theme list, used to distinguish predefined
            from emergent themes.

    Returns:
        Tuple of (predefined_theme_summaries, emergent_theme_summaries).
        Each summary includes count, percentage, and net sentiment.
    """
    total = len(classifications)
    if total == 0:
        return [], []

    taxonomy_lower = {t.lower() for t in taxonomy}

    # Aggregate counts and sentiment per theme
    theme_stats: dict[str, dict[str, Any]] = {}
    for c in classifications:
        polarity_sign = (
            1.0 if c.sentiment.polarity == "positive" else -1.0 if c.sentiment.polarity == "negative" else 0.0
        )
        for t in c.themes:
            name = t.theme_name
            if name not in theme_stats:
                theme_stats[name] = {
                    "count": 0,
                    "sentiment_sum": 0.0,
                    "is_predefined": t.theme_name.lower() in taxonomy_lower,
                }
            theme_stats[name]["count"] += 1
            theme_stats[name]["sentiment_sum"] += polarity_sign

    predefined_summaries: list[ThemeSummary] = []
    emergent_summaries: list[ThemeSummary] = []

    for name, stats in theme_stats.items():
        count = stats["count"]
        net_sentiment = stats["sentiment_sum"] / count if count > 0 else 0.0
        is_predefined = stats["is_predefined"]

        summary = ThemeSummary(
            theme_name=name,
            count=count,
            pct_of_responses=round(count / total * 100, 1),
            net_sentiment=round(net_sentiment, 3),
            is_emergent=not is_predefined,
        )

        if is_predefined:
            predefined_summaries.append(summary)
        else:
            emergent_summaries.append(summary)

    # Sort by count descending
    predefined_summaries.sort(key=lambda s: s.count, reverse=True)
    emergent_summaries.sort(key=lambda s: s.count, reverse=True)

    return predefined_summaries, emergent_summaries


def consolidate_emergent_themes(
    emergent_themes: list[ThemeSummary],
    similarity_threshold: float = 0.85,
) -> list[ThemeSummary]:
    """Merge similar emergent themes that may have been named differently
    across batches.

    Uses string similarity to identify near-duplicate theme names and
    consolidates their counts and sentiment scores.

    Args:
        emergent_themes: List of emergent ThemeSummary objects.
        similarity_threshold: Minimum similarity ratio (0-1) for merging.

    Returns:
        Deduplicated list of emergent ThemeSummary objects.
    """
    if not emergent_themes:
        return []

    # Sort by count descending so we keep the most popular name
    themes = sorted(emergent_themes, key=lambda t: t.count, reverse=True)
    merged: list[ThemeSummary] = []
    used = set()

    for i, theme_a in enumerate(themes):
        if i in used:
            continue

        # Start a merge group with theme_a
        group_count = theme_a.count
        group_sentiment_sum = theme_a.net_sentiment * theme_a.count
        group_pct = theme_a.pct_of_responses

        for j in range(i + 1, len(themes)):
            if j in used:
                continue
            theme_b = themes[j]
            similarity = SequenceMatcher(
                None,
                theme_a.theme_name.lower(),
                theme_b.theme_name.lower(),
            ).ratio()

            if similarity >= similarity_threshold:
                group_count += theme_b.count
                group_sentiment_sum += theme_b.net_sentiment * theme_b.count
                group_pct += theme_b.pct_of_responses
                used.add(j)

        net_sentiment = group_sentiment_sum / group_count if group_count > 0 else 0.0
        merged.append(
            ThemeSummary(
                theme_name=theme_a.theme_name,  # Keep the most popular name
                count=group_count,
                pct_of_responses=round(group_pct, 1),
                net_sentiment=round(net_sentiment, 3),
                is_emergent=True,
                first_detected=theme_a.first_detected,
            )
        )

    merged.sort(key=lambda s: s.count, reverse=True)
    return merged


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------


def write_results(result: CategorizationResult, output_path: Path) -> None:
    """Serialize categorization results to JSON.

    Args:
        result: Complete categorization result to serialize.
        output_path: Path for the output JSON file.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    def _serialize(obj: Any) -> Any:
        if hasattr(obj, "__dataclass_fields__"):
            return asdict(obj)
        return str(obj)

    data = {
        "total_responses": result.total_responses,
        "classifications": [asdict(c) for c in result.classifications],
        "theme_summaries": [asdict(s) for s in result.theme_summaries],
        "emergent_themes": [asdict(e) for e in result.emergent_themes],
    }

    with open(output_path, "w") as f:
        json.dump(data, f, indent=2, default=str)

    logger.info("Wrote categorization results to %s", output_path)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    """Parse command-line arguments.

    Args:
        argv: Argument list (defaults to sys.argv[1:]).

    Returns:
        Parsed arguments namespace.
    """
    parser = argparse.ArgumentParser(description="Extract themes and sentiment from survey open-text.")
    parser.add_argument(
        "--input",
        type=Path,
        required=True,
        help="Path to survey_responses.csv",
    )
    parser.add_argument(
        "--taxonomy",
        type=Path,
        default=None,
        help="Path to theme taxonomy JSON (optional, uses defaults)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Path for output text_themes.json",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=30,
        help="Responses per LLM batch (default: 30)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="claude-sonnet-4-20250514",
        help="Anthropic model identifier",
    )
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> None:
    """Main entry point for CLI execution.

    Args:
        argv: Optional argument list for testing.
    """
    args = parse_args(argv)
    logging.basicConfig(level=logging.INFO)

    logger.info("Loading survey data from %s", args.input)
    df = pd.read_csv(args.input)

    taxonomy = load_theme_taxonomy(args.taxonomy)
    logger.info("Using %d predefined themes", len(taxonomy))

    responses = extract_open_text_responses(df)
    logger.info("Found %d open-text responses to classify", len(responses))

    classifications = classify_responses_in_batches(
        responses,
        taxonomy=taxonomy,
        batch_size=args.batch_size,
        model=args.model,
    )

    predefined, emergent = compute_theme_summaries(classifications, taxonomy)
    emergent = consolidate_emergent_themes(emergent)

    result = CategorizationResult(
        total_responses=len(classifications),
        classifications=classifications,
        theme_summaries=predefined + emergent,
        emergent_themes=emergent,
    )

    write_results(result, args.output)
    logger.info("Done. Classified %d responses into themes.", len(classifications))


if __name__ == "__main__":
    main()
