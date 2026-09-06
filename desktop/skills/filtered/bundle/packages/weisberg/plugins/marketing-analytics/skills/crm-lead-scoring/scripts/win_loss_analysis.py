"""
Win/Loss Analysis — Statistical comparison of won vs. lost deals, divergence
point identification, and competitive intelligence.

Identifies the features, stages, and competitive dynamics that differentiate
won deals from lost deals, producing ranked factor importance and actionable
insights.

Dependencies:
    pandas, numpy, scipy

Inputs:
    workspace/raw/crm_leads.csv
    workspace/raw/lead_activities.csv

Outputs:
    workspace/analysis/win_loss_factors.json
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


# ---------------------------------------------------------------------------
# Feature Comparison
# ---------------------------------------------------------------------------


def compare_continuous_features(
    won_deals: pd.DataFrame,
    lost_deals: pd.DataFrame,
    features: list[str],
    significance_level: float = 0.05,
) -> list[dict[str, Any]]:
    """Compare continuous features between won and lost deals using t-tests.

    For each continuous feature, performs a two-sample t-test (Welch's)
    to determine if the means differ significantly.

    Parameters
    ----------
    won_deals : pd.DataFrame
        Dataframe of won deals with feature columns.
    lost_deals : pd.DataFrame
        Dataframe of lost deals with feature columns.
    features : list[str]
        List of continuous feature column names to compare.
    significance_level : float
        p-value threshold for statistical significance.

    Returns
    -------
    list[dict[str, Any]]
        Per-feature results: ``feature``, ``won_mean``, ``won_std``,
        ``lost_mean``, ``lost_std``, ``t_statistic``, ``p_value``,
        ``effect_size`` (Cohen's d), ``significant`` (bool).
    """
    from scipy.stats import ttest_ind

    results = []
    for feat in features:
        if feat not in won_deals.columns or feat not in lost_deals.columns:
            continue

        won_vals = won_deals[feat].dropna().astype(float)
        lost_vals = lost_deals[feat].dropna().astype(float)

        if len(won_vals) < 2 or len(lost_vals) < 2:
            continue

        won_mean = float(won_vals.mean())
        won_std = float(won_vals.std())
        lost_mean = float(lost_vals.mean())
        lost_std = float(lost_vals.std())

        # Welch's t-test (equal_var=False)
        t_stat, p_val = ttest_ind(won_vals, lost_vals, equal_var=False)

        # Cohen's d
        pooled_std = np.sqrt(
            ((len(won_vals) - 1) * won_std**2 + (len(lost_vals) - 1) * lost_std**2)
            / (len(won_vals) + len(lost_vals) - 2)
        )
        cohens_d = (won_mean - lost_mean) / pooled_std if pooled_std > 0 else 0.0

        results.append(
            {
                "feature": feat,
                "won_mean": round(won_mean, 4),
                "won_std": round(won_std, 4),
                "lost_mean": round(lost_mean, 4),
                "lost_std": round(lost_std, 4),
                "t_statistic": round(float(t_stat), 4),
                "p_value": float(p_val),
                "effect_size": round(float(cohens_d), 4),
                "significant": bool(p_val < significance_level),
            }
        )

    return results


def compare_categorical_features(
    won_deals: pd.DataFrame,
    lost_deals: pd.DataFrame,
    features: list[str],
    significance_level: float = 0.05,
) -> list[dict[str, Any]]:
    """Compare categorical features between won and lost deals using chi-squared.

    For each categorical feature, performs a chi-squared test of independence
    to determine if the distribution differs between outcomes.

    Parameters
    ----------
    won_deals : pd.DataFrame
        Dataframe of won deals.
    lost_deals : pd.DataFrame
        Dataframe of lost deals.
    features : list[str]
        List of categorical feature column names to compare.
    significance_level : float
        p-value threshold for statistical significance.

    Returns
    -------
    list[dict[str, Any]]
        Per-feature results: ``feature``, ``chi2_statistic``, ``p_value``,
        ``cramers_v`` (effect size), ``significant`` (bool),
        ``won_distribution`` (dict), ``lost_distribution`` (dict).
    """
    from scipy.stats import chi2_contingency

    results = []
    for feat in features:
        if feat not in won_deals.columns or feat not in lost_deals.columns:
            continue

        won_vals = won_deals[feat].dropna()
        lost_vals = lost_deals[feat].dropna()

        if len(won_vals) < 2 or len(lost_vals) < 2:
            continue

        # Build contingency table
        won_counts = won_vals.value_counts()
        lost_counts = lost_vals.value_counts()

        all_categories = sorted(set(won_counts.index) | set(lost_counts.index))
        if len(all_categories) < 2:
            continue

        contingency = pd.DataFrame(
            {
                "won": won_counts.reindex(all_categories, fill_value=0),
                "lost": lost_counts.reindex(all_categories, fill_value=0),
            }
        )

        chi2, p_val, dof, _ = chi2_contingency(contingency.T.values)

        # Cramer's V
        n = contingency.values.sum()
        min_dim = min(contingency.shape[0], contingency.shape[1]) - 1
        cramers_v = np.sqrt(chi2 / (n * min_dim)) if n > 0 and min_dim > 0 else 0.0

        # Distribution as percentages
        won_dist = (won_counts / won_counts.sum()).round(4).to_dict()
        lost_dist = (lost_counts / lost_counts.sum()).round(4).to_dict()

        results.append(
            {
                "feature": feat,
                "chi2_statistic": round(float(chi2), 4),
                "p_value": float(p_val),
                "cramers_v": round(float(cramers_v), 4),
                "significant": bool(p_val < significance_level),
                "won_distribution": {str(k): float(v) for k, v in won_dist.items()},
                "lost_distribution": {str(k): float(v) for k, v in lost_dist.items()},
            }
        )

    return results


def rank_differentiating_factors(
    continuous_results: list[dict[str, Any]],
    categorical_results: list[dict[str, Any]],
    top_k: int = 10,
) -> list[dict[str, Any]]:
    """Rank all features by their ability to differentiate won from lost deals.

    Combines continuous and categorical test results and ranks by effect
    size magnitude. Only includes statistically significant factors.

    Parameters
    ----------
    continuous_results : list[dict]
        Results from ``compare_continuous_features``.
    categorical_results : list[dict]
        Results from ``compare_categorical_features``.
    top_k : int
        Number of top differentiating factors to return.

    Returns
    -------
    list[dict[str, Any]]
        Ranked list of significant factors with ``rank``, ``feature``,
        ``feature_type`` (continuous/categorical), ``effect_size``,
        ``p_value``, ``direction`` (e.g., "higher in won deals").
    """
    candidates = []

    for r in continuous_results:
        if r["significant"]:
            direction = "higher in won deals" if r["effect_size"] > 0 else "higher in lost deals"
            candidates.append(
                {
                    "feature": r["feature"],
                    "feature_type": "continuous",
                    "effect_size": abs(r["effect_size"]),
                    "p_value": r["p_value"],
                    "direction": direction,
                }
            )

    for r in categorical_results:
        if r["significant"]:
            candidates.append(
                {
                    "feature": r["feature"],
                    "feature_type": "categorical",
                    "effect_size": r["cramers_v"],
                    "p_value": r["p_value"],
                    "direction": "distribution differs between won and lost",
                }
            )

    # Sort by effect size descending
    candidates.sort(key=lambda x: x["effect_size"], reverse=True)
    candidates = candidates[:top_k]

    # Add rank
    for i, c in enumerate(candidates):
        c["rank"] = i + 1

    return candidates


# ---------------------------------------------------------------------------
# Temporal Divergence Analysis
# ---------------------------------------------------------------------------


def compute_stage_outcome_rates(
    deals: pd.DataFrame,
    stage_order: list[str],
) -> pd.DataFrame:
    """Compute win/loss rates at each pipeline stage.

    For each stage, calculates the fraction of deals that reach that stage
    and ultimately win vs. lose.

    Parameters
    ----------
    deals : pd.DataFrame
        CRM deals with ``deal_id``, ``outcome``, and stage history.
    stage_order : list[str]
        Ordered pipeline stage names.

    Returns
    -------
    pd.DataFrame
        Columns: ``stage``, ``total_reaching_stage``, ``won_count``,
        ``lost_count``, ``win_rate_at_stage``, ``cumulative_drop_rate``.
    """
    stage_index = {s: i for i, s in enumerate(stage_order)}
    deals = deals.copy()

    def _max_stage_idx(row: pd.Series) -> int:
        max_idx = -1
        for stage in stage_order:
            entry_col = f"stage_{stage}_date"
            if entry_col in deals.columns and pd.notna(row.get(entry_col)):
                max_idx = max(max_idx, stage_index[stage])
        current = row.get("stage")
        if current in stage_index:
            max_idx = max(max_idx, stage_index[current])
        return max_idx

    deals["_max_stage_idx"] = deals.apply(_max_stage_idx, axis=1)
    deals["_is_won"] = deals["outcome"].str.lower().isin(["won", "closed won", "1", "true"])
    deals["_is_lost"] = deals["outcome"].str.lower().isin(["lost", "closed lost", "0", "false"])

    total_deals = len(deals)
    results = []

    for i, stage in enumerate(stage_order):
        reached = deals[deals["_max_stage_idx"] >= i]
        total_reaching = len(reached)
        won_count = int(reached["_is_won"].sum())
        lost_count = int(reached["_is_lost"].sum())
        win_rate = won_count / total_reaching if total_reaching > 0 else 0.0
        cumulative_drop = 1.0 - (total_reaching / total_deals) if total_deals > 0 else 0.0

        results.append(
            {
                "stage": stage,
                "total_reaching_stage": total_reaching,
                "won_count": won_count,
                "lost_count": lost_count,
                "win_rate_at_stage": round(win_rate, 4),
                "cumulative_drop_rate": round(cumulative_drop, 4),
            }
        )

    return pd.DataFrame(results)


def identify_divergence_point(
    stage_outcome_rates: pd.DataFrame,
    divergence_threshold: float = 0.1,
) -> dict[str, Any]:
    """Identify the pipeline stage where lost deals begin diverging.

    Looks for the stage at which the win rate drops most sharply compared
    to the prior stage, indicating the critical decision point.

    Parameters
    ----------
    stage_outcome_rates : pd.DataFrame
        Output from ``compute_stage_outcome_rates``.
    divergence_threshold : float
        Minimum win-rate drop between stages to flag as divergence point.

    Returns
    -------
    dict[str, Any]
        Keys: ``divergence_stage``, ``win_rate_before``, ``win_rate_after``,
        ``drop_magnitude``, ``deals_lost_at_stage`` (count).
    """
    rates = stage_outcome_rates["win_rate_at_stage"].values

    if len(rates) < 2:
        return {
            "divergence_stage": None,
            "win_rate_before": None,
            "win_rate_after": None,
            "drop_magnitude": 0.0,
            "deals_lost_at_stage": 0,
        }

    # Compute stage-over-stage win rate changes
    max_drop = 0.0
    divergence_idx = 0

    for i in range(1, len(rates)):
        drop = rates[i - 1] - rates[i]
        if drop > max_drop:
            max_drop = drop
            divergence_idx = i

    if max_drop < divergence_threshold:
        return {
            "divergence_stage": None,
            "win_rate_before": None,
            "win_rate_after": None,
            "drop_magnitude": round(float(max_drop), 4),
            "deals_lost_at_stage": 0,
        }

    row = stage_outcome_rates.iloc[divergence_idx]
    prev_row = stage_outcome_rates.iloc[divergence_idx - 1]

    deals_lost = int(prev_row["total_reaching_stage"] - row["total_reaching_stage"])

    return {
        "divergence_stage": row["stage"],
        "win_rate_before": round(float(prev_row["win_rate_at_stage"]), 4),
        "win_rate_after": round(float(row["win_rate_at_stage"]), 4),
        "drop_magnitude": round(float(max_drop), 4),
        "deals_lost_at_stage": max(deals_lost, 0),
    }


def analyze_time_in_stage_by_outcome(
    deals: pd.DataFrame,
    stage_order: list[str],
) -> pd.DataFrame:
    """Compare time-in-stage distributions for won vs. lost deals.

    Identifies stages where lost deals spend significantly more or less
    time than won deals.

    Parameters
    ----------
    deals : pd.DataFrame
        CRM deals with stage entry/exit timestamps and ``outcome``.
    stage_order : list[str]
        Ordered pipeline stage names.

    Returns
    -------
    pd.DataFrame
        Columns: ``stage``, ``outcome``, ``median_days``, ``mean_days``,
        ``p75_days``, ``p_value`` (t-test comparing won vs. lost).
    """
    from scipy.stats import ttest_ind

    deals = deals.copy()
    deals["_is_won"] = deals["outcome"].str.lower().isin(["won", "closed won", "1", "true"])

    results = []

    for i, stage in enumerate(stage_order):
        entry_col = f"stage_{stage}_date"
        if i + 1 < len(stage_order):
            exit_col = f"stage_{stage_order[i + 1]}_date"
        else:
            exit_col = "close_date"

        if entry_col not in deals.columns or exit_col not in deals.columns:
            continue

        entry = pd.to_datetime(deals[entry_col], errors="coerce")
        exit_ = pd.to_datetime(deals[exit_col], errors="coerce")
        days = (exit_ - entry).dt.days
        deals[f"_days_in_{stage}"] = days

        for outcome_label, mask in [("won", deals["_is_won"]), ("lost", ~deals["_is_won"])]:
            subset = days[mask].dropna()
            subset = subset[subset >= 0]

            if len(subset) < 1:
                continue

            results.append(
                {
                    "stage": stage,
                    "outcome": outcome_label,
                    "median_days": float(subset.median()),
                    "mean_days": float(subset.mean()),
                    "p75_days": float(subset.quantile(0.75)) if len(subset) > 0 else None,
                }
            )

        # Compute p-value between won and lost
        won_days = days[deals["_is_won"]].dropna()
        lost_days = days[~deals["_is_won"]].dropna()
        won_days = won_days[won_days >= 0]
        lost_days = lost_days[lost_days >= 0]

        if len(won_days) >= 2 and len(lost_days) >= 2:
            _, p_val = ttest_ind(won_days, lost_days, equal_var=False)
            # Attach p_value to both rows for this stage
            for r in results:
                if r["stage"] == stage:
                    r["p_value"] = float(p_val)
        else:
            for r in results:
                if r["stage"] == stage and "p_value" not in r:
                    r["p_value"] = None

    return pd.DataFrame(results)


# ---------------------------------------------------------------------------
# Competitive Win/Loss Analysis
# ---------------------------------------------------------------------------


def compute_competitive_win_rates(
    deals: pd.DataFrame,
    competitor_column: str = "competitor_mentioned",
) -> pd.DataFrame:
    """Compute win rates when specific competitors are mentioned.

    Calculates how the presence of each competitor affects the win rate
    and average deal cycle time.

    Parameters
    ----------
    deals : pd.DataFrame
        CRM deals with ``outcome`` and a column indicating competitor
        presence (may be a comma-separated list or boolean flags).
    competitor_column : str
        Column containing competitor information.

    Returns
    -------
    pd.DataFrame
        Columns: ``competitor``, ``deal_count``, ``win_count``,
        ``win_rate``, ``avg_cycle_days``, ``avg_deal_size``,
        ``win_rate_vs_baseline`` (difference from overall win rate).
    """
    if competitor_column not in deals.columns:
        return pd.DataFrame(
            columns=[
                "competitor",
                "deal_count",
                "win_count",
                "win_rate",
                "avg_cycle_days",
                "avg_deal_size",
                "win_rate_vs_baseline",
            ]
        )

    deals = deals.copy()
    deals["_is_won"] = deals["outcome"].str.lower().isin(["won", "closed won", "1", "true"])

    if "close_date" in deals.columns and "created_date" in deals.columns:
        deals["_cycle_days"] = (
            pd.to_datetime(deals["close_date"], errors="coerce")
            - pd.to_datetime(deals["created_date"], errors="coerce")
        ).dt.days

    # Parse competitors: may be comma-separated or single values
    competitors_series = deals[competitor_column].dropna().astype(str)

    # Explode comma-separated competitors
    exploded = []
    for idx, val in competitors_series.items():
        for comp in val.split(","):
            comp = comp.strip()
            if comp and comp.lower() not in ("none", "nan", ""):
                exploded.append({"_idx": idx, "competitor": comp})

    if not exploded:
        return pd.DataFrame(
            columns=[
                "competitor",
                "deal_count",
                "win_count",
                "win_rate",
                "avg_cycle_days",
                "avg_deal_size",
                "win_rate_vs_baseline",
            ]
        )

    comp_df = pd.DataFrame(exploded)

    # Overall baseline win rate
    overall_win_rate = float(deals["_is_won"].mean())

    results = []
    for competitor, group in comp_df.groupby("competitor"):
        indices = group["_idx"].values
        comp_deals = deals.loc[indices]
        deal_count = len(comp_deals)
        win_count = int(comp_deals["_is_won"].sum())
        win_rate = win_count / deal_count if deal_count > 0 else 0.0

        avg_cycle = float(comp_deals["_cycle_days"].mean()) if "_cycle_days" in comp_deals.columns else None
        avg_size = float(comp_deals["amount"].mean()) if "amount" in comp_deals.columns else None

        results.append(
            {
                "competitor": competitor,
                "deal_count": deal_count,
                "win_count": win_count,
                "win_rate": round(win_rate, 4),
                "avg_cycle_days": round(avg_cycle, 1) if avg_cycle is not None else None,
                "avg_deal_size": round(avg_size, 2) if avg_size is not None else None,
                "win_rate_vs_baseline": round(win_rate - overall_win_rate, 4),
            }
        )

    return pd.DataFrame(results)


def analyze_competitive_factors(
    deals: pd.DataFrame,
    competitor: str,
    features: list[str],
) -> dict[str, Any]:
    """Deep-dive into what differentiates wins vs. losses against a competitor.

    Parameters
    ----------
    deals : pd.DataFrame
        CRM deals filtered to those mentioning the specified competitor.
    competitor : str
        Competitor name to analyze.
    features : list[str]
        Feature columns to compare for won vs. lost against this competitor.

    Returns
    -------
    dict[str, Any]
        Keys: ``competitor``, ``total_deals``, ``win_rate``,
        ``differentiating_factors`` (ranked list of feature differences).
    """
    deals = deals.copy()
    deals["_is_won"] = deals["outcome"].str.lower().isin(["won", "closed won", "1", "true"])

    won = deals[deals["_is_won"]]
    lost = deals[~deals["_is_won"]]

    total = len(deals)
    win_rate = float(deals["_is_won"].mean()) if total > 0 else 0.0

    # Determine which features are continuous vs categorical
    continuous_feats = []
    categorical_feats = []
    for f in features:
        if f not in deals.columns:
            continue
        if pd.api.types.is_numeric_dtype(deals[f]):
            continuous_feats.append(f)
        else:
            categorical_feats.append(f)

    cont_results = compare_continuous_features(won, lost, continuous_feats)
    cat_results = compare_categorical_features(won, lost, categorical_feats)
    ranked = rank_differentiating_factors(cont_results, cat_results, top_k=5)

    return {
        "competitor": competitor,
        "total_deals": total,
        "win_rate": round(win_rate, 4),
        "differentiating_factors": ranked,
    }


# ---------------------------------------------------------------------------
# Lead Source Quality Analysis
# ---------------------------------------------------------------------------


def compute_source_quality_metrics(
    deals: pd.DataFrame,
    source_column: str = "source",
) -> pd.DataFrame:
    """Evaluate lead quality by marketing source/channel.

    For each lead source, computes conversion rate, average deal size,
    average cycle time, and total revenue contribution.

    Parameters
    ----------
    deals : pd.DataFrame
        CRM deals with ``source``, ``outcome``, ``amount``, ``created_date``,
        ``close_date``.
    source_column : str
        Column containing lead source/channel.

    Returns
    -------
    pd.DataFrame
        Columns: ``source``, ``lead_count``, ``won_count``, ``win_rate``,
        ``avg_deal_size``, ``total_revenue``, ``avg_cycle_days``,
        ``quality_score`` (composite ranking).
    """
    if source_column not in deals.columns:
        return pd.DataFrame(
            columns=[
                "source",
                "lead_count",
                "won_count",
                "win_rate",
                "avg_deal_size",
                "total_revenue",
                "avg_cycle_days",
                "quality_score",
            ]
        )

    deals = deals.copy()
    deals["_is_won"] = deals["outcome"].str.lower().isin(["won", "closed won", "1", "true"])

    if "close_date" in deals.columns and "created_date" in deals.columns:
        deals["_cycle_days"] = (
            pd.to_datetime(deals["close_date"], errors="coerce")
            - pd.to_datetime(deals["created_date"], errors="coerce")
        ).dt.days

    results = []
    for source, group in deals.groupby(source_column):
        lead_count = len(group)
        won = group[group["_is_won"]]
        won_count = len(won)
        win_rate = won_count / lead_count if lead_count > 0 else 0.0
        avg_deal_size = float(won["amount"].mean()) if len(won) > 0 else 0.0
        total_revenue = float(won["amount"].sum())
        avg_cycle = float(won["_cycle_days"].mean()) if "_cycle_days" in won.columns and len(won) > 0 else None

        results.append(
            {
                "source": source,
                "lead_count": lead_count,
                "won_count": won_count,
                "win_rate": round(win_rate, 4),
                "avg_deal_size": round(avg_deal_size, 2),
                "total_revenue": round(total_revenue, 2),
                "avg_cycle_days": round(avg_cycle, 1) if avg_cycle is not None else None,
            }
        )

    df = pd.DataFrame(results)

    # Compute composite quality score:
    # Normalize win_rate, avg_deal_size, total_revenue to 0-1 and combine
    if len(df) > 0:

        def _normalize(series: pd.Series) -> pd.Series:
            smin, smax = series.min(), series.max()
            if smax == smin:
                return pd.Series(0.5, index=series.index)
            return (series - smin) / (smax - smin)

        wr_norm = _normalize(df["win_rate"])
        rev_norm = _normalize(df["total_revenue"])
        size_norm = _normalize(df["avg_deal_size"])

        # Lower cycle days is better, so invert
        if df["avg_cycle_days"].notna().any():
            cycle_norm = 1.0 - _normalize(df["avg_cycle_days"].fillna(df["avg_cycle_days"].max()))
        else:
            cycle_norm = pd.Series(0.5, index=df.index)

        df["quality_score"] = (0.35 * wr_norm + 0.30 * rev_norm + 0.20 * size_norm + 0.15 * cycle_norm).round(4)
    else:
        df["quality_score"] = pd.Series(dtype=float)

    return df.sort_values("quality_score", ascending=False).reset_index(drop=True)


# ---------------------------------------------------------------------------
# Behavioral Pattern Analysis
# ---------------------------------------------------------------------------


def compare_engagement_patterns(
    won_activities: pd.DataFrame,
    lost_activities: pd.DataFrame,
    activity_types: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Compare behavioral engagement patterns between won and lost deals.

    Analyzes activity volume, timing, and diversity for each outcome group.

    Parameters
    ----------
    won_activities : pd.DataFrame
        Activities for won deals: ``lead_id``, ``activity_type``,
        ``timestamp``.
    lost_activities : pd.DataFrame
        Activities for lost deals.
    activity_types : list[str] or None
        Specific activity types to compare. If None, compares all types
        found in the data.

    Returns
    -------
    list[dict[str, Any]]
        Per-activity-type comparison: ``activity_type``,
        ``won_avg_count``, ``lost_avg_count``, ``t_statistic``,
        ``p_value``, ``significant``.
    """
    from scipy.stats import ttest_ind

    if activity_types is None:
        all_types = set(won_activities["activity_type"].unique()) | set(lost_activities["activity_type"].unique())
        activity_types = sorted(all_types)

    results = []
    for atype in activity_types:
        # Count per lead for each outcome
        won_counts = won_activities[won_activities["activity_type"] == atype].groupby("lead_id").size()
        lost_counts = lost_activities[lost_activities["activity_type"] == atype].groupby("lead_id").size()

        # Include leads with zero activity of this type
        won_leads = won_activities["lead_id"].unique()
        lost_leads = lost_activities["lead_id"].unique()

        won_per_lead = won_counts.reindex(won_leads, fill_value=0).values.astype(float)
        lost_per_lead = lost_counts.reindex(lost_leads, fill_value=0).values.astype(float)

        won_avg = float(won_per_lead.mean()) if len(won_per_lead) > 0 else 0.0
        lost_avg = float(lost_per_lead.mean()) if len(lost_per_lead) > 0 else 0.0

        if len(won_per_lead) >= 2 and len(lost_per_lead) >= 2:
            t_stat, p_val = ttest_ind(won_per_lead, lost_per_lead, equal_var=False)
        else:
            t_stat, p_val = 0.0, 1.0

        results.append(
            {
                "activity_type": atype,
                "won_avg_count": round(won_avg, 4),
                "lost_avg_count": round(lost_avg, 4),
                "t_statistic": round(float(t_stat), 4),
                "p_value": float(p_val),
                "significant": bool(p_val < 0.05),
            }
        )

    return results


def compute_engagement_timeline(
    activities: pd.DataFrame,
    deals: pd.DataFrame,
    window_days: int = 7,
) -> pd.DataFrame:
    """Build a weekly engagement timeline comparing won vs. lost deals.

    Shows how engagement volume evolves over the deal lifecycle for each
    outcome, helping identify where lost deals disengage.

    Parameters
    ----------
    activities : pd.DataFrame
        Activity data with ``lead_id``, ``activity_type``, ``timestamp``.
    deals : pd.DataFrame
        Deal data with ``lead_id``, ``created_date``, ``outcome``.
    window_days : int
        Size of each time window in days.

    Returns
    -------
    pd.DataFrame
        Columns: ``week_number``, ``outcome``, ``avg_activities``,
        ``active_deal_pct`` (% of deals with any activity that week).
    """
    merged = activities.merge(
        deals[["lead_id", "created_date", "outcome"]],
        on="lead_id",
        how="inner",
    )

    merged["timestamp"] = pd.to_datetime(merged["timestamp"])
    merged["created_date"] = pd.to_datetime(merged["created_date"])
    merged["days_since_creation"] = (merged["timestamp"] - merged["created_date"]).dt.days
    merged = merged[merged["days_since_creation"] >= 0]
    merged["week_number"] = merged["days_since_creation"] // window_days

    merged["_outcome_label"] = np.where(
        merged["outcome"].str.lower().isin(["won", "closed won", "1", "true"]),
        "won",
        "lost",
    )

    # Count activities per lead per week per outcome
    grouped = merged.groupby(["week_number", "_outcome_label", "lead_id"]).size().reset_index(name="activity_count")

    # Total leads per outcome
    outcome_leads = deals.copy()
    outcome_leads["_outcome_label"] = np.where(
        outcome_leads["outcome"].str.lower().isin(["won", "closed won", "1", "true"]),
        "won",
        "lost",
    )
    total_by_outcome = outcome_leads.groupby("_outcome_label")["lead_id"].nunique()

    results = []
    max_week = int(grouped["week_number"].max()) if len(grouped) > 0 else 0
    max_week = min(max_week, 26)  # Cap at 26 weeks

    for week in range(max_week + 1):
        for outcome in ["won", "lost"]:
            week_data = grouped[(grouped["week_number"] == week) & (grouped["_outcome_label"] == outcome)]
            avg_activities = float(week_data["activity_count"].mean()) if len(week_data) > 0 else 0.0
            active_leads = week_data["lead_id"].nunique()
            total_leads = total_by_outcome.get(outcome, 1)
            active_pct = (active_leads / total_leads * 100) if total_leads > 0 else 0.0

            results.append(
                {
                    "week_number": week,
                    "outcome": outcome,
                    "avg_activities": round(avg_activities, 2),
                    "active_deal_pct": round(active_pct, 2),
                }
            )

    return pd.DataFrame(results)


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


def generate_win_loss_output(
    ranked_factors: list[dict[str, Any]],
    divergence: dict[str, Any],
    competitive_rates: pd.DataFrame,
    source_quality: pd.DataFrame,
    engagement_comparison: list[dict[str, Any]],
    stage_time_comparison: pd.DataFrame,
    output_path: str | Path,
) -> None:
    """Write win_loss_factors.json with all analysis results.

    Parameters
    ----------
    ranked_factors : list[dict]
        Top differentiating factors between won/lost deals.
    divergence : dict
        Divergence point analysis results.
    competitive_rates : pd.DataFrame
        Competitive win rate analysis.
    source_quality : pd.DataFrame
        Lead source quality metrics.
    engagement_comparison : list[dict]
        Behavioral pattern comparison.
    stage_time_comparison : pd.DataFrame
        Time-in-stage comparison by outcome.
    output_path : str | Path
        Path to write ``win_loss_factors.json``.
    """
    output = {
        "top_differentiating_factors": ranked_factors,
        "divergence_point": divergence,
        "competitive_win_rates": competitive_rates.to_dict(orient="records"),
        "source_quality": source_quality.to_dict(orient="records"),
        "engagement_comparison": engagement_comparison,
        "stage_time_comparison": stage_time_comparison.to_dict(orient="records"),
    }

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2, default=str)


# ---------------------------------------------------------------------------
# Main Orchestration
# ---------------------------------------------------------------------------


def run_win_loss_analysis(
    deals_path: str | Path,
    activities_path: str | Path,
    output_path: str | Path,
    stage_order: list[str] | None = None,
    significance_level: float = 0.05,
    top_k_factors: int = 10,
) -> dict[str, Any]:
    """Execute the full win/loss analysis pipeline.

    Steps:
    1. Load and validate deal and activity data
    2. Split deals into won/lost groups
    3. Compare continuous and categorical features
    4. Rank differentiating factors
    5. Compute stage outcome rates and identify divergence point
    6. Analyze time-in-stage by outcome
    7. Compute competitive win rates
    8. Evaluate lead source quality
    9. Compare engagement patterns
    10. Generate output JSON

    Parameters
    ----------
    deals_path : str | Path
        Path to ``crm_leads.csv``.
    activities_path : str | Path
        Path to ``lead_activities.csv``.
    output_path : str | Path
        Path to write ``win_loss_factors.json``.
    stage_order : list[str] or None
        Pipeline stage names in order. Defaults to standard stages.
    significance_level : float
        p-value threshold for statistical significance.
    top_k_factors : int
        Number of top differentiating factors to report.

    Returns
    -------
    dict[str, Any]
        Summary with top factors, divergence point, competitive insights,
        and source quality rankings.
    """
    if stage_order is None:
        stage_order = [
            "MQL",
            "SQL",
            "Opportunity",
            "Proposal",
            "Negotiation",
            "Closed Won",
        ]

    # 1. Load data
    deals = pd.read_csv(deals_path)
    deals["created_date"] = pd.to_datetime(deals["created_date"])
    if "close_date" in deals.columns:
        deals["close_date"] = pd.to_datetime(deals["close_date"], errors="coerce")
    deals["amount"] = pd.to_numeric(deals.get("amount", 0), errors="coerce").fillna(0.0)
    if "outcome" not in deals.columns:
        deals["outcome"] = ""

    activities = pd.read_csv(activities_path)
    activities["timestamp"] = pd.to_datetime(activities["timestamp"])

    # 2. Split into won/lost
    deals["_is_won"] = deals["outcome"].str.lower().isin(["won", "closed won", "1", "true"])
    deals["_is_lost"] = deals["outcome"].str.lower().isin(["lost", "closed lost", "0", "false"])

    won_deals = deals[deals["_is_won"]].copy()
    lost_deals = deals[deals["_is_lost"]].copy()

    # 3. Identify continuous and categorical feature columns
    exclude_cols = {
        "lead_id",
        "deal_id",
        "outcome",
        "stage",
        "created_date",
        "close_date",
        "owner",
        "description",
        "deal_name",
        "_is_won",
        "_is_lost",
    }
    feature_cols = [c for c in deals.columns if c not in exclude_cols and not c.startswith("stage_")]

    continuous_features = [c for c in feature_cols if pd.api.types.is_numeric_dtype(deals[c])]
    categorical_features = [
        c for c in feature_cols if not pd.api.types.is_numeric_dtype(deals[c]) and deals[c].nunique() < 50
    ]

    # 4. Compare features
    cont_results = compare_continuous_features(won_deals, lost_deals, continuous_features, significance_level)
    cat_results = compare_categorical_features(won_deals, lost_deals, categorical_features, significance_level)

    # 5. Rank factors
    ranked_factors = rank_differentiating_factors(cont_results, cat_results, top_k=top_k_factors)

    # 6. Stage outcome rates and divergence
    stage_rates = compute_stage_outcome_rates(deals, stage_order)
    divergence = identify_divergence_point(stage_rates)

    # 7. Time-in-stage by outcome
    stage_time = analyze_time_in_stage_by_outcome(deals, stage_order)

    # 8. Competitive win rates
    competitive_rates = compute_competitive_win_rates(deals)

    # 9. Lead source quality
    source_quality = compute_source_quality_metrics(deals)

    # 10. Engagement patterns
    won_activities = activities[activities["lead_id"].isin(won_deals["lead_id"])]
    lost_activities = activities[activities["lead_id"].isin(lost_deals["lead_id"])]
    engagement = compare_engagement_patterns(won_activities, lost_activities)

    # 11. Generate output
    generate_win_loss_output(
        ranked_factors,
        divergence,
        competitive_rates,
        source_quality,
        engagement,
        stage_time,
        output_path,
    )

    return {
        "n_won": len(won_deals),
        "n_lost": len(lost_deals),
        "significant_factors_count": len(ranked_factors),
        "top_factors": ranked_factors[:3] if ranked_factors else [],
        "divergence_point": divergence,
        "n_competitors_analyzed": len(competitive_rates),
        "n_sources_analyzed": len(source_quality),
        "output_path": str(output_path),
    }
