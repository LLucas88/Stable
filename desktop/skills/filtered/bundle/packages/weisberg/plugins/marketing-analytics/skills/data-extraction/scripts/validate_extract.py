"""Validate a landed extract against a marketing-analytics data contract.

Deterministic pre-normalization gate for the data-extraction skill. Given a CSV or
JSON file, this checks it against a named contract from
``shared/schemas/data_contracts.md`` (or an explicit ``--required-cols`` list) and
reports row count, date range, per-column null rates, and duplicate-key counts.

Exit codes:
    0  contract satisfied (quality flags may still be reported)
    1  contract violation: required columns missing, empty file, or duplicate keys

Examples:
    python3 validate_extract.py workspace/raw/transactions.csv --contract clv
    python3 validate_extract.py workspace/raw/spend.csv --required-cols date,spend \\
        --date-col date --key-cols campaign_id,date
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

try:  # pandas is preferred (consistent with sibling scripts) but not required
    import pandas as pd
except ImportError:  # pragma: no cover - stdlib fallback path
    pd = None

import csv as _csv

# Map friendly contract names to their section headers in data_contracts.md.
CONTRACT_SECTIONS: dict[str, str] = {
    "campaign": "Campaign Data Schema",
    "segment": "Segment Definition Schema",
    "experiment": "Experiment Result Schema",
    "clv": "CLV Prediction Schema",
    "media": "Unified Media Performance Schema",
    "compliance": "Compliance Review Schema",
}

# data_contracts.md lives at <plugin>/shared/schemas/ relative to this script.
DEFAULT_CONTRACTS = Path(__file__).resolve().parents[3] / "shared" / "schemas" / "data_contracts.md"


# ---------------------------------------------------------------------------
# Contract parsing
# ---------------------------------------------------------------------------


def required_columns_for_contract(contracts_file: Path, contract: str) -> list[str]:
    """Parse ``data_contracts.md`` and return the required fields for a contract.

    Reads the markdown table under the contract's section header and collects every
    row whose ``Required`` cell is ``Yes``.
    """
    section = CONTRACT_SECTIONS.get(contract)
    if section is None:
        raise SystemExit(f"Unknown contract '{contract}'. Choose from: {sorted(CONTRACT_SECTIONS)}")
    if not contracts_file.exists():
        raise SystemExit(f"Contracts file not found: {contracts_file}")

    text = contracts_file.read_text(encoding="utf-8")
    required: list[str] = []
    in_section = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("## "):
            in_section = stripped[3:].strip() == section
            continue
        if not in_section or not stripped.startswith("|"):
            continue
        cells = [c.strip() for c in stripped.strip("|").split("|")]
        if len(cells) < 3:
            continue
        field, _type, req = cells[0], cells[1], cells[2]
        if field.lower() in {"field", ""} or set(field) <= {"-"}:
            continue  # header or divider row
        if req.lower() == "yes":
            required.append(field)
    if not required:
        raise SystemExit(f"No required columns parsed for contract '{contract}'.")
    return required


# ---------------------------------------------------------------------------
# File loading (pandas when available, csv fallback otherwise)
# ---------------------------------------------------------------------------


def load_rows(path: Path) -> tuple[list[str], list[dict[str, Any]]]:
    """Return ``(columns, rows)`` for a CSV or JSON file without pandas."""
    if path.suffix.lower() == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data = data.get("data", data.get("records", [data]))
        rows = [dict(r) for r in data]
        cols: list[str] = []
        for r in rows:
            for k in r:
                if k not in cols:
                    cols.append(k)
        return cols, rows
    with path.open(newline="", encoding="utf-8") as fh:
        reader = _csv.DictReader(fh)
        cols = list(reader.fieldnames or [])
        rows = [dict(r) for r in reader]
    return cols, rows


def _is_null(value: Any) -> bool:
    return value is None or (isinstance(value, str) and value.strip() == "")


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------


def profile(
    path: Path,
    required: list[str],
    date_col: str | None,
    key_cols: list[str],
) -> dict[str, Any]:
    """Load the file and compute the extraction quality profile."""
    columns, rows = load_rows(path)
    row_count = len(rows)

    missing = [c for c in required if c not in columns]

    null_rates: dict[str, float] = {}
    for col in columns:
        if row_count == 0:
            null_rates[col] = 0.0
            continue
        nulls = sum(1 for r in rows if _is_null(r.get(col)))
        null_rates[col] = round(nulls / row_count, 4)

    date_range: dict[str, str] | None = None
    if date_col and date_col in columns and row_count:
        values = sorted(str(r[date_col]) for r in rows if not _is_null(r.get(date_col)))
        if values:
            date_range = {"min": values[0], "max": values[-1]}

    duplicate_keys = 0
    dup_examples: list[str] = []
    if key_cols and all(c in columns for c in key_cols) and row_count:
        seen: dict[tuple, int] = {}
        for r in rows:
            key = tuple(str(r.get(c)) for c in key_cols)
            seen[key] = seen.get(key, 0) + 1
        for key, count in seen.items():
            if count > 1:
                duplicate_keys += count - 1
                if len(dup_examples) < 5:
                    dup_examples.append("|".join(key))

    return {
        "path": str(path),
        "row_count": row_count,
        "columns": columns,
        "required": required,
        "missing_required": missing,
        "null_rates": null_rates,
        "date_range": date_range,
        "duplicate_keys": duplicate_keys,
        "duplicate_examples": dup_examples,
    }


def evaluate(report: dict[str, Any]) -> list[str]:
    """Return the list of hard contract violations (empty means pass)."""
    violations: list[str] = []
    if report["missing_required"]:
        violations.append(f"missing required columns: {report['missing_required']} (found: {report['columns']})")
    if report["row_count"] == 0:
        violations.append("file has zero data rows")
    if report["duplicate_keys"] > 0:
        violations.append(f"{report['duplicate_keys']} duplicate key rows (examples: {report['duplicate_examples']})")
    return violations


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate a landed extract against a data contract.")
    parser.add_argument("file", type=Path, help="Path to the CSV or JSON extract.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--contract",
        choices=sorted(CONTRACT_SECTIONS),
        help="Named contract from data_contracts.md.",
    )
    group.add_argument(
        "--required-cols",
        help="Comma-separated required columns (when no named contract applies).",
    )
    parser.add_argument(
        "--contracts-file",
        type=Path,
        default=DEFAULT_CONTRACTS,
        help="Path to data_contracts.md (default: plugin shared/schemas).",
    )
    parser.add_argument("--date-col", help="Column to report min/max date range for.")
    parser.add_argument(
        "--key-cols",
        help="Comma-separated key columns to check for duplicate rows.",
    )
    parser.add_argument("--json", action="store_true", help="Emit the report as JSON only.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.file.exists():
        print(f"ERROR: file not found: {args.file}", file=sys.stderr)
        return 1

    if args.contract:
        required = required_columns_for_contract(args.contracts_file, args.contract)
        contract_label = args.contract
    else:
        required = [c.strip() for c in args.required_cols.split(",") if c.strip()]
        contract_label = "custom"

    key_cols = [c.strip() for c in (args.key_cols or "").split(",") if c.strip()]

    report = profile(args.file, required, args.date_col, key_cols)
    report["contract"] = contract_label
    violations = evaluate(report)
    report["violations"] = violations
    report["status"] = "BLOCKED" if violations else "OK"

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"File:        {report['path']}")
        print(f"Contract:    {contract_label}")
        print(f"Rows:        {report['row_count']}")
        if report["date_range"]:
            print(f"Date range:  {report['date_range']['min']} .. {report['date_range']['max']}")
        print(f"Duplicate keys: {report['duplicate_keys']}")
        flagged = {c: r for c, r in report["null_rates"].items() if r > 0.05}
        if flagged:
            print(f"Null rate >5%: {flagged}")
        if violations:
            print("VIOLATIONS:")
            for v in violations:
                print(f"  - {v}")
        print(f"Status:      {report['status']}")

    return 1 if violations else 0


if __name__ == "__main__":
    raise SystemExit(main())
