"""
Pipeline Velocity — Stage conversion rates, deal cycle time distributions,
pipeline coverage ratio, and pipeline forecasting.

Computes pipeline health metrics from CRM opportunity data, identifies
bottlenecks and stalled deals, and produces weighted revenue projections.

Dependencies:
    pandas, numpy, scipy

Inputs:
    workspace/raw/crm_leads.csv

Outputs:
    workspace/analysis/pipeline_metrics.json
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd


# ---------------------------------------------------------------------------
# Stage Conversion Rates
# ---------------------------------------------------------------------------


def compute_stage_conversion_rates(
    deals: pd.DataFrame,
    stage_order: list[str],
    period_column: Optional[str] = None,
) -> pd.DataFrame:
    """Calculate conversion rates between consecutive pipeline stages.

    For each pair of adjacent stages, computes the fraction of deals that
    advance from stage N to stage N+1.

    Parameters
    ----------
    deals : pd.DataFrame
        CRM deals dataframe with at minimum ``deal_id``, ``stage``, and
        stage history columns.
    stage_order : list[str]
        Ordered list of pipeline stage names from earliest to latest
        (e.g., ``["MQL", "SQL", "Opportunity", "Proposal", "Negotiation",
        "Closed Won"]``).
    period_column : str or None
        Optional column for period-over-period grouping (e.g.,
        ``"created_month"``). If provided, conversion rates are computed
        per period.

    Returns
    -------
    pd.DataFrame
        Columns: ``from_stage``, ``to_stage``, ``deals_entered``,
        ``deals_advanced``, ``conversion_rate``. If ``period_column`` is
        provided, includes an additional period column.
    """
    # Build a set of stages each deal has reached based on stage history columns
    # or the current stage (using stage ordering)
    stage_index = {s: i for i, s in enumerate(stage_order)}

    # Determine the highest stage each deal has reached
    def max_stage_reached(row: pd.Series) -> int:
        """Return the index of the highest stage a deal has reached."""
        # Check for stage history columns (e.g., stage_MQL_date, stage_SQL_date)
        max_idx = -1
        for stage in stage_order:
            entry_col = f"stage_{stage}_date"
            if entry_col in deals.columns and pd.notna(row.get(entry_col)):
                max_idx = max(max_idx, stage_index[stage])
        # Also consider the current stage
        current = row.get("stage")
        if current in stage_index:
            max_idx = max(max_idx, stage_index[current])
        return max_idx

    deals = deals.copy()
    deals["_max_stage_idx"] = deals.apply(max_stage_reached, axis=1)

    def _compute_rates(group: pd.DataFrame) -> list[dict[str, Any]]:
        records = []
        for i in range(len(stage_order) - 1):
            from_stage = stage_order[i]
            to_stage = stage_order[i + 1]
            entered = int((group["_max_stage_idx"] >= i).sum())
            advanced = int((group["_max_stage_idx"] >= i + 1).sum())
            rate = advanced / entered if entered > 0 else 0.0
            records.append(
                {
                    "from_stage": from_stage,
                    "to_stage": to_stage,
                    "deals_entered": entered,
                    "deals_advanced": advanced,
                    "conversion_rate": round(rate, 4),
                }
            )
        return records

    if period_column and period_column in deals.columns:
        all_records = []
        for period, group in deals.groupby(period_column):
            rates = _compute_rates(group)
            for r in rates:
                r[period_column] = period
                all_records.append(r)
        return pd.DataFrame(all_records)
    else:
        return pd.DataFrame(_compute_rates(deals))


def detect_conversion_anomalies(
    current_rates: pd.DataFrame,
    historical_rates: pd.DataFrame,
    threshold_pct: float = 10.0,
) -> list[dict[str, Any]]:
    """Flag stages where conversion rate dropped significantly.

    Compares current period conversion rates to the trailing 3-month
    average and flags drops exceeding the threshold.

    Parameters
    ----------
    current_rates : pd.DataFrame
        Current period stage conversion rates.
    historical_rates : pd.DataFrame
        Historical stage conversion rates (trailing 3+ months).
    threshold_pct : float
        Percentage point drop threshold to trigger a flag.

    Returns
    -------
    list[dict[str, Any]]
        List of anomaly dicts with keys: ``stage``, ``current_rate``,
        ``historical_avg``, ``drop_pct``, ``severity``.
    """
    # Compute historical average per stage transition
    hist_avg = historical_rates.groupby("from_stage")["conversion_rate"].mean()

    anomalies = []
    for _, row in current_rates.iterrows():
        stage = row["from_stage"]
        current_rate = row["conversion_rate"]
        if stage in hist_avg.index:
            avg_rate = hist_avg[stage]
            drop_pct = (avg_rate - current_rate) * 100  # percentage points
            if drop_pct > threshold_pct:
                severity = "critical" if drop_pct > threshold_pct * 2 else "warning"
                anomalies.append(
                    {
                        "stage": stage,
                        "current_rate": round(float(current_rate), 4),
                        "historical_avg": round(float(avg_rate), 4),
                        "drop_pct": round(float(drop_pct), 2),
                        "severity": severity,
                    }
                )

    return anomalies


# ---------------------------------------------------------------------------
# Deal Cycle Time
# ---------------------------------------------------------------------------


def compute_deal_cycle_times(
    deals: pd.DataFrame,
    stage_order: list[str],
) -> pd.DataFrame:
    """Compute overall and per-stage cycle time statistics.

    For won deals, calculates total cycle time (created_date to close_date)
    and time-in-stage for each pipeline stage.

    Parameters
    ----------
    deals : pd.DataFrame
        CRM deals dataframe with ``deal_id``, ``created_date``,
        ``close_date``, ``outcome``, and stage history (entry/exit dates).
    stage_order : list[str]
        Ordered pipeline stage names.

    Returns
    -------
    pd.DataFrame
        Per-stage statistics: ``stage``, ``median_days``, ``p25_days``,
        ``p75_days``, ``p90_days``, ``mean_days``, ``deal_count``.
        Includes a row for ``"overall"`` total cycle time.
    """
    won = deals[deals["outcome"].str.lower().isin(["won", "closed won", "1", "true"])].copy()

    results = []

    # Overall cycle time
    if "created_date" in won.columns and "close_date" in won.columns:
        overall_days = (won["close_date"] - won["created_date"]).dt.days.dropna()
        if len(overall_days) > 0:
            results.append(
                {
                    "stage": "overall",
                    "median_days": float(overall_days.median()),
                    "p25_days": float(overall_days.quantile(0.25)),
                    "p75_days": float(overall_days.quantile(0.75)),
                    "p90_days": float(overall_days.quantile(0.90)),
                    "mean_days": float(overall_days.mean()),
                    "deal_count": int(len(overall_days)),
                }
            )

    # Per-stage cycle times using stage history columns
    for i, stage in enumerate(stage_order):
        entry_col = f"stage_{stage}_date"
        # Exit is the entry of the next stage
        if i + 1 < len(stage_order):
            exit_col = f"stage_{stage_order[i + 1]}_date"
        else:
            exit_col = "close_date"

        if entry_col in won.columns and exit_col in won.columns:
            entry = pd.to_datetime(won[entry_col], errors="coerce")
            exit_ = pd.to_datetime(won[exit_col], errors="coerce")
            stage_days = (exit_ - entry).dt.days.dropna()
            stage_days = stage_days[stage_days >= 0]

            if len(stage_days) > 0:
                results.append(
                    {
                        "stage": stage,
                        "median_days": float(stage_days.median()),
                        "p25_days": float(stage_days.quantile(0.25)),
                        "p75_days": float(stage_days.quantile(0.75)),
                        "p90_days": float(stage_days.quantile(0.90)),
                        "mean_days": float(stage_days.mean()),
                        "deal_count": int(len(stage_days)),
                    }
                )

    if not results:
        # Fallback: return overall based on available data
        return pd.DataFrame(
            columns=["stage", "median_days", "p25_days", "p75_days", "p90_days", "mean_days", "deal_count"]
        )

    return pd.DataFrame(results)


def identify_stalled_deals(
    deals: pd.DataFrame,
    stage_order: list[str],
    percentile_threshold: float = 90.0,
) -> pd.DataFrame:
    """Identify deals exceeding the time-in-stage threshold.

    Deals spending longer than the Nth percentile in their current stage
    are flagged as stalled.

    Parameters
    ----------
    deals : pd.DataFrame
        CRM deals dataframe with stage entry dates.
    stage_order : list[str]
        Ordered pipeline stage names.
    percentile_threshold : float
        Percentile above which deals are considered stalled (default: 90).

    Returns
    -------
    pd.DataFrame
        Stalled deals with columns: ``deal_id``, ``stage``,
        ``days_in_stage``, ``threshold_days``, ``amount``, ``owner``.
    """
    now = pd.Timestamp.now()

    # Only consider open/active deals (not won or lost)
    active = deals[
        ~deals["outcome"].str.lower().isin(["won", "closed won", "lost", "closed lost", "1", "0", "true", "false"])
    ].copy()

    if active.empty:
        # If no explicit open deals, consider all non-closed deals
        closed_outcomes = {"won", "closed won", "lost", "closed lost"}
        active = deals[~deals["outcome"].str.lower().isin(closed_outcomes)].copy()

    stalled_records = []

    for stage in stage_order:
        entry_col = f"stage_{stage}_date"
        stage_deals = active[active["stage"] == stage]

        if stage_deals.empty:
            continue

        if entry_col in deals.columns:
            entry_dates = pd.to_datetime(stage_deals[entry_col], errors="coerce")
            days_in = (now - entry_dates).dt.days
        else:
            # Fall back to created_date if no stage history
            days_in = (now - stage_deals["created_date"]).dt.days

        # Compute threshold from all historical deals at this stage
        all_at_stage = deals[deals["stage"] == stage]
        if entry_col in deals.columns:
            hist_entry = pd.to_datetime(all_at_stage[entry_col], errors="coerce")
            hist_days = (now - hist_entry).dt.days.dropna()
        else:
            hist_days = (now - all_at_stage["created_date"]).dt.days.dropna()

        if len(hist_days) < 3:
            continue

        threshold = float(np.percentile(hist_days, percentile_threshold))

        for idx, d in days_in.items():
            if pd.notna(d) and d > threshold:
                row = stage_deals.loc[idx]
                stalled_records.append(
                    {
                        "deal_id": row.get("deal_id", row.get("lead_id", idx)),
                        "stage": stage,
                        "days_in_stage": int(d),
                        "threshold_days": round(threshold, 1),
                        "amount": float(row.get("amount", 0)),
                        "owner": str(row.get("owner", "unknown")),
                    }
                )

    return (
        pd.DataFrame(stalled_records)
        if stalled_records
        else pd.DataFrame(columns=["deal_id", "stage", "days_in_stage", "threshold_days", "amount", "owner"])
    )


def compute_cycle_time_by_segment(
    deals: pd.DataFrame,
    segment_column: str,
) -> pd.DataFrame:
    """Compute cycle time statistics segmented by a grouping variable.

    Segments may include deal size tier, lead source, product line, or
    sales territory.

    Parameters
    ----------
    deals : pd.DataFrame
        CRM deals dataframe with ``created_date``, ``close_date``,
        ``outcome``, and the segment column.
    segment_column : str
        Column to segment by (e.g., ``"deal_size_tier"``,
        ``"lead_source"``).

    Returns
    -------
    pd.DataFrame
        Per-segment statistics: ``segment``, ``median_cycle_days``,
        ``mean_cycle_days``, ``deal_count``, ``win_rate``.
    """
    closed = deals[deals["outcome"].str.lower().isin(["won", "closed won", "lost", "closed lost", "1", "0"])].copy()
    closed["cycle_days"] = (closed["close_date"] - closed["created_date"]).dt.days
    closed["is_won"] = closed["outcome"].str.lower().isin(["won", "closed won", "1"])

    results = []
    for segment, group in closed.groupby(segment_column):
        won_group = group[group["is_won"]]
        cycle_days = won_group["cycle_days"].dropna()
        results.append(
            {
                "segment": segment,
                "median_cycle_days": float(cycle_days.median()) if len(cycle_days) > 0 else None,
                "mean_cycle_days": float(cycle_days.mean()) if len(cycle_days) > 0 else None,
                "deal_count": int(len(group)),
                "win_rate": round(float(group["is_won"].mean()), 4),
            }
        )

    return pd.DataFrame(results)


# ---------------------------------------------------------------------------
# Pipeline Coverage Ratio
# ---------------------------------------------------------------------------


def compute_stage_probabilities(
    deals: pd.DataFrame,
    stage_order: list[str],
) -> dict[str, float]:
    """Compute historical stage-to-close win probabilities.

    For each stage, calculates the fraction of deals entering that stage
    that ultimately close as won.

    Parameters
    ----------
    deals : pd.DataFrame
        Historical CRM deals with ``stage`` and ``outcome``.
    stage_order : list[str]
        Ordered pipeline stage names.

    Returns
    -------
    dict[str, float]
        Mapping of stage name to historical win probability from that stage.
    """
    # Determine the highest stage each deal reached
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

    probs: dict[str, float] = {}
    for i, stage in enumerate(stage_order):
        reached = deals[deals["_max_stage_idx"] >= i]
        if len(reached) == 0:
            probs[stage] = 0.0
        else:
            probs[stage] = round(float(reached["_is_won"].mean()), 4)

    return probs


def compute_weighted_pipeline(
    active_deals: pd.DataFrame,
    stage_probabilities: dict[str, float],
) -> dict[str, Any]:
    """Calculate weighted pipeline value using stage probabilities.

    Parameters
    ----------
    active_deals : pd.DataFrame
        Currently active/open deals with ``deal_id``, ``stage``, ``amount``.
    stage_probabilities : dict[str, float]
        Stage-to-close win probabilities.

    Returns
    -------
    dict[str, Any]
        Keys: ``total_unweighted`` (sum of all deal amounts),
        ``total_weighted`` (probability-adjusted sum),
        ``by_stage`` (dict of stage -> {count, unweighted, weighted}).
    """
    total_unweighted = float(active_deals["amount"].sum())

    by_stage: dict[str, dict[str, Any]] = {}
    total_weighted = 0.0

    for stage, group in active_deals.groupby("stage"):
        prob = stage_probabilities.get(stage, 0.0)
        unweighted = float(group["amount"].sum())
        weighted = unweighted * prob
        total_weighted += weighted
        by_stage[stage] = {
            "count": int(len(group)),
            "unweighted": round(unweighted, 2),
            "weighted": round(weighted, 2),
        }

    return {
        "total_unweighted": round(total_unweighted, 2),
        "total_weighted": round(total_weighted, 2),
        "by_stage": by_stage,
    }


def compute_coverage_ratio(
    weighted_pipeline: float,
    revenue_target: float,
) -> dict[str, Any]:
    """Calculate pipeline coverage ratio and interpret health.

    Parameters
    ----------
    weighted_pipeline : float
        Total weighted pipeline value.
    revenue_target : float
        Revenue quota/target for the period.

    Returns
    -------
    dict[str, Any]
        Keys: ``coverage_ratio`` (float), ``interpretation`` (str),
        ``action`` (str), ``gap`` (float, positive if under target).
    """
    if revenue_target <= 0:
        return {
            "coverage_ratio": float("inf"),
            "interpretation": "No revenue target set",
            "action": "Set a revenue target for meaningful coverage analysis",
            "gap": 0.0,
        }

    ratio = weighted_pipeline / revenue_target
    gap = max(revenue_target - weighted_pipeline, 0.0)

    if ratio < 2.0:
        interpretation = "Pipeline at risk; unlikely to meet target"
        action = "Urgent: increase lead generation, accelerate deals"
    elif ratio < 3.0:
        interpretation = "Healthy pipeline; standard buffer for expected losses"
        action = "Monitor: maintain current pipeline generation"
    elif ratio < 4.0:
        interpretation = "Strong pipeline; comfortable buffer"
        action = "Optimize: focus on deal quality and velocity"
    else:
        interpretation = "Overstuffed pipeline; may indicate stale deals"
        action = "Clean: audit pipeline for stalled or dead deals"

    return {
        "coverage_ratio": round(ratio, 2),
        "interpretation": interpretation,
        "action": action,
        "gap": round(gap, 2),
    }


def compute_pipeline_gap_analysis(
    revenue_target: float,
    weighted_pipeline: float,
    avg_deal_size: float,
    win_rate: float,
    lead_to_opp_rate: float,
) -> dict[str, Any]:
    """Estimate the leads and deals needed to close a pipeline gap.

    Parameters
    ----------
    revenue_target : float
        Revenue quota/target.
    weighted_pipeline : float
        Current weighted pipeline value.
    avg_deal_size : float
        Average deal size for won deals.
    win_rate : float
        Historical win rate.
    lead_to_opp_rate : float
        Historical lead-to-opportunity conversion rate.

    Returns
    -------
    dict[str, Any]
        Keys: ``revenue_gap``, ``deals_needed``, ``leads_needed``,
        ``achievable`` (bool based on current generation rates).
    """
    revenue_gap = max(revenue_target - weighted_pipeline, 0.0)

    if avg_deal_size <= 0 or win_rate <= 0:
        return {
            "revenue_gap": round(revenue_gap, 2),
            "deals_needed": float("inf"),
            "leads_needed": float("inf"),
            "achievable": False,
        }

    deals_needed = revenue_gap / (avg_deal_size * win_rate)

    if lead_to_opp_rate <= 0:
        leads_needed = float("inf")
        achievable = False
    else:
        leads_needed = deals_needed / lead_to_opp_rate
        # Consider achievable if leads needed is reasonable (< 10x current pipeline deals)
        achievable = revenue_gap == 0 or leads_needed < 10000

    return {
        "revenue_gap": round(revenue_gap, 2),
        "deals_needed": round(deals_needed, 1) if np.isfinite(deals_needed) else None,
        "leads_needed": round(leads_needed, 1) if np.isfinite(leads_needed) else None,
        "achievable": achievable,
    }


# ---------------------------------------------------------------------------
# Pipeline Velocity (Composite)
# ---------------------------------------------------------------------------


def compute_pipeline_velocity(
    n_opportunities: int,
    win_rate: float,
    avg_deal_size: float,
    avg_cycle_days: float,
) -> float:
    """Calculate the composite pipeline velocity metric.

    Formula: (Opportunities * Win Rate * Avg Deal Size) / Avg Cycle Days

    Parameters
    ----------
    n_opportunities : int
        Number of active opportunities.
    win_rate : float
        Historical win rate (0.0 to 1.0).
    avg_deal_size : float
        Average deal size in currency.
    avg_cycle_days : float
        Average sales cycle length in days.

    Returns
    -------
    float
        Pipeline velocity in revenue per day.
    """
    if avg_cycle_days <= 0:
        return 0.0
    return (n_opportunities * win_rate * avg_deal_size) / avg_cycle_days


def compute_velocity_trend(
    deals: pd.DataFrame,
    period: str = "month",
    n_periods: int = 6,
) -> pd.DataFrame:
    """Compute pipeline velocity over time for trend analysis.

    Parameters
    ----------
    deals : pd.DataFrame
        Historical CRM deals.
    period : str
        Aggregation period: ``"month"`` or ``"quarter"``.
    n_periods : int
        Number of historical periods to include.

    Returns
    -------
    pd.DataFrame
        Columns: ``period``, ``n_opportunities``, ``win_rate``,
        ``avg_deal_size``, ``avg_cycle_days``, ``velocity``,
        ``velocity_change_pct``.
    """
    deals = deals.copy()
    deals["created_date"] = pd.to_datetime(deals["created_date"])

    if period == "quarter":
        deals["_period"] = deals["created_date"].dt.to_period("Q").astype(str)
    else:
        deals["_period"] = deals["created_date"].dt.to_period("M").astype(str)

    # Keep only the most recent n_periods
    periods_sorted = sorted(deals["_period"].unique())
    if len(periods_sorted) > n_periods:
        periods_sorted = periods_sorted[-n_periods:]
    deals = deals[deals["_period"].isin(periods_sorted)]

    deals["_is_won"] = deals["outcome"].str.lower().isin(["won", "closed won", "1", "true"])
    deals["_is_closed"] = (
        deals["outcome"]
        .str.lower()
        .isin(
            [
                "won",
                "closed won",
                "lost",
                "closed lost",
                "1",
                "0",
                "true",
                "false",
            ]
        )
    )

    if "close_date" in deals.columns:
        deals["close_date"] = pd.to_datetime(deals["close_date"], errors="coerce")
        deals["_cycle_days"] = (deals["close_date"] - deals["created_date"]).dt.days

    results = []
    for p in periods_sorted:
        group = deals[deals["_period"] == p]
        n_opps = len(group)
        closed = group[group["_is_closed"]]
        won = group[group["_is_won"]]

        win_rate = float(won.shape[0] / closed.shape[0]) if closed.shape[0] > 0 else 0.0
        avg_deal_size = float(won["amount"].mean()) if len(won) > 0 else 0.0
        avg_cycle = float(won["_cycle_days"].mean()) if "_cycle_days" in won.columns and len(won) > 0 else 0.0

        velocity = compute_pipeline_velocity(n_opps, win_rate, avg_deal_size, avg_cycle)

        results.append(
            {
                "period": p,
                "n_opportunities": n_opps,
                "win_rate": round(win_rate, 4),
                "avg_deal_size": round(avg_deal_size, 2),
                "avg_cycle_days": round(avg_cycle, 1),
                "velocity": round(velocity, 2),
            }
        )

    df = pd.DataFrame(results)

    # Compute velocity change %
    if len(df) > 1:
        df["velocity_change_pct"] = df["velocity"].pct_change().fillna(0.0).round(4) * 100
    else:
        df["velocity_change_pct"] = 0.0

    return df


# ---------------------------------------------------------------------------
# Pipeline Forecasting
# ---------------------------------------------------------------------------


def forecast_weighted_revenue(
    active_deals: pd.DataFrame,
    stage_probabilities: dict[str, float],
    expected_close_window_days: int = 90,
) -> dict[str, Any]:
    """Produce probability-adjusted revenue forecast.

    Projects expected revenue from current pipeline within the specified
    window, weighted by stage-specific close probabilities.

    Parameters
    ----------
    active_deals : pd.DataFrame
        Open deals with ``deal_id``, ``stage``, ``amount``,
        ``expected_close_date``.
    stage_probabilities : dict[str, float]
        Stage-to-close probabilities.
    expected_close_window_days : int
        Forecast horizon in days.

    Returns
    -------
    dict[str, Any]
        Keys: ``forecast_window_days``, ``total_weighted_revenue``,
        ``deal_count``, ``by_stage`` (stage-level breakdown),
        ``by_month`` (monthly expected revenue).
    """
    now = pd.Timestamp.now()
    window_end = now + pd.Timedelta(days=expected_close_window_days)

    df = active_deals.copy()

    # Filter deals expected to close within the window
    if "expected_close_date" in df.columns:
        df["expected_close_date"] = pd.to_datetime(df["expected_close_date"], errors="coerce")
        in_window = df[(df["expected_close_date"] <= window_end) | df["expected_close_date"].isna()]
    else:
        in_window = df  # Include all if no expected_close_date

    # Weight by stage probability
    in_window = in_window.copy()
    in_window["_prob"] = in_window["stage"].map(stage_probabilities).fillna(0.0)
    in_window["_weighted_amount"] = in_window["amount"] * in_window["_prob"]

    total_weighted = float(in_window["_weighted_amount"].sum())

    # By stage
    by_stage = {}
    for stage, group in in_window.groupby("stage"):
        by_stage[stage] = {
            "count": int(len(group)),
            "unweighted": round(float(group["amount"].sum()), 2),
            "weighted": round(float(group["_weighted_amount"].sum()), 2),
        }

    # By month
    by_month: dict[str, float] = {}
    if "expected_close_date" in in_window.columns:
        valid_dates = in_window.dropna(subset=["expected_close_date"])
        if len(valid_dates) > 0:
            valid_dates = valid_dates.copy()
            valid_dates["_month"] = valid_dates["expected_close_date"].dt.to_period("M").astype(str)
            for month, group in valid_dates.groupby("_month"):
                by_month[month] = round(float(group["_weighted_amount"].sum()), 2)

    return {
        "forecast_window_days": expected_close_window_days,
        "total_weighted_revenue": round(total_weighted, 2),
        "deal_count": int(len(in_window)),
        "by_stage": by_stage,
        "by_month": by_month,
    }


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


def generate_pipeline_metrics_output(
    conversion_rates: pd.DataFrame,
    cycle_times: pd.DataFrame,
    coverage: dict[str, Any],
    velocity: float,
    velocity_trend: pd.DataFrame,
    forecast: dict[str, Any],
    anomalies: list[dict[str, Any]],
    stalled_deals: pd.DataFrame,
    output_path: str | Path,
) -> None:
    """Write pipeline_metrics.json with all computed metrics.

    Parameters
    ----------
    conversion_rates : pd.DataFrame
        Stage conversion rate data.
    cycle_times : pd.DataFrame
        Cycle time statistics.
    coverage : dict
        Coverage ratio and gap analysis.
    velocity : float
        Composite velocity metric.
    velocity_trend : pd.DataFrame
        Historical velocity trend.
    forecast : dict
        Weighted revenue forecast.
    anomalies : list
        Conversion rate anomalies.
    stalled_deals : pd.DataFrame
        Flagged stalled deals.
    output_path : str | Path
        Path to write output JSON.
    """
    output = {
        "stage_conversion_rates": conversion_rates.to_dict(orient="records"),
        "cycle_times": cycle_times.to_dict(orient="records"),
        "coverage": coverage,
        "pipeline_velocity": round(velocity, 2),
        "velocity_trend": velocity_trend.to_dict(orient="records"),
        "forecast": forecast,
        "anomalies": anomalies,
        "stalled_deals": stalled_deals.to_dict(orient="records"),
    }

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2, default=str)


# ---------------------------------------------------------------------------
# Main Orchestration
# ---------------------------------------------------------------------------


def run_pipeline_velocity_analysis(
    deals_path: str | Path,
    output_path: str | Path,
    stage_order: list[str] | None = None,
    revenue_target: Optional[float] = None,
    forecast_window_days: int = 90,
) -> dict[str, Any]:
    """Execute the full pipeline velocity analysis.

    Steps:
    1. Load and validate deal data
    2. Compute stage conversion rates and detect anomalies
    3. Compute deal cycle times and identify stalled deals
    4. Calculate stage probabilities and weighted pipeline
    5. Compute coverage ratio and gap analysis
    6. Calculate composite velocity and trend
    7. Produce weighted revenue forecast
    8. Generate output JSON

    Parameters
    ----------
    deals_path : str | Path
        Path to ``crm_leads.csv``.
    output_path : str | Path
        Path to write ``pipeline_metrics.json``.
    stage_order : list[str] or None
        Pipeline stage names in order. Defaults to standard stages:
        ``["MQL", "SQL", "Opportunity", "Proposal", "Negotiation",
        "Closed Won"]``.
    revenue_target : float or None
        Revenue quota/target for coverage ratio. If None, coverage
        analysis is skipped.
    forecast_window_days : int
        Forecast horizon in days.

    Returns
    -------
    dict[str, Any]
        Summary of pipeline health metrics.
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

    # 1. Load and validate
    deals = pd.read_csv(deals_path)
    deals["created_date"] = pd.to_datetime(deals["created_date"])
    if "close_date" in deals.columns:
        deals["close_date"] = pd.to_datetime(deals["close_date"], errors="coerce")
    deals["amount"] = pd.to_numeric(deals.get("amount", 0), errors="coerce").fillna(0.0)
    if "outcome" not in deals.columns:
        deals["outcome"] = ""

    # 2. Stage conversion rates
    conversion_rates = compute_stage_conversion_rates(deals, stage_order)

    # Detect anomalies: split by created_month if possible
    anomalies: list[dict[str, Any]] = []
    if "created_date" in deals.columns:
        deals["created_month"] = deals["created_date"].dt.to_period("M").astype(str)
        months = sorted(deals["created_month"].unique())
        if len(months) >= 4:
            current_month = months[-1]
            historical_months = months[-4:-1]
            current_deals = deals[deals["created_month"] == current_month]
            historical_deals = deals[deals["created_month"].isin(historical_months)]
            current_cr = compute_stage_conversion_rates(current_deals, stage_order)
            historical_cr = compute_stage_conversion_rates(historical_deals, stage_order)
            anomalies = detect_conversion_anomalies(current_cr, historical_cr)

    # 3. Cycle times and stalled deals
    cycle_times = compute_deal_cycle_times(deals, stage_order)
    stalled = identify_stalled_deals(deals, stage_order)

    # 4. Stage probabilities and weighted pipeline
    stage_probs = compute_stage_probabilities(deals, stage_order)

    closed_outcomes = ["won", "closed won", "lost", "closed lost", "1", "0", "true", "false"]
    active_deals = deals[~deals["outcome"].str.lower().isin(closed_outcomes)]
    weighted = compute_weighted_pipeline(active_deals, stage_probs)

    # 5. Coverage ratio
    coverage: dict[str, Any] = {}
    if revenue_target is not None:
        coverage = compute_coverage_ratio(weighted["total_weighted"], revenue_target)

        # Gap analysis
        won_deals = deals[deals["outcome"].str.lower().isin(["won", "closed won", "1", "true"])]
        avg_deal_size = float(won_deals["amount"].mean()) if len(won_deals) > 0 else 0.0

        closed = deals[deals["outcome"].str.lower().isin(closed_outcomes)]
        win_rate = float(len(won_deals) / len(closed)) if len(closed) > 0 else 0.0

        # Lead-to-opportunity rate approximation
        total_leads = len(deals)
        opps = deals[deals["stage"].isin(stage_order[2:])]  # Opportunity stage and beyond
        lead_to_opp = float(len(opps) / total_leads) if total_leads > 0 else 0.0

        gap = compute_pipeline_gap_analysis(
            revenue_target,
            weighted["total_weighted"],
            avg_deal_size,
            win_rate,
            lead_to_opp,
        )
        coverage["gap_analysis"] = gap

    # 6. Composite velocity
    won_deals = deals[deals["outcome"].str.lower().isin(["won", "closed won", "1", "true"])]
    closed = deals[deals["outcome"].str.lower().isin(closed_outcomes)]
    n_opps = len(active_deals)
    win_rate = float(len(won_deals) / len(closed)) if len(closed) > 0 else 0.0
    avg_deal_size = float(won_deals["amount"].mean()) if len(won_deals) > 0 else 0.0

    if "close_date" in won_deals.columns:
        cycle_days_series = (won_deals["close_date"] - won_deals["created_date"]).dt.days.dropna()
        avg_cycle = float(cycle_days_series.mean()) if len(cycle_days_series) > 0 else 0.0
    else:
        avg_cycle = 0.0

    velocity = compute_pipeline_velocity(n_opps, win_rate, avg_deal_size, avg_cycle)
    velocity_trend = compute_velocity_trend(deals)

    # 7. Forecast
    forecast = forecast_weighted_revenue(active_deals, stage_probs, forecast_window_days)

    # 8. Generate output
    generate_pipeline_metrics_output(
        conversion_rates,
        cycle_times,
        coverage,
        velocity,
        velocity_trend,
        forecast,
        anomalies,
        stalled,
        output_path,
    )

    return {
        "pipeline_velocity": round(velocity, 2),
        "coverage": coverage,
        "forecast_total_weighted": forecast["total_weighted_revenue"],
        "stalled_deal_count": len(stalled),
        "anomaly_count": len(anomalies),
        "output_path": str(output_path),
    }
