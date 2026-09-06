"""Revenue impact projection per funnel stage improvement.

This module estimates the revenue gain from improving conversion rates at each
funnel stage. It uses historical revenue-per-converter data and conservative
projection methodology (50th percentile of improvement range).

Typical usage:
    from funnel_stats import FunnelStats, BottleneckScore
    impacts = estimate_revenue_impact(funnel_stats, bottlenecks, revenue_data)
    save_revenue_impact(impacts, "workspace/analysis/revenue_impact.json")
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import pandas as pd


@dataclass
class ImprovementScenario:
    """Projected revenue impact for a specific improvement at one stage.

    Attributes:
        improvement_ppts: The assumed conversion rate improvement in percentage
            points (e.g., 1.0 means +1pp).
        additional_converters: Estimated additional users who would convert.
        additional_revenue: Estimated additional revenue in currency units.
        additional_revenue_pct: Additional revenue as a percentage of current
            total funnel revenue.
    """

    improvement_ppts: float
    additional_converters: int
    additional_revenue: float
    additional_revenue_pct: float


@dataclass
class StageRevenueImpact:
    """Revenue impact analysis for a single funnel stage.

    Attributes:
        stage_index: Zero-based index of this stage.
        stage_name: Human-readable stage name.
        current_conversion_rate: Current conversion rate at this stage.
        current_volume: Number of users entering this stage.
        revenue_per_converter: Historical average (or median) revenue per user
            who completes the entire funnel from this stage onward.
        scenarios: List of improvement scenarios (e.g., +1pp, +5pp, +10pp).
        bottleneck_rank: Rank from bottleneck scoring (None if not ranked).
    """

    stage_index: int
    stage_name: str
    current_conversion_rate: float
    current_volume: int
    revenue_per_converter: float
    scenarios: list[ImprovementScenario]
    bottleneck_rank: Optional[int] = None


@dataclass
class RevenueImpactReport:
    """Complete revenue impact analysis across all funnel stages.

    Attributes:
        funnel_name: Name of the analyzed funnel.
        total_current_revenue: Total revenue from current funnel converters.
        currency: Currency code (e.g., "USD").
        stages: Per-stage revenue impact analyses.
        analysis_period: Description of the time period analyzed.
        methodology_note: Explanation of the estimation approach.
    """

    funnel_name: str
    total_current_revenue: float
    currency: str
    stages: list[StageRevenueImpact]
    analysis_period: str
    methodology_note: str = (
        "Revenue projections use the 50th percentile (median) of historical "
        "revenue-per-converter and assume linear impact of conversion rate "
        "improvement. Actual results may vary based on user mix and "
        "seasonality. These are conservative estimates."
    )


def load_revenue_data(
    filepath: str | Path,
    user_id_column: str = "user_id",
    revenue_column: str = "revenue",
    timestamp_column: str = "timestamp",
) -> pd.DataFrame:
    """Load revenue-per-converter data from CSV.

    Reads the revenue data file and validates required columns. Each row
    represents a revenue event (e.g., purchase) tied to a user.

    Args:
        filepath: Path to the revenue CSV file.
        user_id_column: Name of the user identifier column.
        revenue_column: Name of the revenue amount column.
        timestamp_column: Name of the timestamp column.

    Returns:
        A DataFrame with validated revenue data.

    Raises:
        FileNotFoundError: If the revenue file does not exist.
        ValueError: If required columns are missing or revenue contains
            non-numeric values.
    """
    filepath = Path(filepath)
    if not filepath.exists():
        raise FileNotFoundError(f"Revenue file not found: {filepath}")

    df = pd.read_csv(filepath)

    required_columns = [user_id_column, revenue_column, timestamp_column]
    missing = [c for c in required_columns if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    # Validate revenue is numeric
    if not pd.api.types.is_numeric_dtype(df[revenue_column]):
        try:
            df[revenue_column] = pd.to_numeric(df[revenue_column])
        except (ValueError, TypeError):
            raise ValueError(f"Revenue column '{revenue_column}' contains non-numeric values")

    df[timestamp_column] = pd.to_datetime(df[timestamp_column])

    return df


def compute_revenue_per_converter(
    revenue_data: pd.DataFrame,
    funnel_result: "FunnelResult",
    user_id_column: str = "user_id",
    revenue_column: str = "revenue",
    use_median: bool = True,
) -> float:
    """Compute revenue per user who completed the funnel.

    Matches revenue data to funnel completers and calculates the central
    tendency of revenue per converter. Uses median by default for robustness
    to outliers.

    Args:
        revenue_data: DataFrame with user-level revenue data.
        funnel_result: The FunnelResult identifying which users completed.
        user_id_column: Name of the user identifier column.
        revenue_column: Name of the revenue amount column.
        use_median: If True, use median (50th percentile). If False, use mean.
            Default True for conservative estimation.

    Returns:
        Revenue per converter (median or mean).

    Raises:
        ValueError: If no funnel completers have matching revenue data.
    """
    # Get user IDs of funnel completers
    completer_ids = {ur.entity_id for ur in funnel_result.user_results if ur.completed}

    if not completer_ids:
        raise ValueError("No funnel completers found")

    # Filter revenue data to completers
    completer_revenue = revenue_data[revenue_data[user_id_column].astype(str).isin(completer_ids)]

    if completer_revenue.empty:
        raise ValueError("No matching revenue data for funnel completers")

    # Aggregate revenue per user
    user_revenue = completer_revenue.groupby(user_id_column)[revenue_column].sum()

    if use_median:
        return float(user_revenue.median())
    else:
        return float(user_revenue.mean())


def compute_stage_revenue_per_converter(
    revenue_data: pd.DataFrame,
    funnel_result: "FunnelResult",
    stage_index: int,
    user_id_column: str = "user_id",
    revenue_column: str = "revenue",
    use_median: bool = True,
) -> float:
    """Compute revenue per user who converted at a specific stage and beyond.

    For stages closer to the end of the funnel, the revenue per additional
    converter may differ from the overall funnel average. This function
    computes stage-specific revenue estimates.

    Args:
        revenue_data: DataFrame with user-level revenue data.
        funnel_result: The FunnelResult with per-user stage assignments.
        stage_index: The stage to compute revenue for.
        user_id_column: Name of the user identifier column.
        revenue_column: Name of the revenue amount column.
        use_median: If True, use median. If False, use mean.

    Returns:
        Revenue per converter from this stage onward.
    """
    # Get users who reached at least the given stage AND completed the funnel
    qualified_ids = {
        ur.entity_id for ur in funnel_result.user_results if ur.furthest_stage >= stage_index and ur.completed
    }

    if not qualified_ids:
        # Fall back to overall completer revenue if no stage-specific data
        try:
            return compute_revenue_per_converter(
                revenue_data,
                funnel_result,
                user_id_column=user_id_column,
                revenue_column=revenue_column,
                use_median=use_median,
            )
        except ValueError:
            return 0.0

    qualified_revenue = revenue_data[revenue_data[user_id_column].astype(str).isin(qualified_ids)]

    if qualified_revenue.empty:
        return 0.0

    user_revenue = qualified_revenue.groupby(user_id_column)[revenue_column].sum()

    if use_median:
        return float(user_revenue.median())
    else:
        return float(user_revenue.mean())


def project_improvement_scenario(
    current_volume: int,
    current_conversion_rate: float,
    improvement_ppts: float,
    revenue_per_converter: float,
    total_current_revenue: float,
    downstream_conversion_rate: float = 1.0,
) -> ImprovementScenario:
    """Project revenue impact for a given conversion rate improvement.

    Calculates the additional converters and revenue from improving the
    conversion rate at a specific stage by a given number of percentage points.

    The downstream_conversion_rate accounts for the fact that not all users
    who pass this stage will ultimately convert (purchase). It represents the
    probability of reaching final conversion from this stage onward.

    Args:
        current_volume: Number of users entering the stage.
        current_conversion_rate: Current conversion rate at this stage (0 to 1).
        improvement_ppts: Percentage point improvement (e.g., 5.0 for +5pp).
        revenue_per_converter: Revenue per final converter.
        total_current_revenue: Total current funnel revenue for percentage calc.
        downstream_conversion_rate: Probability of reaching final conversion
            from the improved stage onward (default 1.0, i.e., assume all
            additional passers convert).

    Returns:
        An ImprovementScenario with projected additional converters and revenue.
    """
    new_rate = min(1.0, current_conversion_rate + improvement_ppts / 100.0)
    additional_passers = current_volume * (new_rate - current_conversion_rate)
    additional_converters = additional_passers * downstream_conversion_rate
    additional_revenue = additional_converters * revenue_per_converter

    if total_current_revenue > 0:
        additional_revenue_pct = (additional_revenue / total_current_revenue) * 100.0
    else:
        additional_revenue_pct = 0.0

    return ImprovementScenario(
        improvement_ppts=improvement_ppts,
        additional_converters=int(round(additional_converters)),
        additional_revenue=round(additional_revenue, 2),
        additional_revenue_pct=round(additional_revenue_pct, 2),
    )


def estimate_revenue_impact(
    funnel_stats: "FunnelStats",
    bottlenecks: list["BottleneckScore"],
    revenue_data: pd.DataFrame,
    funnel_result: "FunnelResult",
    improvement_scenarios_ppts: list[float] | None = None,
    currency: str = "USD",
    analysis_period: str = "Last 30 days",
    user_id_column: str = "user_id",
    revenue_column: str = "revenue",
) -> RevenueImpactReport:
    """Estimate revenue impact of improving conversion at each funnel stage.

    For each stage, projects the revenue gain from 1, 5, and 10 percentage-
    point improvements (or custom scenarios). Uses conservative (median)
    revenue-per-converter estimates.

    Args:
        funnel_stats: Statistical summary of the funnel from funnel_stats.py.
        bottlenecks: Ranked bottleneck list from funnel_stats.py.
        revenue_data: DataFrame with user-level revenue data.
        funnel_result: The FunnelResult with per-user funnel assignments.
        improvement_scenarios_ppts: List of improvement scenarios in percentage
            points. Default [1.0, 5.0, 10.0].
        currency: Currency code for revenue figures (default "USD").
        analysis_period: Human-readable description of the analysis period.
        user_id_column: Name of the user identifier column.
        revenue_column: Name of the revenue amount column.

    Returns:
        A RevenueImpactReport with per-stage impact projections.
    """
    if improvement_scenarios_ppts is None:
        improvement_scenarios_ppts = [1.0, 5.0, 10.0]

    # Build bottleneck rank lookup
    bottleneck_rank_map: dict[int, int] = {b.stage_index: b.rank for b in bottlenecks}

    # Compute total current revenue from funnel completers
    completer_ids = {ur.entity_id for ur in funnel_result.user_results if ur.completed}
    completer_revenue_df = revenue_data[revenue_data[user_id_column].astype(str).isin(completer_ids)]
    total_current_revenue = float(completer_revenue_df[revenue_column].sum())

    # Compute downstream conversion rates for each stage
    # downstream_conversion_rate[i] = P(complete funnel | reached stage i+1)
    num_stages = len(funnel_stats.stages)
    stage_impacts: list[StageRevenueImpact] = []

    for stage in funnel_stats.stages:
        i = stage.stage_index

        # Skip last stage (no drop-off to improve)
        if i >= num_stages - 1:
            continue

        current_rate = stage.conversion_rate.point_estimate
        current_volume = stage.entered

        # Compute downstream conversion rate: from stage i+1 to end
        if i + 1 < num_stages and funnel_stats.stages[i + 1].entered > 0:
            downstream_rate = (
                funnel_stats.total_completed / funnel_stats.stages[i + 1].entered
                if funnel_stats.stages[i + 1].entered > 0
                else 0.0
            )
        else:
            downstream_rate = 1.0

        # Revenue per converter for this stage (median, conservative)
        rev_per_converter = compute_stage_revenue_per_converter(
            revenue_data,
            funnel_result,
            i,
            user_id_column=user_id_column,
            revenue_column=revenue_column,
            use_median=True,
        )

        scenarios: list[ImprovementScenario] = []
        for ppts in improvement_scenarios_ppts:
            scenario = project_improvement_scenario(
                current_volume=current_volume,
                current_conversion_rate=current_rate,
                improvement_ppts=ppts,
                revenue_per_converter=rev_per_converter,
                total_current_revenue=total_current_revenue,
                downstream_conversion_rate=downstream_rate,
            )
            scenarios.append(scenario)

        stage_impacts.append(
            StageRevenueImpact(
                stage_index=i,
                stage_name=stage.stage_name,
                current_conversion_rate=current_rate,
                current_volume=current_volume,
                revenue_per_converter=rev_per_converter,
                scenarios=scenarios,
                bottleneck_rank=bottleneck_rank_map.get(i),
            )
        )

    return RevenueImpactReport(
        funnel_name=funnel_stats.funnel_name,
        total_current_revenue=round(total_current_revenue, 2),
        currency=currency,
        stages=stage_impacts,
        analysis_period=analysis_period,
    )


def save_revenue_impact(
    report: RevenueImpactReport,
    filepath: str | Path,
) -> None:
    """Save revenue impact report to a JSON file.

    Serializes the RevenueImpactReport into the output contract format.

    Args:
        report: The revenue impact report to save.
        filepath: Output path for the JSON file.
    """
    filepath = Path(filepath)
    filepath.parent.mkdir(parents=True, exist_ok=True)

    output = {
        "funnel_name": report.funnel_name,
        "total_current_revenue": report.total_current_revenue,
        "currency": report.currency,
        "analysis_period": report.analysis_period,
        "methodology_note": report.methodology_note,
        "stages": [
            {
                "stage_index": s.stage_index,
                "stage_name": s.stage_name,
                "current_conversion_rate": s.current_conversion_rate,
                "current_volume": s.current_volume,
                "revenue_per_converter": s.revenue_per_converter,
                "bottleneck_rank": s.bottleneck_rank,
                "scenarios": [
                    {
                        "improvement_ppts": sc.improvement_ppts,
                        "additional_converters": sc.additional_converters,
                        "additional_revenue": sc.additional_revenue,
                        "additional_revenue_pct": sc.additional_revenue_pct,
                    }
                    for sc in s.scenarios
                ],
            }
            for s in report.stages
        ],
    }

    with open(filepath, "w") as f:
        json.dump(output, f, indent=2)


if __name__ == "__main__":
    import argparse
    from build_funnel import FunnelResult, UserFunnelResult
    from funnel_stats import (
        BottleneckScore,
        FunnelStats,
        compute_funnel_stats,
    )

    parser = argparse.ArgumentParser(
        description="Estimate revenue impact scenarios for funnel bottleneck improvements."
    )
    parser.add_argument(
        "funnel_results_path",
        nargs="?",
        default="workspace/analysis/funnel_results.json",
        help="Path to funnel_results.json from build_funnel.py.",
    )
    parser.add_argument(
        "bottleneck_path",
        nargs="?",
        default="workspace/analysis/bottleneck_ranking.json",
        help="Path to bottleneck_ranking.json from funnel_stats.py.",
    )
    parser.add_argument(
        "revenue_data_path",
        nargs="?",
        default="workspace/raw/revenue.csv",
        help="Path to revenue CSV data.",
    )
    parser.add_argument(
        "output_path",
        nargs="?",
        default="workspace/analysis/revenue_impact.json",
        help="Path for the generated revenue impact JSON.",
    )
    args = parser.parse_args()

    # Load funnel results
    with open(args.funnel_results_path, "r") as f:
        raw = json.load(f)

    user_results = [
        UserFunnelResult(
            entity_id=ur["entity_id"],
            furthest_stage=ur["furthest_stage"],
            stage_timestamps={int(k): v for k, v in ur["stage_timestamps"].items()},
            completed=ur["completed"],
        )
        for ur in raw["user_results"]
    ]

    funnel_result = FunnelResult(
        funnel_name=raw["funnel_name"],
        steps=raw["steps"],
        stage_counts=raw["stage_counts"],
        stage_conversion_rates=raw["stage_conversion_rates"],
        stage_drop_off_rates=raw["stage_drop_off_rates"],
        total_entered=raw["total_entered"],
        total_completed=raw["total_completed"],
        overall_conversion_rate=raw["overall_conversion_rate"],
        user_results=user_results,
    )

    # Load bottleneck ranking
    with open(args.bottleneck_path, "r") as f:
        bottleneck_raw = json.load(f)

    bottlenecks = [
        BottleneckScore(
            stage_index=b["stage_index"],
            stage_name=b["stage_name"],
            drop_off_rate=b["drop_off_rate"],
            volume=b["volume"],
            revenue_proximity=b["revenue_proximity"],
            composite_score=b["composite_score"],
            rank=b["rank"],
        )
        for b in bottleneck_raw
    ]

    # Load revenue data
    revenue_data = load_revenue_data(args.revenue_data_path)

    # Compute funnel stats (needed for estimate_revenue_impact)
    funnel_stats = compute_funnel_stats(funnel_result)

    # Estimate revenue impact
    report = estimate_revenue_impact(
        funnel_stats=funnel_stats,
        bottlenecks=bottlenecks,
        revenue_data=revenue_data,
        funnel_result=funnel_result,
    )

    save_revenue_impact(report, args.output_path)

    print(f"Revenue impact report for '{report.funnel_name}'")
    print(f"Total current revenue: {report.currency} {report.total_current_revenue:,.2f}")
    for stage in report.stages:
        if stage.scenarios:
            best = stage.scenarios[-1]  # largest improvement scenario
            print(
                f"  Stage {stage.stage_index} ({stage.stage_name}): "
                f"+{best.improvement_ppts}pp -> "
                f"+{report.currency} {best.additional_revenue:,.2f} "
                f"({best.additional_revenue_pct:+.1f}%)"
            )
