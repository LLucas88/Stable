---
name: weisberg-data-extraction
description: 'Use when the user wants to extract data, pull data from a source, load a CSV or JSON export into the workspace, connect a data source, refresh data, ingest raw platform exports, or normalize raw data for the marketing-analytics skills. Trigger on ''extract data'', ''pull data from <platform>'', ''load CSV/JSON into workspace'', ''connect a data source'', ''refresh data'', ''normalize raw data'', ''import my ad export'', ''get the campaign data in'', or ''set up the workspace''. This is the upstream skill every other marketing-analytics skill depends on: it lands source exports in workspace/raw/ and writes validated, normalized files to workspace/processed/. Run this first when a downstream skill reports a missing or malformed workspace input. When the user wants analysis, modeling, or reporting rather than getting data in, route to the matching analytics skill instead (see references/skill-index.md).'
metadata:
  source-name: data-extraction
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Data Extraction & Workspace Ingestion

**Skill ID:** data-extraction
**Priority:** P0 — Foundational (upstream of the entire portfolio)
**Role:** Data-preparation. This skill lands and normalizes source data. It does NOT
model, score, forecast, or interpret — that is the job of the downstream analytics
skills. It is fix-allowed only within `workspace/raw/` and `workspace/processed/`.

---

## Contract

**When to use**
- A downstream skill (attribution-analysis, paid-media, clv-modeling, experimentation,
  email-analytics, web-analytics, funnel-analysis, audience-segmentation, seo-content,
  crm-lead-scoring, social-analytics, voc-analytics) reports a missing workspace input.
- The user has a CSV/JSON export, a manual copy-paste of a report, or a described API
  pull and wants it landed and normalized for analysis.
- The workspace is empty or stale and needs a refresh.

**When NOT to use**
- The data is already in `workspace/processed/` and the user wants analysis → route to
  the matching analytics skill.
- The user wants a live platform connection this skill cannot make on its own. This skill
  does not hold credentials or call vendor APIs directly; it ingests exports and
  documents the pull. Describe the API pull generically and land the resulting file.
- The user wants reporting, dashboards, or interpretation → `reporting` and the
  domain skills own that.

**Inputs (any one of)**
| Source type | What you receive | How to handle |
|---|---|---|
| CSV/JSON export | A file path or uploaded file | Copy verbatim into `workspace/raw/`. |
| API pull (described) | Platform, date range, fields | Document the request; land the returned file in `workspace/raw/`. |
| Manual paste | Tabular text in the conversation | Write it to `workspace/raw/<slug>.csv` before validating. |

**Data contract references**
- `shared/schemas/data_contracts.md` — canonical data contract field/type/required definitions per dataset.
- `shared/utils/common_transforms.py` — `load_csv_with_validation`, `normalize_dates`,
  `detect_missing_windows`, `save_json_output`, `ensure_directory`.
- `references/skill-index.md` — the portfolio map naming which skill consumes which file.

**Outputs**
| File | Purpose |
|---|---|
| `workspace/raw/<name>.csv` or `.json` | Source export, landed verbatim (audit trail). |
| `workspace/processed/<name>.csv` | Type-coerced, date-normalized, deduplicated copy for analysis. |
| `workspace/raw/extraction_manifest.json` | Row counts, date ranges, null rates, duplicate keys, and the source note per file. |

**Canonical target filenames** (match these so downstream skills find their inputs)
| Downstream skill | Expected `workspace/raw/` file(s) |
|---|---|
| paid-media, attribution-analysis | `campaign_spend_{platform}.csv`; attribution also `conversions.csv`, `external_factors.csv` |
| paid-media | `search_terms_{platform}.csv`, `creative_performance_{platform}.csv` |
| clv-modeling, audience-segmentation | `transactions.csv`; also `subscriptions.csv`, `behavioral_events.csv` |
| experimentation | `experiment_data.csv`, `pre_experiment_covariates.csv` |
| email-analytics | `email_sends.csv`, `email_flows.csv` |
| crm-lead-scoring | `crm_leads.csv`, `lead_activities.csv` |
| web-analytics, funnel-analysis | `ga4_reports.csv`, `events.csv`; funnel also `revenue.csv` |
| seo-content | `search_console.csv`, `content_inventory.csv` |
| social-analytics | `social_performance_{platform}.csv`, `social_mentions.csv`, `competitor_social.csv` |
| voc-analytics | `survey_responses.csv` |
| competitive-intel | `competitor_data.csv` |

`paid-media` further normalizes its raw files into `workspace/processed/unified_media_performance.csv`;
this skill produces the per-file processed copies those steps read.

---

## Workflow

Complete each step before the next. If a gate fails, STOP and report — do not silently
proceed with partial or unvalidated data.

1. **Intake.** Confirm three things: (a) which dataset(s) the user is landing,
   (b) which downstream skill will consume them, and (c) the source type (CSV/JSON export,
   described API pull, or manual paste). If the target dataset is unclear, read
   `references/skill-index.md` and ask which analysis the user is heading toward, then map
   it to a canonical target filename above.

2. **Identify source type and land raw.** Write the source verbatim into
   `workspace/raw/<canonical-name>` (use `ensure_directory` from `common_transforms.py`
   first). Never edit the raw file after landing it — it is the audit trail. For a
   described API pull, record the platform, endpoint/report, date range, and field list in
   the manifest's `source_note`.

3. **Validate against the contract (HARD GATE).** Look up the matching schema in
   `shared/schemas/data_contracts.md` and run:
   `python3 scripts/validate_extract.py workspace/raw/<file> --contract <name>`
   (or `--required-cols col1,col2,...` when no named contract applies). If required columns
   are missing, **STOP**. Report exactly which contract fields are absent and the columns
   that were found. Do not normalize or hand a broken file to a downstream skill.

4. **Normalize.** Load with `load_csv_with_validation(path, required_columns, date_columns,
   numeric_columns)`, standardize date columns with `normalize_dates(df, date_col)`, coerce
   numeric/decimal fields, and drop exact duplicate rows. Keep the same base filename and
   write the cleaned frame to `workspace/processed/<canonical-name>`.

5. **Data-quality checks.** For every landed file, record: row count; min/max of each date
   column and any gaps via `detect_missing_windows`; per-column null rate; and duplicate
   count on the dataset's key columns. Flag (do not silently fix) any check that crosses a
   concern threshold — e.g. >5% nulls in a required column, zero rows, or duplicate keys.

6. **Write the manifest and set completion status.** Save
   `workspace/raw/extraction_manifest.json` via `save_json_output`. Emit one of:
   - `DONE` — all files landed, validated, normalized, and clean.
   - `DONE_WITH_CONCERNS` — landed and normalized, but quality flags remain (state them).
   - `BLOCKED` — a hard gate failed (missing required columns, empty file); name the file
     and the missing/failed contract fields.
   - `NEEDS_CONTEXT` — cannot proceed without the source file, the target dataset, or the
     downstream skill (state exactly what is missing).

---

## Output Format

Report to the user in this shape:

```
## Data Extraction — <dataset(s)>
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT

Landed:
- workspace/raw/<file>            (<rows> rows, <date_min>..<date_max>)
- workspace/processed/<file>      (normalized: <n> dupes dropped, <k> date rows repaired)

Quality:
- <file>: nulls <col>=<pct>; duplicate keys=<n>; gaps=<windows>

Manifest: workspace/raw/extraction_manifest.json
Next: run the <downstream-skill> skill (reads workspace/raw/<file>).
```

`extraction_manifest.json` per-file keys: `raw_path`, `processed_path`, `row_count`,
`date_range`, `null_rates`, `duplicate_keys`, `contract`, `source_note`, `status`.

---

## Anti-Patterns

- **Do not** normalize or forward a file that failed contract validation. A missing
  required column is a hard STOP, not a warning to paper over.
- **Do not** invent, impute, or backfill values to make a file "pass." Land what exists;
  flag gaps in the manifest.
- **Do not** edit `workspace/raw/` files after landing them. Corrections go to
  `workspace/processed/`; raw is the immutable audit trail.
- **Do not** rename fields off-contract. If a source column differs from the contract,
  map it explicitly during normalization and record the mapping in `source_note`.
- **Do not** model, score, or interpret here. Landing and normalizing is the whole job;
  hand analysis to the downstream skill.
- **Do not** claim a live API connection this skill cannot make. Describe the pull and
  land the resulting export.
- **Do not** skip the manifest. Downstream skills and reruns depend on the recorded row
  counts, date ranges, and quality flags.
