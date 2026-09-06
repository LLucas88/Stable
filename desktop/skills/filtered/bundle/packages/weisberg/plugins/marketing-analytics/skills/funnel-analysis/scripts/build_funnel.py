"""Funnel construction from event sequences with time-window filtering.

This module builds multi-step conversion funnels from raw event-level data.
It supports strict (ordered) and relaxed (any-order) step matching, configurable
time windows between stages, and both user-based and session-based aggregation.

Typical usage:
    events = load_events("workspace/raw/events.csv")
    definition = load_funnel_definition("workspace/config/funnel_definition.json")
    funnel = build_funnel(events, definition)
    save_funnel(funnel, "workspace/analysis/funnel_results.json")
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional

import pandas as pd


class MatchingMode(Enum):
    """How funnel steps are matched against event sequences."""

    STRICT = "strict"  # Events must occur in defined order
    RELAXED = "relaxed"  # All events must occur, order does not matter


class AggregationMode(Enum):
    """How users/sessions are aggregated into funnel counts."""

    USER = "user"  # Each user counted once, furthest stage reached
    SESSION = "session"  # Each session is an independent funnel attempt


@dataclass
class FunnelStep:
    """A single step in a funnel definition.

    Attributes:
        name: Human-readable step name (e.g., "Add to Cart").
        event_name: The event identifier to match in event data.
        max_time_window_seconds: Maximum seconds allowed between the previous
            step and this step. None means no time constraint.
    """

    name: str
    event_name: str
    max_time_window_seconds: Optional[int] = None


@dataclass
class FunnelDefinition:
    """Complete funnel definition with steps, matching mode, and aggregation.

    Attributes:
        funnel_name: Descriptive name for this funnel.
        steps: Ordered list of funnel steps.
        matching_mode: STRICT (ordered) or RELAXED (any order).
        aggregation_mode: USER-based or SESSION-based.
        global_time_window_seconds: Optional maximum time from first to last
            step. None means no global constraint.
    """

    funnel_name: str
    steps: list[FunnelStep]
    matching_mode: MatchingMode = MatchingMode.STRICT
    aggregation_mode: AggregationMode = AggregationMode.USER
    global_time_window_seconds: Optional[int] = None


@dataclass
class UserFunnelResult:
    """Result of funnel assignment for a single user or session.

    Attributes:
        entity_id: The user_id or session_id.
        furthest_stage: Index of the furthest stage reached (0-based).
        stage_timestamps: Timestamp at which each completed stage was reached.
        completed: Whether the user completed the entire funnel.
    """

    entity_id: str
    furthest_stage: int
    stage_timestamps: dict[int, str] = field(default_factory=dict)
    completed: bool = False


@dataclass
class FunnelResult:
    """Aggregated funnel results across all users/sessions.

    Attributes:
        funnel_name: Name of the funnel analyzed.
        steps: List of step names in order.
        stage_counts: Number of users/sessions reaching each stage.
        stage_conversion_rates: Conversion rate from previous stage to current.
        stage_drop_off_rates: Drop-off rate at each stage.
        total_entered: Total users/sessions entering the funnel.
        total_completed: Total users/sessions completing all stages.
        overall_conversion_rate: End-to-end conversion rate.
        user_results: Per-user/session breakdown.
    """

    funnel_name: str
    steps: list[str]
    stage_counts: list[int]
    stage_conversion_rates: list[float]
    stage_drop_off_rates: list[float]
    total_entered: int
    total_completed: int
    overall_conversion_rate: float
    user_results: list[UserFunnelResult]


def load_events(
    filepath: str | Path,
    timestamp_column: str = "timestamp",
    user_id_column: str = "user_id",
    event_name_column: str = "event_name",
    session_id_column: Optional[str] = None,
) -> pd.DataFrame:
    """Load and validate event-level data from CSV.

    Reads the event data file, validates that required columns are present,
    parses timestamps, and sorts by user and timestamp for sequential
    processing.

    Args:
        filepath: Path to the events CSV file.
        timestamp_column: Name of the timestamp column.
        user_id_column: Name of the user identifier column.
        event_name_column: Name of the event name column.
        session_id_column: Optional name of the session identifier column.
            Required if using SESSION aggregation mode.

    Returns:
        A DataFrame with validated and sorted event data.

    Raises:
        FileNotFoundError: If the events file does not exist.
        ValueError: If required columns are missing.
    """
    filepath = Path(filepath)
    if not filepath.exists():
        raise FileNotFoundError(f"Events file not found: {filepath}")

    df = pd.read_csv(filepath)

    required_columns = [timestamp_column, user_id_column, event_name_column]
    if session_id_column is not None:
        required_columns.append(session_id_column)

    missing = [c for c in required_columns if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df[timestamp_column] = pd.to_datetime(df[timestamp_column])
    df = df.sort_values([user_id_column, timestamp_column]).reset_index(drop=True)

    return df


def load_funnel_definition(filepath: str | Path) -> FunnelDefinition:
    """Load a funnel definition from a JSON or YAML configuration file.

    Parses the funnel step sequence, matching mode, aggregation mode, and
    time-window constraints from a configuration file.

    Args:
        filepath: Path to the funnel definition JSON or YAML file.

    Returns:
        A FunnelDefinition with all steps and configuration.

    Raises:
        FileNotFoundError: If the definition file does not exist.
        ValueError: If the definition is malformed or missing required fields.
    """
    filepath = Path(filepath)
    if not filepath.exists():
        raise FileNotFoundError(f"Definition file not found: {filepath}")

    suffix = filepath.suffix.lower()
    if suffix in (".yaml", ".yml"):
        try:
            import yaml
        except ImportError:
            raise ImportError("PyYAML is required to load YAML funnel definitions")
        with open(filepath, "r") as f:
            raw = yaml.safe_load(f)
    elif suffix == ".json":
        with open(filepath, "r") as f:
            raw = json.load(f)
    else:
        raise ValueError(f"Unsupported definition file format: {suffix}")

    if not isinstance(raw, dict):
        raise ValueError("Funnel definition must be a JSON/YAML object")
    if "funnel_name" not in raw:
        raise ValueError("Funnel definition must include 'funnel_name'")
    if "steps" not in raw or not raw["steps"]:
        raise ValueError("Funnel definition must include a non-empty 'steps' list")

    steps = []
    for step_raw in raw["steps"]:
        if "event_name" not in step_raw:
            raise ValueError(f"Each step must have an 'event_name': {step_raw}")
        steps.append(
            FunnelStep(
                name=step_raw.get("name", step_raw["event_name"]),
                event_name=step_raw["event_name"],
                max_time_window_seconds=step_raw.get("max_time_window_seconds"),
            )
        )

    matching_mode = MatchingMode(raw.get("matching_mode", "strict"))
    aggregation_mode = AggregationMode(raw.get("aggregation_mode", "user"))

    return FunnelDefinition(
        funnel_name=raw["funnel_name"],
        steps=steps,
        matching_mode=matching_mode,
        aggregation_mode=aggregation_mode,
        global_time_window_seconds=raw.get("global_time_window_seconds"),
    )


def infer_funnel_definition(
    events: pd.DataFrame,
    min_frequency: float = 0.01,
    max_steps: int = 10,
    event_name_column: str = "event_name",
    user_id_column: str = "user_id",
) -> FunnelDefinition:
    """Infer a funnel definition from the most common event sequences.

    When no explicit funnel definition is provided, analyze the event data to
    identify the most common event sequences and construct a funnel definition
    automatically.

    Args:
        events: DataFrame of event-level data.
        min_frequency: Minimum fraction of users who must trigger an event for
            it to be included as a funnel step.
        max_steps: Maximum number of steps in the inferred funnel.
        event_name_column: Name of the event name column.
        user_id_column: Name of the user identifier column.

    Returns:
        An inferred FunnelDefinition based on common event patterns.
    """
    total_users = events[user_id_column].nunique()

    # Count event frequency across users (unique users per event)
    event_user_counts = events.groupby(event_name_column)[user_id_column].nunique().sort_values(ascending=False)

    # Filter events that meet the minimum frequency threshold
    qualifying_events = event_user_counts[event_user_counts / total_users >= min_frequency]

    # For each user, get the ordered sequence of first occurrence of each event
    def first_occurrence_order(group: pd.DataFrame) -> list[str]:
        seen: set[str] = set()
        order: list[str] = []
        for event in group[event_name_column]:
            if event not in seen and event in qualifying_events.index:
                seen.add(event)
                order.append(event)
        return order

    user_sequences = events.groupby(user_id_column).apply(first_occurrence_order, include_groups=False)

    # Build a positional ranking: for each event, compute its median position
    # across all user sequences
    event_positions: dict[str, list[int]] = {}
    for seq in user_sequences:
        for pos, event in enumerate(seq):
            event_positions.setdefault(event, []).append(pos)

    # Compute median position for ordering
    event_median_pos = {event: pd.Series(positions).median() for event, positions in event_positions.items()}

    # Sort events by median position and take up to max_steps
    ordered_events = sorted(event_median_pos.keys(), key=lambda e: event_median_pos[e])
    ordered_events = ordered_events[:max_steps]

    steps = [FunnelStep(name=event, event_name=event) for event in ordered_events]

    return FunnelDefinition(
        funnel_name="inferred_funnel",
        steps=steps,
        matching_mode=MatchingMode.STRICT,
        aggregation_mode=AggregationMode.USER,
    )


def assign_user_to_funnel(
    user_events: pd.DataFrame,
    definition: FunnelDefinition,
    timestamp_column: str = "timestamp",
    event_name_column: str = "event_name",
) -> UserFunnelResult:
    """Assign a single user's events to funnel stages.

    Processes a user's event sequence chronologically and determines the
    furthest funnel stage reached, respecting time-window constraints and
    matching mode.

    Args:
        user_events: DataFrame of events for a single user, sorted by
            timestamp.
        definition: The funnel definition to match against.
        timestamp_column: Name of the timestamp column.
        event_name_column: Name of the event name column.

    Returns:
        A UserFunnelResult indicating how far the user progressed.
    """
    entity_id = str(user_events.iloc[0].get("user_id", user_events.index[0]))
    # Try to get entity_id from the dataframe columns
    for col in ["user_id", "session_id"]:
        if col in user_events.columns:
            entity_id = str(user_events.iloc[0][col])
            break

    stage_timestamps: dict[int, str] = {}
    steps = definition.steps

    if definition.matching_mode == MatchingMode.STRICT:
        # Strict mode: events must occur in order
        current_step_idx = 0
        first_step_ts = None

        for _, row in user_events.iterrows():
            if current_step_idx >= len(steps):
                break

            event = row[event_name_column]
            ts = row[timestamp_column]

            if event == steps[current_step_idx].event_name:
                # Check per-step time window constraint
                if current_step_idx > 0 and steps[current_step_idx].max_time_window_seconds is not None:
                    prev_ts = pd.Timestamp(stage_timestamps[current_step_idx - 1])
                    elapsed = (ts - prev_ts).total_seconds()
                    if elapsed > steps[current_step_idx].max_time_window_seconds:
                        # Exceeded time window, stop here
                        break

                # Check global time window
                if current_step_idx == 0:
                    first_step_ts = ts
                elif definition.global_time_window_seconds is not None:
                    elapsed = (ts - first_step_ts).total_seconds()
                    if elapsed > definition.global_time_window_seconds:
                        break

                stage_timestamps[current_step_idx] = str(ts)
                current_step_idx += 1

        furthest_stage = current_step_idx - 1 if current_step_idx > 0 else -1

    else:
        # Relaxed mode: all events must occur, order does not matter
        # Find the earliest occurrence of each required event
        required_events = {step.event_name: i for i, step in enumerate(steps)}
        event_occurrences: dict[int, pd.Timestamp] = {}

        for _, row in user_events.iterrows():
            event = row[event_name_column]
            ts = row[timestamp_column]
            if event in required_events:
                step_idx = required_events[event]
                if step_idx not in event_occurrences:
                    event_occurrences[step_idx] = ts

        # Check time windows for relaxed mode
        # Sort found events by their step index
        found_indices = sorted(event_occurrences.keys())
        valid_indices: list[int] = []

        first_ts = None
        for step_idx in found_indices:
            ts = event_occurrences[step_idx]

            # Check per-step time window (relative to the previously found step)
            if valid_indices and steps[step_idx].max_time_window_seconds is not None:
                prev_ts = event_occurrences[valid_indices[-1]]
                elapsed = (ts - prev_ts).total_seconds()
                if elapsed > steps[step_idx].max_time_window_seconds:
                    continue

            if first_ts is None:
                first_ts = ts
            elif definition.global_time_window_seconds is not None:
                elapsed = (ts - first_ts).total_seconds()
                if elapsed > definition.global_time_window_seconds:
                    continue

            valid_indices.append(step_idx)
            stage_timestamps[step_idx] = str(ts)

        # In relaxed mode, furthest stage is the count of contiguous stages
        # starting from 0, since all must be present
        furthest_stage = -1
        for i in range(len(steps)):
            if i in stage_timestamps:
                furthest_stage = i
            else:
                break

    completed = furthest_stage == len(steps) - 1

    return UserFunnelResult(
        entity_id=entity_id,
        furthest_stage=max(furthest_stage, -1),
        stage_timestamps=stage_timestamps,
        completed=completed,
    )


def build_funnel(
    events: pd.DataFrame,
    definition: FunnelDefinition,
    user_id_column: str = "user_id",
    session_id_column: Optional[str] = None,
    timestamp_column: str = "timestamp",
    event_name_column: str = "event_name",
) -> FunnelResult:
    """Build a complete funnel from event data and a funnel definition.

    Iterates over all users (or sessions), assigns each to funnel stages, and
    aggregates the results into stage-level counts and conversion rates.

    Args:
        events: DataFrame of event-level data.
        definition: The funnel definition specifying steps and constraints.
        user_id_column: Name of the user identifier column.
        session_id_column: Name of the session identifier column (required for
            SESSION aggregation mode).
        timestamp_column: Name of the timestamp column.
        event_name_column: Name of the event name column.

    Returns:
        A FunnelResult with stage-level counts, conversion rates, and
        per-user breakdowns.

    Raises:
        ValueError: If SESSION mode is requested but session_id_column is not
            provided or not present in the data.
    """
    if definition.aggregation_mode == AggregationMode.SESSION:
        if session_id_column is None:
            raise ValueError("session_id_column must be provided for SESSION aggregation mode")
        if session_id_column not in events.columns:
            raise ValueError(f"Session column '{session_id_column}' not found in event data")
        group_column = session_id_column
    else:
        group_column = user_id_column

    num_steps = len(definition.steps)
    user_results: list[UserFunnelResult] = []

    for entity_id, group_df in events.groupby(group_column):
        group_df = group_df.sort_values(timestamp_column)
        result = assign_user_to_funnel(
            group_df,
            definition,
            timestamp_column=timestamp_column,
            event_name_column=event_name_column,
        )
        result.entity_id = str(entity_id)
        user_results.append(result)

    # Aggregate stage counts: count users who reached at least stage i
    stage_counts = []
    for i in range(num_steps):
        count = sum(1 for ur in user_results if ur.furthest_stage >= i)
        stage_counts.append(count)

    # Conversion rates: stage 0 rate is stage_counts[0] / total_entered
    # For stage i > 0: stage_counts[i] / stage_counts[i-1]
    total_entered = len(user_results)
    stage_conversion_rates = []
    stage_drop_off_rates = []

    for i in range(num_steps):
        if i == 0:
            rate = stage_counts[0] / total_entered if total_entered > 0 else 0.0
        else:
            rate = stage_counts[i] / stage_counts[i - 1] if stage_counts[i - 1] > 0 else 0.0
        stage_conversion_rates.append(rate)
        stage_drop_off_rates.append(1.0 - rate)

    total_completed = stage_counts[-1] if stage_counts else 0
    overall_conversion_rate = total_completed / total_entered if total_entered > 0 else 0.0

    return FunnelResult(
        funnel_name=definition.funnel_name,
        steps=[step.name for step in definition.steps],
        stage_counts=stage_counts,
        stage_conversion_rates=stage_conversion_rates,
        stage_drop_off_rates=stage_drop_off_rates,
        total_entered=total_entered,
        total_completed=total_completed,
        overall_conversion_rate=overall_conversion_rate,
        user_results=user_results,
    )


def build_funnel_by_cohort(
    events: pd.DataFrame,
    definition: FunnelDefinition,
    segments: dict[str, list[str]],
    user_id_column: str = "user_id",
    timestamp_column: str = "timestamp",
    event_name_column: str = "event_name",
) -> dict[str, FunnelResult]:
    """Build separate funnels for each user segment/cohort.

    Splits users into cohorts based on segment membership and builds
    independent funnels for comparison.

    Args:
        events: DataFrame of event-level data.
        definition: The funnel definition specifying steps and constraints.
        segments: Mapping of segment name to list of user IDs in that segment.
        user_id_column: Name of the user identifier column.
        timestamp_column: Name of the timestamp column.
        event_name_column: Name of the event name column.

    Returns:
        A dictionary mapping segment name to its FunnelResult.
    """
    results: dict[str, FunnelResult] = {}

    for segment_name, user_ids in segments.items():
        segment_events = events[events[user_id_column].isin(user_ids)]
        if segment_events.empty:
            # Build an empty funnel result for this segment
            num_steps = len(definition.steps)
            results[segment_name] = FunnelResult(
                funnel_name=f"{definition.funnel_name} - {segment_name}",
                steps=[step.name for step in definition.steps],
                stage_counts=[0] * num_steps,
                stage_conversion_rates=[0.0] * num_steps,
                stage_drop_off_rates=[1.0] * num_steps,
                total_entered=0,
                total_completed=0,
                overall_conversion_rate=0.0,
                user_results=[],
            )
        else:
            funnel = build_funnel(
                segment_events,
                definition,
                user_id_column=user_id_column,
                timestamp_column=timestamp_column,
                event_name_column=event_name_column,
            )
            funnel.funnel_name = f"{definition.funnel_name} - {segment_name}"
            results[segment_name] = funnel

    return results


def save_funnel(funnel: FunnelResult, filepath: str | Path) -> None:
    """Save funnel results to a JSON file.

    Serializes the FunnelResult into the output contract format expected by
    downstream skills and the reporting pipeline.

    Args:
        funnel: The funnel result to save.
        filepath: Output path for the JSON file.
    """
    filepath = Path(filepath)
    filepath.parent.mkdir(parents=True, exist_ok=True)

    output = {
        "funnel_name": funnel.funnel_name,
        "steps": funnel.steps,
        "stage_counts": funnel.stage_counts,
        "stage_conversion_rates": funnel.stage_conversion_rates,
        "stage_drop_off_rates": funnel.stage_drop_off_rates,
        "total_entered": funnel.total_entered,
        "total_completed": funnel.total_completed,
        "overall_conversion_rate": funnel.overall_conversion_rate,
        "user_results": [
            {
                "entity_id": ur.entity_id,
                "furthest_stage": ur.furthest_stage,
                "stage_timestamps": {str(k): v for k, v in ur.stage_timestamps.items()},
                "completed": ur.completed,
            }
            for ur in funnel.user_results
        ],
    }

    with open(filepath, "w") as f:
        json.dump(output, f, indent=2, default=str)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Build a configured or inferred conversion funnel from event-level data."
    )
    parser.add_argument(
        "events_path",
        nargs="?",
        default="workspace/raw/events.csv",
        help="Path to the event-level CSV file.",
    )
    parser.add_argument(
        "definition_path",
        nargs="?",
        default="workspace/config/funnel_definition.json",
        help="Optional funnel definition JSON/YAML path; inferred when missing.",
    )
    parser.add_argument(
        "output_path",
        nargs="?",
        default="workspace/analysis/funnel_results.json",
        help="Path for the generated funnel results JSON.",
    )
    args = parser.parse_args()

    events_df = load_events(args.events_path)

    definition_file = Path(args.definition_path)
    if definition_file.exists():
        funnel_def = load_funnel_definition(definition_file)
    else:
        funnel_def = infer_funnel_definition(events_df)

    result = build_funnel(events_df, funnel_def)
    save_funnel(result, args.output_path)

    print(
        f"Funnel '{result.funnel_name}' built: {result.total_entered} entered, "
        f"{result.total_completed} completed ({result.overall_conversion_rate:.2%})"
    )
