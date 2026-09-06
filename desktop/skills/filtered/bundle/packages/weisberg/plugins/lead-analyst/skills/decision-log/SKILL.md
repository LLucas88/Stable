---
name: weisberg-decision-log
description: 'Use this skill to capture, update, or review analytical decisions and follow-through: recommendation, evidence, confidence, owner decision, action taken, follow-up date, and outcome. Trigger on phrases like decision log, record this decision, analytics decision record, what did we decide, follow up on this recommendation, track analysis outcome, or log the recommendation.'
metadata:
  source-name: decision-log
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Decision Log

## Contract

You are the analytics decision recorder. Your job is to make analytical
recommendations durable enough that the team can learn whether they were right.

This skill records decisions, not just findings. It can create a new log entry,
update an existing one with outcomes, or review whether prior recommendations were
followed. It writes to a single durable log file (see Output Format). It does not
re-run the analysis — if the recommendation itself needs revisiting, route back to
`analysis-brief` or `analysis-review`; if the recommendation is leadership-bound,
`executive-readout` produces the memo and this skill records the decision made
from it.

## Workflow

### Phase 1: Locate the Log and the Source (Evidence)

1. Find the existing log first so you append rather than fork it: check
   `workspace/analysis/lead-analyst/decision-log.md` then
   `analysis/lead-analyst/decision-log.md`. Read it before writing.
2. Identify and link the source analysis: the brief, dashboard, review, metric
   movement diagnostic, forecast, or stakeholder discussion that produced the
   recommendation. A decision log entry with no traceable source is a rumor.

### Phase 2: Classify the Operation

Decide which of three modes you are in — it changes what you write:

- **New entry** — a fresh recommendation/decision to record.
- **Outcome update** — a prior entry whose result is now known.
- **Follow-through review** — auditing whether past recommendations were acted on.

### Phase 3: Capture Recommendation, Decision, Follow-up

1. **Recommendation.** Recommended action, confidence *at the time*, evidence,
   caveats, and alternatives considered.
2. **Decision.** Owner, chosen action, date, rationale, and whether it followed
   the recommendation. Record deferrals and "no decision" — those are decisions too.
3. **Follow-up.** Owner, date, success metric, leading indicator, and what would
   count as a reversal or a learning.

### Phase 4: Decision Gate — Confidence Integrity on Outcome Updates

When updating an entry with an outcome, the point of the log is defeated if
confidence is silently rewritten with hindsight.

Hard STOP rule: **never edit the original recorded confidence or recommendation
when adding an outcome.** Append the outcome to a separate `## Outcome Update`
section, preserving what was believed at decision time. If the user asks you to
change the original assessment, STOP and confirm with `AskUserQuestion`:

- **Edit mode** — append an outcome update (preserves the record, recommended) vs
  correct a genuine factual transcription error in the original entry (allowed,
  but note the correction).

### Phase 5: Write / Update and Report

Append or update the entry in place. Keep entries scannable and dated so the team
can review the batch later.

## Output Format

```markdown
# Analytics Decision Log Entry

**Decision:** ...
**Date:** ...
**Owner:** ...
**Source analysis:** <link/path>
**Recommendation:** ...
**Decision taken:** <followed / partial / declined / deferred>
**Confidence at decision time:** High / Medium / Low

## Evidence
## Caveats
## Alternatives Considered
## Follow-Up Plan (owner, date, success metric, reversal trigger)
## Outcome Update (append-only; do not rewrite the above)
```

Write to `workspace/analysis/lead-analyst/decision-log.md` when `workspace/`
exists, otherwise `analysis/lead-analyst/decision-log.md`. This is an append-only
log, so new entries are added under a dated heading rather than in per-run files.

Close with a completion status block:

```text
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Artifact: <log path>
Operation: new entry | outcome update | follow-through review
Next follow-up date: <date or "none set">
Open concerns: <none or list — e.g. no owner assigned, no success metric>
```

Use `DONE_WITH_CONCERNS` when the entry is recorded but lacks an owner or success
metric; `BLOCKED` when the source analysis cannot be identified; `NEEDS_CONTEXT`
when the decision owner or follow-up metric must be supplied.

## Anti-Patterns

- Logging an analysis finding without the decision it informed.
- Rewriting recorded confidence or the recommendation after the outcome is known.
- Omitting the decision owner.
- Failing to define follow-up metrics and a reversal trigger.
- Treating "no decision" as no record; deferrals are decisions too.
- Starting a new log file instead of appending to the existing one.
