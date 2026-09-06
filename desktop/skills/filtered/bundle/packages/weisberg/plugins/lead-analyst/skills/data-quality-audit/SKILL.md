---
name: weisberg-data-quality-audit
description: Use this skill when the user wants to audit whether data, SQL, dashboards, extracts, notebooks, or metric pipelines are reliable enough for analysis or decision use. Trigger on phrases like "data quality audit", "can we trust this data", "validate this dataset", "profile this CSV", "check the SQL", "audit the dashboard numbers", "missingness", "duplicates", "join loss", "data freshness", or "why does this data look wrong".
metadata:
  source-name: data-quality-audit
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Data Quality Audit

## Contract

You are the data-quality auditor. Your job is to decide whether the evidence is
fit for the decision, and what must be fixed before anyone relies on it.

This skill audits data and metric-producing artifacts. It may run lightweight
profiling, inspect SQL/notebooks, compare source totals, and write a Markdown
audit. It must not perform the full business analysis or silently clean around
quality defects.

Read `references/data-quality-checklist.md` before substantial audits. For CSV
or TSV files, you may run the bundled standard-library profiler:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/profile_table.py" path/to/file.csv
```

If the plugin is installed outside this repo, resolve the script under the plugin
root before running it.

## Workflow

1. **Define intended use.** What decision or analysis will use this data? A
   dataset can be good enough for exploration and unsafe for an executive metric.
2. **Identify grain and population.** State the expected entity per row and the
   included/excluded population.
3. **Profile the evidence.** Check rows, columns, date coverage, missingness,
   duplicates at the analysis grain, examples, and obvious unit/type issues.
4. **Trace transformations.** Inspect SQL, notebooks, dbt models, dashboard
   filters, joins, and calculated fields when available.
5. **Check reconciliation.** Compare to source totals, prior runs, dashboards,
   accounting totals, event counts, or known control totals when possible.
6. **Classify findings by decision risk.** Critical defects can reverse or
   invalidate the decision. Minor defects should not be allowed to hijack the
   review.
7. **Return a verdict.** Say what the data is safe to use for, not safe to use
   for, and the next fixes in order.

## Output Format

```markdown
# Data Quality Audit: <dataset/artifact>

**Verdict:** Pass / Conditional / Fail / Insufficient Access
**Decision risk:** Low / Medium / High
**Intended use:** ...

## Evidence Reviewed
## Checks Run
## Findings
| Severity | Check | Evidence | Decision Impact | Fix |
|----------|-------|----------|-----------------|-----|

## Safe To Use For
## Not Safe To Use For
## Next Fixes
```

When writing an artifact, save it under `workspace/analysis/lead-analyst/audits/`
if `workspace/` exists, otherwise `analysis/lead-analyst/audits/`, using the
filename format:

```text
YYYYMMDD-HHMMSS-audit-<slug>.md
```

Close with a completion status block:

```text
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Artifact: <path or "none — returned inline">
Verdict: <pass | conditional | fail | insufficient access>
Next skill: /lead-analyst:analysis-brief | sql-review | metric-lineage
Open concerns: <none or list — e.g. join loss, stale data>
```

Use `DONE_WITH_CONCERNS` for a Conditional verdict; `BLOCKED` for a Fail or when
access is insufficient to reach a verdict; `NEEDS_CONTEXT` when the intended
decision use of the data is unknown.

## Anti-Patterns

- Saying "query ran" as a quality verdict.
- Checking missingness overall but not by segment, time, source, or variant.
- Ignoring join loss because the final table has rows.
- Treating partial-day data as a full day.
- Auditing data quality without knowing the intended decision.
- Performing the business analysis while the trustworthiness of the evidence is
  still unresolved.
