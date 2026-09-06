"""
Key driver analysis: correlation and regression of themes against satisfaction.

This module identifies which themes and touchpoints most strongly predict
Promoter vs. Detractor classification. It uses permutation importance from
random forest models rather than simple bivariate correlations, as specified
in the development guidelines.

Usage:
    python key_driver_analysis.py \
        --themes workspace/analysis/text_themes.json \
        --metrics workspace/analysis/satisfaction_metrics.json \
        --survey workspace/raw/survey_responses.csv \
        --output workspace/analysis/satisfaction_drivers.json

Dependencies:
    numpy, pandas, scikit-learn, scipy
"""

from __future__ import annotations

import argparse
import json
import logging
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class DriverResult:
    """Importance result for a single theme or feature as a satisfaction driver."""

    feature_name: str
    importance_score: float  # Permutation importance (mean decrease in accuracy)
    importance_std: float  # Standard deviation of importance across permutations
    importance_rank: int
    correlation_with_nps: float  # Spearman correlation for interpretability
    pct_promoters_with_theme: float  # Theme prevalence among Promoters
    pct_detractors_with_theme: float  # Theme prevalence among Detractors
    lift_ratio: float  # Detractor prevalence / Promoter prevalence


@dataclass
class TouchpointResult:
    """Satisfaction analysis for a specific customer touchpoint."""

    touchpoint_name: str
    mean_satisfaction: float
    n_responses: int
    pct_detractors: float
    top_negative_theme: str
    top_positive_theme: str


@dataclass
class KeyDriverReport:
    """Complete key driver analysis output."""

    drivers: list[DriverResult]
    touchpoints: list[TouchpointResult]
    model_accuracy: float  # Classification accuracy of the underlying model
    model_auc: float  # ROC AUC of the Promoter vs. Detractor classifier
    n_respondents: int
    recommendations: list[str]


# ---------------------------------------------------------------------------
# Data preparation
# ---------------------------------------------------------------------------


def load_theme_data(themes_path: Path) -> pd.DataFrame:
    """Load theme extraction results and pivot to a respondent-level feature matrix.

    Each row represents a respondent; each column represents a theme
    (binary: 1 if the theme was assigned to that respondent, 0 otherwise).
    Additional columns capture sentiment polarity and intensity.

    Args:
        themes_path: Path to text_themes.json produced by
            text_categorization.py.

    Returns:
        DataFrame with respondent_id as index and binary theme columns
        plus sentiment columns.

    Raises:
        FileNotFoundError: If the themes file does not exist.
        ValueError: If the JSON structure is unexpected.
    """
    themes_path = Path(themes_path)
    if not themes_path.exists():
        raise FileNotFoundError(f"Themes file not found: {themes_path}")

    with open(themes_path, "r") as f:
        data = json.load(f)

    classifications = data.get("classifications", [])
    if not classifications:
        raise ValueError("No classifications found in themes file.")

    # Collect all unique theme names
    all_themes: set[str] = set()
    for c in classifications:
        for t in c.get("themes", []):
            all_themes.add(t["theme_name"])

    # Build respondent-level feature matrix
    rows = []
    for c in classifications:
        rid = str(c["respondent_id"])
        row: dict[str, Any] = {"respondent_id": rid}

        # Binary theme indicators
        response_themes = {t["theme_name"] for t in c.get("themes", [])}
        for theme in all_themes:
            row[f"theme_{theme}"] = 1 if theme in response_themes else 0

        # Sentiment features
        sentiment = c.get("sentiment", {})
        polarity = sentiment.get("polarity", "neutral")
        row["sentiment_positive"] = 1 if polarity == "positive" else 0
        row["sentiment_negative"] = 1 if polarity == "negative" else 0
        row["sentiment_intensity"] = float(sentiment.get("intensity", 0.5))

        rows.append(row)

    df = pd.DataFrame(rows)
    df.set_index("respondent_id", inplace=True)

    logger.info(
        "Loaded theme data: %d respondents, %d theme features.",
        len(df),
        len(all_themes),
    )
    return df


def load_satisfaction_scores(survey_path: Path) -> pd.DataFrame:
    """Load NPS scores from survey data and create target labels.

    Creates a binary target: 1 for Promoter (score 9-10), 0 for Detractor
    (score 0-6). Passives (score 7-8) are excluded from the classification
    model but retained for correlation analysis.

    Args:
        survey_path: Path to survey_responses.csv.

    Returns:
        DataFrame with respondent_id, nps_score, and nps_class columns.

    Raises:
        FileNotFoundError: If the survey file does not exist.
    """
    survey_path = Path(survey_path)
    if not survey_path.exists():
        raise FileNotFoundError(f"Survey file not found: {survey_path}")

    df = pd.read_csv(survey_path)
    df["score"] = pd.to_numeric(df["score"], errors="coerce")

    # Keep one score per respondent (use the NPS question if identifiable,
    # otherwise use the mean score)
    qids = df["question_id"].astype(str).str.lower()
    nps_mask = qids.str.contains("nps", na=False)

    if nps_mask.any():
        score_df = df[nps_mask].copy()
    else:
        score_df = df.copy()

    # Aggregate to one row per respondent
    score_df = score_df.groupby("respondent_id")["score"].mean().reset_index()
    score_df.rename(columns={"score": "nps_score"}, inplace=True)

    # Classify: Promoter=1, Detractor=0, Passive=NaN (excluded from model)
    score_df["nps_class"] = np.nan
    score_df.loc[score_df["nps_score"] >= 9, "nps_class"] = 1
    score_df.loc[score_df["nps_score"] <= 6, "nps_class"] = 0
    # Passives (7-8) remain NaN

    score_df["respondent_id"] = score_df["respondent_id"].astype(str)

    logger.info(
        "Loaded %d respondents. Promoters: %d, Detractors: %d, Passives: %d.",
        len(score_df),
        int((score_df["nps_class"] == 1).sum()),
        int((score_df["nps_class"] == 0).sum()),
        int(score_df["nps_class"].isna().sum()),
    )
    return score_df


def build_feature_matrix(
    theme_df: pd.DataFrame,
    score_df: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.Series]:
    """Join theme features with satisfaction targets into a modeling-ready dataset.

    Performs an inner join on respondent_id, drops respondents missing
    either themes or scores, and separates features (X) from target (y).

    Args:
        theme_df: Respondent-level theme feature DataFrame from
            load_theme_data.
        score_df: Respondent-level score DataFrame from
            load_satisfaction_scores.

    Returns:
        Tuple of (X, y) where X is the feature DataFrame and y is the
        binary target Series (1=Promoter, 0=Detractor).
    """
    # Join on respondent_id
    score_df_indexed = score_df.set_index("respondent_id")
    merged = theme_df.join(score_df_indexed, how="inner")

    # Exclude passives (nps_class is NaN) from classification
    model_df = merged.dropna(subset=["nps_class"]).copy()

    if len(model_df) == 0:
        raise ValueError(
            "No respondents with both theme data and NPS classification. "
            "Check that respondent_id values match across files."
        )

    y = model_df["nps_class"].astype(int)
    X = model_df.drop(columns=["nps_score", "nps_class"], errors="ignore")

    logger.info(
        "Feature matrix: %d respondents, %d features. Class distribution: Promoters=%d, Detractors=%d.",
        len(X),
        len(X.columns),
        int((y == 1).sum()),
        int((y == 0).sum()),
    )
    return X, y


# ---------------------------------------------------------------------------
# Random forest model and permutation importance
# ---------------------------------------------------------------------------


def train_driver_model(
    X: pd.DataFrame,
    y: pd.Series,
    n_estimators: int = 500,
    random_seed: Optional[int] = None,
) -> Any:
    """Train a random forest classifier to predict Promoter vs. Detractor.

    The model serves as the basis for permutation importance analysis.
    Uses stratified train/test split to handle class imbalance.

    Args:
        X: Feature DataFrame (binary theme indicators and sentiment scores).
        y: Binary target Series (1=Promoter, 0=Detractor).
        n_estimators: Number of trees in the random forest.
        random_seed: Random seed for reproducibility.

    Returns:
        Tuple of (fitted_model, X_test, y_test, accuracy, auc_score).
        The test set is used for permutation importance computation.
    """
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score, roc_auc_score

    # Stratified split
    test_size = 0.25
    if len(X) < 40:
        # Very small dataset: use a smaller test split
        test_size = 0.2

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=test_size,
        stratify=y,
        random_state=random_seed,
    )

    model = RandomForestClassifier(
        n_estimators=n_estimators,
        max_depth=None,
        min_samples_leaf=max(1, len(X_train) // 50),
        class_weight="balanced",
        random_state=random_seed,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)

    # AUC: use predicted probabilities
    try:
        y_proba = model.predict_proba(X_test)[:, 1]
        auc = roc_auc_score(y_test, y_proba)
    except (ValueError, IndexError):
        auc = 0.5  # fallback if only one class in test set

    logger.info(
        "Random forest trained. Accuracy: %.3f, AUC: %.3f (train=%d, test=%d).",
        accuracy,
        auc,
        len(X_train),
        len(X_test),
    )

    return model, X_test, y_test, accuracy, auc


def compute_permutation_importance(
    model: Any,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    n_repeats: int = 30,
    random_seed: Optional[int] = None,
) -> pd.DataFrame:
    """Compute permutation importance for each feature.

    For each feature, randomly shuffles the feature values and measures the
    decrease in model accuracy. Features whose shuffling causes a large
    accuracy drop are the most important drivers.

    Args:
        model: Fitted random forest classifier.
        X_test: Test feature DataFrame.
        y_test: Test target Series.
        n_repeats: Number of permutation repeats per feature.
        random_seed: Random seed for reproducibility.

    Returns:
        DataFrame with columns: feature_name, importance_mean,
        importance_std, ranked by importance_mean descending.
    """
    from sklearn.inspection import permutation_importance

    result = permutation_importance(
        model,
        X_test,
        y_test,
        n_repeats=n_repeats,
        random_state=random_seed,
        scoring="accuracy",
        n_jobs=-1,
    )

    importance_df = pd.DataFrame(
        {
            "feature_name": X_test.columns,
            "importance_mean": result.importances_mean,
            "importance_std": result.importances_std,
        }
    )

    importance_df.sort_values(
        "importance_mean",
        ascending=False,
        inplace=True,
    )
    importance_df.reset_index(drop=True, inplace=True)

    return importance_df


# ---------------------------------------------------------------------------
# Supplementary analyses
# ---------------------------------------------------------------------------


def compute_theme_prevalence(
    theme_df: pd.DataFrame,
    score_df: pd.DataFrame,
) -> pd.DataFrame:
    """Compute theme prevalence among Promoters vs. Detractors.

    For each theme, calculates the percentage of Promoters and Detractors
    who mentioned that theme, plus the lift ratio
    (Detractor% / Promoter%).

    Args:
        theme_df: Respondent-level theme feature DataFrame.
        score_df: Respondent-level score DataFrame with nps_class.

    Returns:
        DataFrame with columns: theme_name, pct_promoters, pct_detractors,
        lift_ratio.
    """
    score_df_indexed = score_df.set_index("respondent_id")
    merged = theme_df.join(score_df_indexed, how="inner")

    # Identify theme columns (prefixed with "theme_")
    theme_cols = [c for c in theme_df.columns if c.startswith("theme_")]

    promoters = merged[merged["nps_class"] == 1]
    detractors = merged[merged["nps_class"] == 0]

    n_promoters = len(promoters)
    n_detractors = len(detractors)

    rows = []
    for col in theme_cols:
        theme_name = col.replace("theme_", "", 1)
        pct_prom = promoters[col].sum() / n_promoters * 100 if n_promoters > 0 else 0.0
        pct_det = detractors[col].sum() / n_detractors * 100 if n_detractors > 0 else 0.0
        # Lift ratio: how much more prevalent among detractors vs promoters
        lift = pct_det / pct_prom if pct_prom > 0 else float("inf")

        rows.append(
            {
                "theme_name": theme_name,
                "pct_promoters": round(pct_prom, 2),
                "pct_detractors": round(pct_det, 2),
                "lift_ratio": round(lift, 2) if lift != float("inf") else 999.99,
            }
        )

    prevalence_df = pd.DataFrame(rows)
    prevalence_df.sort_values("lift_ratio", ascending=False, inplace=True)
    prevalence_df.reset_index(drop=True, inplace=True)

    return prevalence_df


def analyze_touchpoints(
    df: pd.DataFrame,
    theme_df: pd.DataFrame,
    touchpoint_col: str = "touchpoint",
) -> list[TouchpointResult]:
    """Analyze satisfaction by customer touchpoint.

    For each touchpoint, computes mean satisfaction, Detractor rate, and
    identifies the most common positive and negative themes.

    Args:
        df: Survey response DataFrame containing a touchpoint column.
        theme_df: Respondent-level theme classifications.
        touchpoint_col: Name of the column identifying the touchpoint.

    Returns:
        List of TouchpointResult objects sorted by mean_satisfaction
        ascending (worst touchpoints first).
    """
    if touchpoint_col not in df.columns:
        logger.info("No touchpoint column '%s' found. Skipping.", touchpoint_col)
        return []

    df = df.copy()
    df["respondent_id"] = df["respondent_id"].astype(str)
    df["score"] = pd.to_numeric(df["score"], errors="coerce")

    results: list[TouchpointResult] = []

    for tp_name, tp_df in df.groupby(touchpoint_col):
        scores = tp_df["score"].dropna()
        if len(scores) == 0:
            continue

        mean_sat = float(scores.mean())
        n_responses = len(scores)
        pct_det = float((scores <= 6).sum() / n_responses * 100)

        # Find top positive and negative themes for this touchpoint
        tp_respondents = set(tp_df["respondent_id"].astype(str))
        tp_themes = theme_df.loc[theme_df.index.isin(tp_respondents)]

        theme_cols = [c for c in tp_themes.columns if c.startswith("theme_")]

        # For top themes, correlate with score direction
        # Positive themes: more common among high scorers
        # Negative themes: more common among low scorers
        top_positive = "N/A"
        top_negative = "N/A"

        if len(tp_themes) > 0 and theme_cols:
            # Merge with scores
            tp_merged = tp_themes.copy()
            score_lookup = tp_df.groupby("respondent_id")["score"].mean().to_dict()
            tp_merged["_score"] = [score_lookup.get(rid, np.nan) for rid in tp_merged.index]
            tp_merged.dropna(subset=["_score"], inplace=True)

            if len(tp_merged) > 5:
                # Compute correlation of each theme with score
                theme_corrs = {}
                for col in theme_cols:
                    if tp_merged[col].std() > 0:
                        corr = tp_merged[col].corr(tp_merged["_score"])
                        theme_corrs[col.replace("theme_", "", 1)] = corr

                if theme_corrs:
                    sorted_corrs = sorted(
                        theme_corrs.items(),
                        key=lambda x: x[1],
                    )
                    top_negative = sorted_corrs[0][0]
                    top_positive = sorted_corrs[-1][0]

        results.append(
            TouchpointResult(
                touchpoint_name=str(tp_name),
                mean_satisfaction=round(mean_sat, 2),
                n_responses=n_responses,
                pct_detractors=round(pct_det, 1),
                top_negative_theme=top_negative,
                top_positive_theme=top_positive,
            )
        )

    # Sort by mean satisfaction ascending (worst first)
    results.sort(key=lambda r: r.mean_satisfaction)
    return results


def generate_recommendations(
    drivers: list[DriverResult],
    touchpoints: list[TouchpointResult],
    top_n: int = 5,
) -> list[str]:
    """Generate actionable recommendation strings from driver and touchpoint analysis.

    Translates the quantitative driver rankings and touchpoint results
    into plain-language recommendations. Includes causal reasoning
    disclaimers.

    Args:
        drivers: Ranked list of DriverResult objects.
        touchpoints: List of TouchpointResult objects.
        top_n: Number of top recommendations to generate.

    Returns:
        List of recommendation strings.
    """
    recommendations: list[str] = []

    # Disclaimer
    recommendations.append(
        "Note: These recommendations are based on statistical associations "
        "between themes and NPS classification. They suggest areas of focus "
        "but do not prove causation."
    )

    # Top drivers where detractors mention the theme more than promoters
    negative_drivers = [d for d in drivers if d.lift_ratio > 1.0 and d.importance_score > 0]
    negative_drivers.sort(key=lambda d: d.importance_score, reverse=True)

    for d in negative_drivers[:top_n]:
        feature_name = d.feature_name.replace("theme_", "").replace("_", " ")
        recommendations.append(
            f"Address '{feature_name}': This theme is {d.lift_ratio:.1f}x more "
            f"prevalent among Detractors ({d.pct_detractors_with_theme:.0f}%) "
            f"than Promoters ({d.pct_promoters_with_theme:.0f}%). "
            f"Permutation importance rank: #{d.importance_rank}."
        )

    # Top positive drivers to reinforce
    positive_drivers = [d for d in drivers if d.lift_ratio < 1.0 and d.importance_score > 0]
    positive_drivers.sort(key=lambda d: d.importance_score, reverse=True)

    for d in positive_drivers[: min(2, top_n)]:
        feature_name = d.feature_name.replace("theme_", "").replace("_", " ")
        recommendations.append(
            f"Reinforce '{feature_name}': This theme is more prevalent among "
            f"Promoters ({d.pct_promoters_with_theme:.0f}%) than Detractors "
            f"({d.pct_detractors_with_theme:.0f}%). Continue investing here."
        )

    # Worst touchpoints
    if touchpoints:
        worst = touchpoints[: min(2, len(touchpoints))]
        for tp in worst:
            recommendations.append(
                f"Improve '{tp.touchpoint_name}' touchpoint: "
                f"Mean satisfaction {tp.mean_satisfaction:.1f}, "
                f"Detractor rate {tp.pct_detractors:.0f}%. "
                f"Top negative theme: '{tp.top_negative_theme}'."
            )

    return recommendations[: top_n + 2]  # disclaimer + top_n + up to 2 extras


# ---------------------------------------------------------------------------
# Orchestration and I/O
# ---------------------------------------------------------------------------


def run_key_driver_analysis(
    themes_path: Path,
    survey_path: Path,
    n_estimators: int = 500,
    random_seed: Optional[int] = None,
) -> KeyDriverReport:
    """Run the full key driver analysis pipeline.

    1. Load theme data and satisfaction scores.
    2. Build feature matrix (exclude Passives from classification).
    3. Train random forest and compute permutation importance.
    4. Compute theme prevalence among Promoters vs. Detractors.
    5. Analyze touchpoints if touchpoint data is available.
    6. Generate actionable recommendations.

    Args:
        themes_path: Path to text_themes.json.
        survey_path: Path to survey_responses.csv.
        n_estimators: Number of trees for the random forest.
        random_seed: Random seed for reproducibility.

    Returns:
        Complete KeyDriverReport.
    """
    from scipy.stats import spearmanr

    # Step 1: Load data
    theme_df = load_theme_data(themes_path)
    score_df = load_satisfaction_scores(survey_path)

    # Step 2: Build feature matrix
    X, y = build_feature_matrix(theme_df, score_df)

    # Step 3: Train model and compute permutation importance
    model, X_test, y_test, accuracy, auc = train_driver_model(
        X,
        y,
        n_estimators=n_estimators,
        random_seed=random_seed,
    )
    importance_df = compute_permutation_importance(
        model,
        X_test,
        y_test,
        random_seed=random_seed,
    )

    # Step 4: Compute theme prevalence
    prevalence_df = compute_theme_prevalence(theme_df, score_df)

    # Step 5: Build DriverResult list
    # Merge importance with prevalence data and compute Spearman correlations
    drivers: list[DriverResult] = []
    for rank, row in enumerate(importance_df.itertuples(), start=1):
        feature_name = row.feature_name
        theme_name = feature_name.replace("theme_", "", 1)

        # Prevalence lookup
        prev_row = prevalence_df[prevalence_df["theme_name"] == theme_name]
        if len(prev_row) > 0:
            pct_prom = float(prev_row.iloc[0]["pct_promoters"])
            pct_det = float(prev_row.iloc[0]["pct_detractors"])
            lift = float(prev_row.iloc[0]["lift_ratio"])
        else:
            pct_prom = 0.0
            pct_det = 0.0
            lift = 1.0

        # Spearman correlation with NPS score (using all respondents)
        score_indexed = score_df.set_index("respondent_id")
        merged_all = theme_df.join(score_indexed, how="inner")
        merged_all = merged_all.dropna(subset=["nps_score"])

        if feature_name in merged_all.columns and len(merged_all) > 2:
            try:
                corr, _ = spearmanr(
                    merged_all[feature_name],
                    merged_all["nps_score"],
                )
                if np.isnan(corr):
                    corr = 0.0
            except Exception:
                corr = 0.0
        else:
            corr = 0.0

        drivers.append(
            DriverResult(
                feature_name=feature_name,
                importance_score=round(float(row.importance_mean), 4),
                importance_std=round(float(row.importance_std), 4),
                importance_rank=rank,
                correlation_with_nps=round(float(corr), 4),
                pct_promoters_with_theme=pct_prom,
                pct_detractors_with_theme=pct_det,
                lift_ratio=lift,
            )
        )

    # Step 6: Touchpoint analysis
    survey_df = pd.read_csv(survey_path)
    touchpoints = analyze_touchpoints(survey_df, theme_df)

    # Step 7: Generate recommendations
    recommendations = generate_recommendations(drivers, touchpoints)

    return KeyDriverReport(
        drivers=drivers,
        touchpoints=touchpoints,
        model_accuracy=round(accuracy, 4),
        model_auc=round(auc, 4),
        n_respondents=len(X),
        recommendations=recommendations,
    )


def write_results(report: KeyDriverReport, output_path: Path) -> None:
    """Serialize the key driver report to JSON.

    Args:
        report: KeyDriverReport to serialize.
        output_path: Path for the output JSON file.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    data = {
        "drivers": [asdict(d) for d in report.drivers],
        "touchpoints": [asdict(t) for t in report.touchpoints],
        "model_accuracy": report.model_accuracy,
        "model_auc": report.model_auc,
        "n_respondents": report.n_respondents,
        "recommendations": report.recommendations,
    }

    with open(output_path, "w") as f:
        json.dump(data, f, indent=2, default=str)

    logger.info("Wrote key driver report to %s", output_path)


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
    parser = argparse.ArgumentParser(description="Key driver analysis: themes vs. satisfaction.")
    parser.add_argument(
        "--themes",
        type=Path,
        required=True,
        help="Path to text_themes.json",
    )
    parser.add_argument(
        "--survey",
        type=Path,
        required=True,
        help="Path to survey_responses.csv",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Path for output satisfaction_drivers.json",
    )
    parser.add_argument(
        "--n-estimators",
        type=int,
        default=500,
        help="Number of random forest trees (default: 500)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Random seed for reproducibility",
    )
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> None:
    """Main entry point for CLI execution.

    Args:
        argv: Optional argument list for testing.
    """
    args = parse_args(argv)
    logging.basicConfig(level=logging.INFO)

    logger.info("Running key driver analysis")
    report = run_key_driver_analysis(
        themes_path=args.themes,
        survey_path=args.survey,
        n_estimators=args.n_estimators,
        random_seed=args.seed,
    )

    write_results(report, args.output)
    logger.info(
        "Done. Identified %d drivers. Model AUC: %.3f",
        len(report.drivers),
        report.model_auc,
    )


if __name__ == "__main__":
    main()
