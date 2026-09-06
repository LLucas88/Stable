---
name: weisberg-funnel-analysis
description: Use when the user mentions funnel, conversion funnel, drop-off, drop off, conversion rate, conversion optimization, CRO, bottleneck, funnel analysis, checkout flow, signup flow, onboarding funnel, activation funnel, abandonment, cart abandonment, form abandonment, user flow, step completion, or funnel comparison. Also trigger on 'where are we losing people' or 'why is conversion low.' For site traffic sources and session behavior use web-analytics; for running the A/B test that validates a CRO fix use the experimentation skill; this skill measures step-by-step drop-off and prioritizes bottlenecks. If event data is not yet in the workspace, run data-extraction first.
metadata:
  source-name: funnel-analysis
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Funnel Analysis

Multi-step funnel construction, statistical drop-off analysis, bottleneck ranking,
revenue-impact estimation, and CRO hypothesis generation.

## Contract

**Role:** Advisory analyst. Measures conversion and proposes CRO hypotheses; does
not ship page changes or run the experiments. All statistics run in deterministic
Python scripts.

**Mode:**
- `quick` — construct funnel + stage conversion rates with CIs.
- `standard` (default) — add bottleneck ranking, revenue impact, CRO hypotheses.
- `deep` — add segment comparison and time-to-convert / survival analysis.

**When to use:** step-by-step drop-off, checkout/signup/onboarding funnels,
bottleneck prioritization, CRO backlog generation.

**When NOT to use:** for traffic sources and session flows use `web-analytics`;
for running the A/B test that validates a fix use the **experimentation** skill;
for email-sequence conversion use `email-analytics`. See
`../../references/skill-index.md` for the portfolio map.

**Evidence required (inputs):**
- `workspace/raw/events.csv` — `user_id`, `event_name`, `timestamp` (+ optional
  properties). Required. If absent, STOP and run **data-extraction** first.
- `workspace/config/funnel_definition.json` — step sequence, time windows,
  matching mode (optional; auto-inferred if absent).
- `workspace/processed/segments.json` — from audience-segmentation (optional;
  enables cohort comparison).
- `workspace/raw/revenue.csv` — revenue per converter (recommended; enables impact
  estimation).

**Depends on:** data-extraction, web-analytics (event stream). **Feeds into:**
experimentation, reporting, paid-media. Builder detail in
`references/authoring-notes.md`.

**Hard STOP (data integrity):** if `events.csv` is missing required columns, or
the inferred/declared funnel has a step with zero entering users, stop and report
— a funnel that can't be constructed yields meaningless conversion rates.

Parse `$ARGUMENTS` for inline paths, funnel definition, or window overrides.

## Workflow

1. **Validate inputs.** Load `events.csv`; verify `user_id`, `event_name`,
   `timestamp`. Apply the Hard STOP gate.

2. **Funnel-definition gate (AskUserQuestion).** When no
   `funnel_definition.json` is supplied and multiple plausible step sequences
   exist, ask before constructing:
   - **Question:** "Which funnel should I measure?"
   - **Options:** (a) *Provide the step sequence* — user names ordered steps and
     time window; (b) *Infer from top event sequences* — I derive the dominant
     path and show it for confirmation; (c) *A named standard funnel* (checkout /
     signup / onboarding). Skip when a definition file is present.

3. **Construct.** Run `scripts/build_funnel.py`: assign users to stages, apply
   the time-window filter (users who don't reach the next step within the window
   count as dropped), support strict (ordered) and relaxed (any-order) matching.

4. **Stage metrics.** Run `scripts/funnel_stats.py`: stage conversion rates with
   Wilson score CIs, absolute and relative drop-off, overall funnel conversion.

5. **Segment comparison** (deep mode, if `segments.json` present). Compute per-
   segment funnel metrics; chi-squared tests at each stage with Bonferroni
   correction across >2 segments.

6. **Rank bottlenecks.** Composite score
   `drop_off_rate * sqrt(volume) * revenue_proximity`. Write
   `workspace/analysis/bottleneck_ranking.json`.

7. **Estimate revenue impact.** Run `scripts/revenue_impact.py` with historical
   revenue-per-converter; project the gain from 1/5/10 pp conversion improvements
   at the 50th-percentile (conservative) estimate.

8. **Time-to-convert** (deep mode). Median/percentile time between stages;
   right-censor users still in funnel; flag stages where dwell correlates with
   abandonment and bimodal distributions.

9. **CRO hypotheses.** For each bottleneck emit {observation, hypothesis, test
   type, expected impact, priority} to `workspace/analysis/cro_hypotheses.json`.

10. **Report.** Write outputs and the interactive HTML funnel report.

## Output Format

Artifacts:

| File | Contents |
|------|----------|
| `workspace/analysis/funnel_results.json` | Stage conversion rates, drop-offs, CIs |
| `workspace/analysis/bottleneck_ranking.json` | Priority-ranked bottlenecks with impact |
| `workspace/analysis/cro_hypotheses.json` | Test ideas linked to findings |
| `workspace/analysis/time_to_convert.json` | Per-stage time distributions and censoring |
| `workspace/reports/funnel_report.html` | Interactive funnel with drill-down |

**Financial services mode:** account-opening funnels see 50–70% abandonment;
KYC/AML and suitability steps are mandatory. Never recommend removing or shortening
a compliance/disclosure/consent step. Regulated-step CRO must target UX clarity,
progress indicators, and save-and-resume, not step elimination. CRO copy that will
be published routes through **compliance-review**.

**Completion status:**
- `DONE` — funnel constructed, metrics + bottlenecks + hypotheses written.
- `DONE_WITH_CONCERNS` — e.g., no revenue data (impact omitted), thin volume at a
  stage, inferred funnel unconfirmed.
- `BLOCKED` — Hard STOP tripped (bad/missing events); state the fix.
- `NEEDS_CONTEXT` — funnel definition unresolved by the user.

## Anti-Patterns

- Quoting conversion rates from a funnel that couldn't be validly constructed.
- Normal-approximation CIs at low conversion rates instead of Wilson score.
- Optimistic revenue projections — always use the conservative 50th-percentile
  estimate.
- Ranking bottlenecks by raw drop-off alone, ignoring volume and revenue
  proximity.
- Recommending removal of a regulated step to lift conversion.
- Segment chi-squared tests across many segments without Bonferroni correction.
- Letting the model estimate conversion rates or p-values instead of the scripts.
