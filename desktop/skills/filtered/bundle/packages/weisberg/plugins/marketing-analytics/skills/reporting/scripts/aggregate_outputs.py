"""Discover and merge workspace/analysis files into a unified dataset."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def _extract_records(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("data", "records", "rows", "results"):
            if isinstance(payload.get(key), list):
                return [item for item in payload[key] if isinstance(item, dict)]
        if any(isinstance(value, (int, float, str, bool)) for value in payload.values()):
            return [payload]
    return []


def discover_analysis_files(
    workspace_dir: str | Path,
    pattern: str = "*.json",
) -> list[Path]:
    workspace_dir = Path(workspace_dir)
    if not workspace_dir.exists():
        raise FileNotFoundError(workspace_dir)
    return sorted(workspace_dir.rglob(pattern), key=lambda path: path.stat().st_mtime, reverse=True)


def validate_and_load(
    file_paths: list[Path],
    schema_path: str | Path | None = None,
) -> list[dict[str, Any]]:
    del schema_path
    datasets: list[dict[str, Any]] = []
    for path in file_paths:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            logger.warning("Skipping invalid JSON file: %s", path)
            continue
        records = _extract_records(payload)
        if not records:
            logger.warning("Skipping %s because no records were found", path)
            continue
        skill_name = path.stem.replace(".json", "")
        metrics = sorted({key for record in records for key in record.keys() if key != "date"})
        datasets.append(
            {
                "source_file": str(path),
                "skill_id": skill_name,
                "records": records,
                "metrics": metrics,
                "warnings": []
                if any("date" in record for record in records)
                else ["No date field found; records will not align temporally."],
            }
        )
    return datasets


def align_date_dimensions(
    datasets: list[dict[str, Any]],
    target_granularity: str = "daily",
    fill_method: str = "forward_fill",
) -> list[dict[str, Any]]:
    if target_granularity not in {"daily", "weekly", "monthly"}:
        raise ValueError("Unsupported target_granularity")
    if fill_method not in {"forward_fill", "zero", "interpolate", "null"}:
        raise ValueError("Unsupported fill_method")

    all_dates = sorted(
        {str(record["date"])[:10] for dataset in datasets for record in dataset["records"] if "date" in record}
    )
    aligned: list[dict[str, Any]] = []
    for dataset in datasets:
        by_date = {str(record["date"])[:10]: dict(record) for record in dataset["records"] if "date" in record}
        aligned_records = []
        last_seen: dict[str, Any] = {}
        for date_value in all_dates:
            if date_value in by_date:
                row = dict(by_date[date_value])
                last_seen = dict(row)
            else:
                row = {"date": date_value}
                if fill_method == "forward_fill":
                    for metric in dataset["metrics"]:
                        row[metric] = last_seen.get(metric)
                elif fill_method == "zero":
                    for metric in dataset["metrics"]:
                        row[metric] = 0
                elif fill_method == "interpolate":
                    for metric in dataset["metrics"]:
                        row[metric] = last_seen.get(metric, 0)
                else:
                    for metric in dataset["metrics"]:
                        row[metric] = None
            aligned_records.append(row)
        aligned.append({**dataset, "records": aligned_records})
    return aligned


def merge_into_unified_dataset(
    aligned_datasets: list[dict[str, Any]],
    join_keys: list[str] | None = None,
) -> dict[str, Any]:
    join_keys = join_keys or ["date"]
    merged_rows: dict[tuple[Any, ...], dict[str, Any]] = {}
    metric_metadata: list[dict[str, Any]] = []
    skills_included = []
    sources = []
    for dataset in aligned_datasets:
        skills_included.append(dataset["skill_id"])
        sources.append(
            {
                "source_file": dataset["source_file"],
                "skill_id": dataset["skill_id"],
                "record_count": len(dataset["records"]),
                "warnings": dataset.get("warnings", []),
            }
        )
        for metric in dataset["metrics"]:
            metric_metadata.append(
                {
                    "name": metric,
                    "source_skill": dataset["skill_id"],
                    "data_type": "numeric",
                    "business_weight": 1.0,
                }
            )
        for record in dataset["records"]:
            key = tuple(record.get(column) for column in join_keys)
            merged_rows.setdefault(key, {column: record.get(column) for column in join_keys})
            for metric in dataset["metrics"]:
                merged_rows[key][metric] = record.get(metric)
    ordered_rows = sorted(merged_rows.values(), key=lambda row: tuple(row.get(column) or "" for column in join_keys))
    date_values = [row["date"] for row in ordered_rows if row.get("date")]
    return {
        "data": ordered_rows,
        "metrics": metric_metadata,
        "date_range": {
            "start": min(date_values) if date_values else None,
            "end": max(date_values) if date_values else None,
        },
        "skills_included": sorted(set(skills_included)),
        "skills_missing": [],
        "sources": sources,
    }


def compute_derived_metrics(
    unified_dataset: dict[str, Any],
    derived_definitions: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    del derived_definitions
    rows = unified_dataset["data"]
    for row in rows:
        spend = float(row.get("spend", row.get("total_spend", 0) or 0))
        revenue = float(row.get("revenue", row.get("pipeline_value", 0) or 0))
        conversions = float(row.get("conversions", row.get("total_conversions", 0) or 0))
        sessions = float(row.get("sessions", row.get("website_sessions", 0) or 0))
        clv = float(row.get("clv_estimate", row.get("customer_lifetime_value", 0) or 0))
        row["blended_roas"] = revenue / spend if spend else None
        row["portfolio_conversion_rate"] = conversions / sessions if sessions else None
        row["weighted_clv"] = clv
        row["marketing_efficiency_ratio"] = revenue / spend if spend else None
        row["cost_per_qualified_lead"] = spend / conversions if conversions else None
    existing = {metric["name"] for metric in unified_dataset["metrics"]}
    for name in (
        "blended_roas",
        "portfolio_conversion_rate",
        "weighted_clv",
        "marketing_efficiency_ratio",
        "cost_per_qualified_lead",
    ):
        if name not in existing:
            unified_dataset["metrics"].append(
                {"name": name, "source_skill": "derived", "data_type": "numeric", "business_weight": 1.2}
            )
    return unified_dataset


def generate_aggregation_manifest(
    unified_dataset: dict[str, Any],
    output_path: str | Path,
) -> Path:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    manifest = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "sources": unified_dataset.get("sources", []),
        "skills_included": unified_dataset.get("skills_included", []),
        "date_range": unified_dataset.get("date_range", {}),
    }
    output_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return output_path


def run_aggregation_pipeline(
    workspace_dir: str | Path,
    output_dir: str | Path,
    target_granularity: str = "daily",
    schema_path: str | Path | None = None,
) -> dict[str, Any]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    files = discover_analysis_files(workspace_dir)
    loaded = validate_and_load(files, schema_path=schema_path)
    aligned = align_date_dimensions(loaded, target_granularity=target_granularity)
    unified = merge_into_unified_dataset(aligned)
    enriched = compute_derived_metrics(unified)
    (output_dir / "unified_kpis.json").write_text(json.dumps(enriched, indent=2), encoding="utf-8")
    generate_aggregation_manifest(enriched, output_dir / "aggregation_manifest.json")
    return enriched
