---
name: weisberg-email-analytics
description: 'Owns email performance, engagement, and deliverability analytics. Use when the user mentions email performance, open rate, click rate, click-to-delivered rate, deliverability, bounce rate, unsubscribe rate, email engagement, lifecycle email, drip campaign, email automation, send-time optimization, subject line performance, SPF, DKIM, DMARC, email blocklist, inbox placement, or list health. Also trigger on ''how are our emails performing'' or ''improve email engagement.'' When NOT to use: for measuring whether email CAUSED a purchase (holdout / incrementality / lift), defer to the experimentation plugin''s email-incrementality skill; for the statistics of any email A/B test, delegate to the experimentation skill. If send data is not yet in the workspace, run data-extraction first.'
metadata:
  source-name: email-analytics
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Email Analytics

Deliverability monitoring, click-based engagement analysis, lifecycle flow
optimization, send-time intelligence, and list health — with all experiment
statistics delegated out.

## Contract

**Role:** Advisory analyst. Reports on how email is performing and where
deliverability or engagement is at risk; does not send email or run experiments.
Metrics come from deterministic Python scripts.

**Mode:**
- `quick` — deliverability check + core engagement metrics.
- `standard` (default) — add send-time intelligence, lifecycle flow, list health.
- `deep` — add engagement-decay cohorts and subject-line pattern analysis.

**When to use:** email performance/engagement/deliverability reporting, lifecycle
flow efficiency, send-time recommendations, list hygiene.

**When NOT to use:** incrementality/holdout/lift ("did the email cause it") →
experimentation plugin's **email-incrementality**; A/B test statistics →
**experimentation** skill; audience definition → `audience-segmentation`. See
`../../references/skill-index.md`.

**Evidence required (inputs):**
- `workspace/raw/email_sends.csv` — `campaign_id`, `send_time`, `recipient`,
  `delivered`, `bounced`, `opened`, `clicked`, `converted`. Required. If absent,
  STOP and run **data-extraction** first.
- `workspace/raw/email_flows.csv` — `flow_id`, `step_number`, `trigger`, `delay`
  (optional; enables lifecycle flow analysis).
- `workspace/processed/segments.json` — from audience-segmentation (optional).

**Depends on:** data-extraction, audience-segmentation, experimentation.
**Feeds into:** reporting; compliance-review (FS mode). Builder detail in
`references/authoring-notes.md`.

**Hard STOP (deliverability integrity):** if hard bounce rate exceeds 2% or soft
bounce exceeds 5%, or SPF/DKIM/DMARC fails validation, STOP the performance
narrative and lead with the deliverability defect — engagement metrics computed on
undelivered mail are misleading. Flag blocklist status for sending domains.

Parse `$ARGUMENTS` for inline paths, attribution window, or inactivity threshold.

## Workflow

1. **Validate inputs.** Load `email_sends.csv`; verify required columns. Load
   `email_flows.csv` if flow analysis is requested.

2. **Deliverability check.** Run `scripts/deliverability_check.py`: bounce-rate
   trends and spike detection, SPF/DKIM/DMARC validation, blocklist status. Apply
   the Hard STOP gate on the results before continuing.

3. **Engagement metrics.** Run `scripts/engagement_analysis.py`: click-to-
   delivered rate (CTDR) as the primary metric (de-emphasize opens), revenue
   attribution over the standard window, and engagement-decay detection (declining
   click activity flagged before churn).

4. **Send-time intelligence.** Run `scripts/send_time_optimizer.py`: historical
   engagement heatmaps by day-of-week/hour, segmented by audience, timezone-aware.

5. **Lifecycle flows** (if `email_flows.csv` present). Per-flow conversion,
   time-between-sends, and sequence-length analysis against benchmarks in
   `references/lifecycle_patterns.md`.

6. **List health.** Run `scripts/list_health.py`: score inactive subscribers
   (default 90 days no click), identify re-engagement triggers, compute list
   hygiene score.

7. **Subject-line patterns** (deep mode). Correlate length, personalization,
   emoji, and urgency words with click rate as descriptive signal only.

8. **Delegation gate (AskUserQuestion).** When the user wants to compare variants
   or prove lift, ask before proceeding:
   - **Question:** "This needs an experiment, not descriptive analytics. How
     should I hand it off?"
   - **Options:** (a) *A/B statistics* — write `workspace/raw/experiment_data.csv`
     and invoke the **experimentation** skill; (b) *Incrementality / holdout* —
     defer to the experimentation plugin's **email-incrementality** skill;
     (c) *Descriptive only* — keep the observational read and label it non-causal.
   Never implement the significance test inline.

9. **Report.** Write outputs and the HTML dashboard.

## Output Format

Artifacts:

| File | Contents |
|------|----------|
| `workspace/analysis/email_deliverability.json` | Deliverability health scores and issue flags |
| `workspace/analysis/email_engagement.json` | Campaign and flow-level engagement metrics |
| `workspace/analysis/send_time_heatmap.json` | Optimal send-time recommendations by segment |
| `workspace/analysis/list_health.json` | Inactive subscribers and re-engagement targets |
| `workspace/reports/email_performance.html` | Deliverability, engagement, and flow dashboard |

**Financial services mode:** investment-product email needs required disclosures;
CAN-SPAM plus SEC archival apply to investor communications; experiment variants
must hold regulatory elements constant (never test the disclosure); track
transactional vs marketing email separately. All email content/variants route
through **compliance-review** before deployment.

**Completion status:**
- `DONE` — deliverability clean, engagement + list health written.
- `DONE_WITH_CONCERNS` — e.g., bounce/auth issue flagged, flow data absent, or
  experiment deferred.
- `BLOCKED` — Hard STOP tripped (deliverability failure or missing sends); state
  the fix.
- `NEEDS_CONTEXT` — delegation choice unresolved by the user.

## Anti-Patterns

- Reporting engagement on top of an unaddressed deliverability failure.
- Treating open rate as reliable engagement post-iOS-15 — lead with CTDR.
- Implementing A/B or incrementality statistics inside this skill instead of
  delegating.
- Claiming email "drove" revenue from observational data — that's an
  incrementality question for email-incrementality.
- Testing a regulatory disclosure as an A/B variable.
- Letting the model estimate CTDR or attribution instead of the scripts.
