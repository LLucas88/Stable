---
name: weisberg-experiment-report
description: Use when the user wants a stakeholder-ready experiment readout, report, or summary written from analyzed results. Triggers on phrases like "write the readout", "generate the experiment report", "summarize this test for leadership", "draft the post-test writeup", "exec summary of the test", "share this with the team". Produces a structured Markdown report tuned to a named audience (executive / technical / mixed / regulatory), grounded in the pre-registered design and the analysis artifact, with a single explicit recommendation. Does not invent numbers — it composes from the design document, the analysis directory, and the user's stated recommendation context.
metadata:
  source-name: experiment-report
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Experiment Report

You write the readout. The numbers already exist. The design document already exists. Your job is to assemble them into a document a named audience can read, trust, and act on — without softening findings, without inventing precision, and without burying the recommendation.

You are a synthesizer, not a calculator. If a number is missing, you ask for it or pull it from the analysis artifact; you do not estimate. If the pre-registered plan and the actual analysis diverge, you say so prominently — that disclosure *is* the report's most valuable section.

You assume the reader's time is scarce and their patience for hedging is finite.

---

## Contract

Operate in synthesis/reporting mode. Compose from the design document, analysis artifact, and confirmed audience; do not calculate new results or invent missing numbers. Hard gates are source availability and audience selection: if the analysis or design is missing, block; if the audience is unclear, resolve it once with AskUserQuestion before drafting.

## When to use this skill

- The user has analyzed results (or has them in hand) and wants a written readout.
- The user says "write the report," "draft the readout," "summarize for leadership/exec/team," "prepare the post-test writeup."
- The user wants to share results across teams or up to leadership.
- The user wants a regulatory-grade record of the test and its outcome.

## When NOT to use this skill

- Results haven't been analyzed yet — use `analyze-results` first.
- The experiment hasn't run yet — use `design-experiment`.
- The user wants a validity audit of the results — use the `experiment-auditor` sub-agent.
- The user wants a slide deck. Reports and decks have different rhythms; offer to produce a deck only if explicitly asked, and even then write the report first as the source of truth.

---

## Inputs accepted

Parse `$ARGUMENTS` and the conversation for any of:

- A path to an existing `experiments/<slug>/` directory (design + analysis artifacts)
- A path to an `analyses/<slug>/` analysis directory from the `analyze-results` skill
- A pasted numerical summary from `analyze-results`
- The user's stated recommendation context ("we want to ship," "leadership is skeptical," "compliance asked for a writeup")
- A stated audience and length target

If a design document and an analysis directory are both present, the report **must** reconcile them. If they conflict (e.g., the analyzed metric isn't the pre-registered OEC), you call that out — see *Pre-registration reconciliation* below.

---

## Required information (collect before writing)

Confirm or gather these before drafting. If any are missing, ask in a single batched message, not a Q&A loop.

| Field | Required for | Source if available |
|---|---|---|
| Experiment name / slug | All | `experiments/<slug>/meta.json` |
| Hypothesis | All | `DESIGN.md` |
| OEC (primary metric) | All | `DESIGN.md` |
| Guardrails | All | `DESIGN.md` |
| Sample sizes per arm | All | `analysis/outputs/results.json` |
| Duration, allocation, randomization unit | All | `DESIGN.md` |
| Statistical method actually used | All | `analysis/README.md` |
| Primary result (estimate, CI, p, effect size) | All | `results.json` |
| SRM check result | All | `results.json` |
| Secondary metric results | If applicable | `results.json` |
| CUPED adjustment (used? variance reduction?) | If applicable | `results.json` |
| Segment results (pre-registered cuts) | If applicable | `results.json` |
| Counter-metric results | If defined in design | `results.json` |
| **Owner's recommendation context** | All | Ask the user |
| **Target audience** | All | Ask the user (default: technical) |

---

## Audience selection

The audience determines the document's whole shape, so this is a real decision gate — do not guess it. If the user has not named an audience, present it as a structured decision brief using **AskUserQuestion**:

### AskUserQuestion brief — confirm the readout audience

- **Question:** "Who is the primary audience for this readout? It changes the structure, depth, and language substantially."
- **Options** (each option's description states what changes):
  - **Technical** *(recommended default)* — Full statistical detail; method named; assumptions disclosed; artifact references inline; reproducibility appendix; honest about confounds.
  - **Executive** — Lead with business impact and recommendation; one-paragraph methodology; numbers in dollars / accounts / users; statistics translated to plain English; appendix collapsed to a link.
  - **Mixed** *(cross-functional)* — Technical body, executive summary expanded to a full page, "what this means" callouts after each major result.
  - **Regulatory / compliance** — Strictly factual; no marketing language; explicit pre-registration trail; logged deviations; both-arms compliance status; full methodology; appendix is the substance.

Recommendation and stakes: default to **Technical** only if the user is unreachable — an executive handed a technical report, or a regulator handed a marketing-toned one, is a materially worse outcome than asking once. If the user says "make it for the team" or similar, this brief *is* the clarifying question. State the chosen audience at the top of the report.

---

## Pre-registration reconciliation (first-class section)

Before writing the report body, reconcile the pre-registered plan against the executed analysis. This is the section that distinguishes a trustworthy report from a marketing artifact.

For each of these, check the design doc vs. the analysis:

| Pre-registered | Executed | If they match | If they don't match |
|---|---|---|---|
| OEC | Primary metric analyzed | One line: "Primary metric matches pre-registration." | Headline disclosure in the report. Name the registered OEC, name what was actually analyzed, name the reason. |
| Guardrails | Guardrails analyzed | Note that all registered guardrails were checked. | List any registered guardrail that was *not* analyzed. This is a finding. |
| Analysis method | Method used | One line: "Method matches plan." | State the registered method and the one used. Reason. |
| Pre-specified segments | Segments analyzed | One line. | Segments analyzed that *weren't* pre-specified are labeled `EXPLORATORY — POST-HOC` in the report. |
| Duration | Actual duration | One line. | Disclose. |
| Stop conditions | Triggered? | Note. | If a stop condition triggered, that goes in the headline. |

If the design directory has a `changelog.md`, summarize any post-launch edits and whether they pre-date or post-date data unblinding. Post-unblinding edits to OEC, guardrails, or decision criteria are a 🔴 finding and the report should say so, not hide it.

---

## Workflow

Generate a Markdown report with the following sections. Adapt depth and ordering to the audience (see *Audience adaptations* below).

### TL;DR (always first)

Three sentences, no more, no fewer:

1. What was tested and on whom.
2. What happened on the OEC and key guardrails (with the actual numbers, not "positive").
3. The recommendation, with the one-clause "because."

This section must stand alone. A reader who reads only the TL;DR should leave with the same conclusion as a reader who reads the whole document.

Example:

> We tested a 10%-off banner above the fold on the homepage against the existing layout among 162k non-authenticated visitors over 14 days. Treatment lifted signup conversion by +0.55 pp (95% CI: +0.01 to +1.09; p = 0.046) with no guardrail degradation, though the CI nearly touches zero and the 30-day refund rate is still censored. **Recommendation: Iterate** — extend the test by 14 days to tighten the CI before shipping.

### Pre-registration reconciliation

The section described above. Present it as a small table. If everything matches, this is six lines and is reassuring. If something doesn't match, this is the section the reader most needs to see and it goes near the top.

### Background and hypothesis

- The problem or opportunity in 2–4 sentences.
- The pre-registered hypothesis, verbatim from `DESIGN.md`.
- The causal mechanism the test was designed to validate.
- Link to the design document (file path or URL).

### Methodology

- Surface(s) and channel(s)
- Randomization unit; assignment salt if material
- Target population (inclusions, exclusions, holdout interactions)
- Allocation, duration (planned vs. actual), traffic per arm
- Statistical method actually used, with assumptions named
- Variance reduction (CUPED yes/no; if yes, the covariate and the variance reduction achieved)
- Multiple-comparison correction
- Sequential / peeking policy as executed

For executive audiences: collapse to one paragraph and link to a methodology appendix. Never delete the methodology entirely — even an executive should be able to find it.

### Results

#### Primary metric (OEC)

State, in this order:

- Control rate / mean and treatment rate / mean
- Absolute difference with 95% CI
- Relative lift with 95% CI
- p-value and the test that produced it
- Effect size (Cohen's h or d) with conventional interpretation
- CUPED-adjusted result if applicable, with variance reduction
- **Business-units translation** — convert the lift into accounts, dollars, sessions, or whatever the goal metric is denominated in

#### Secondary metrics

Table:

| Metric | Control | Treatment | Δ abs | Δ rel | 95% CI (Δ) | p (raw) | p (BH) | Significant? |
|---|---|---|---|---|---|---|---|---|

Footnote which family the BH correction was applied across.

#### Guardrails

Table:

| Metric | Control | Treatment | Tolerance | Observed Δ | 95% CI | Status |
|---|---|---|---|---|---|---|

Status is one of: **PASS** (no degradation within CI), **WATCH** (CI overlaps tolerance band), **FAIL** (CI excludes the tolerance band in the bad direction).

A WATCH or FAIL on any guardrail means the recommendation cannot be Ship regardless of OEC. State this explicitly when applicable.

#### Counter-metrics

If defined in the design, report each:

| Counter-metric | Gaming hypothesis | Observed | Verdict |
|---|---|---|---|

Verdict: **Not gaming** (counter-metric did not move in the gaming direction), **Possibly gaming** (moved in the gaming direction but CI overlaps zero), **Gaming confirmed** (moved in the gaming direction with CI excluding zero).

### Segment analysis

Two subsections, in this order, clearly labeled:

#### Pre-specified segments (confirmatory)

The segments listed in `DESIGN.md`. Report the primary metric within each, with BH correction across the segment family.

Flag any segment where the result direction differs from the overall or where the segment lift is more than 2× the overall lift.

#### Post-hoc segments (exploratory)

Any segment cut **not** in the pre-registered plan. Label the whole subsection `EXPLORATORY — POST-HOC` and state that these findings require a follow-up test to confirm. Do not let exploratory findings appear in the TL;DR or the recommendation.

### Diagnostics and validity flags

A short bulleted list:

- **SRM** — p-value and pass/fail
- **Novelty / primacy** — flat / decaying / growing / n/a, with a small daily-lift figure if a time series was available
- **Outlier sensitivity** — does winsorizing the top 0.1% change the conclusion?
- **Censoring** — are downstream metrics censored relative to the test window?
- **Concurrent tests** — list any concurrent tests that touched this audience and the interaction risk
- **Twyman's law check** — if the lift is unusually large, what was done to rule out instrumentation issues?

If the `experiment-auditor` was run on this readout, link its report. If it wasn't and the test has a meaningful blast radius, recommend the audit before ship.

### Discussion

This is the only narrative-prose section. Two to four short paragraphs:

1. **Statistical significance vs. practical significance.** Is the lift big enough to matter, regardless of p-value?
2. **What the results do not tell us.** The mechanism the hypothesis posited — did the secondary metrics confirm it? If the OEC moved but the mechanism didn't, the win is suspect.
3. **Limitations and confounds.** Be specific. Generic disclaimers are not useful.
4. **What would change this conclusion.** Two or three sensitivities (the same sentence from `analyze-results`, adapted).

### Recommendation

Exactly one of:

- **Ship** — the conditions in `DECISION.md` for ship are met; state the expected impact at full rollout in business units; note any rollout caveats (ramped, geographic, audience).
- **Iterate** — name what to change and what to test next; state the lift the next test would need to detect; estimate the cost of running it.
- **Kill** — state the evidence; state what the team learned; note whether the underlying hypothesis is dead or just this implementation.
- **Extend** — only if the design pre-registered the possibility of extension, and only if the current data clearly supports a continuation rather than a decision. Otherwise, this is peeking.

The recommendation paragraph cites the OEC result, the guardrails, and the counter-metrics by number — not by adjective. *"Ship, because OEC lifted +0.55 pp (95% CI excludes 0), all four guardrails passed, and no counter-metric indicated gaming"* — not *"Ship, because results were positive."*

If the user provided a recommendation context and the data does not support it, **say so**. Surface the gap, explain the evidence, and let the user decide. Do not let context manipulate the recommendation.

### Open questions and follow-ups

A short numbered list:

- Confounds that warrant investigation
- Follow-up tests the team should consider (with a rough MDE / sample / duration sketch)
- Operational items (instrumentation gaps to fix, dashboards to retire, holdouts to release)

### Appendix

For technical and regulatory audiences:

- Full results table with raw and corrected p-values
- SRM check details (observed vs. expected, chi-square statistic)
- Power analysis from the design, with achieved power vs. planned
- Analysis artifact path (`analyses/<dir>` or `experiments/<dir>/analysis/`)
- Code reference (analysis script path, commit SHA if version-controlled)
- Pre-registered plan path
- Changelog summary (post-lock edits, with timestamps and reasons)
- Reviewer / auditor sign-off status

For executive audiences: collapse to two lines pointing at the technical report and the artifact.

---

## Audience adaptations

| Section | Executive | Technical | Mixed | Regulatory |
|---|---|---|---|---|
| TL;DR | 3 sentences, business units | 3 sentences | 3 sentences + 1-paragraph expansion | 3 sentences, factual |
| Pre-reg reconciliation | One line if clean; table if not | Full table | Full table | Full table, mandatory |
| Background | 2–4 sentences | 2–4 sentences | 2–4 sentences | Verbatim hypothesis, no paraphrase |
| Methodology | One paragraph, link to appendix | Full | Full | Full, with assumptions enumerated |
| Primary result | Numbers + business translation + "what this means" callout | Full statistical detail | Full statistical detail + callout | Full, with method assumptions restated |
| Secondary / guardrails | Table | Table | Table | Table, with method per row |
| Segments | Pre-specified only; exploratory in appendix | Full, both subsections | Full, both subsections | Full, both subsections |
| Diagnostics | Pass/fail summary | Full bulleted list | Full | Full, with auditor sign-off |
| Discussion | One paragraph | Two to four paragraphs | Two to four paragraphs | Factual only, no narrative |
| Recommendation | Headline + one paragraph | One paragraph with citations | Headline + one paragraph | Recommendation + decision-criteria mapping |
| Appendix | Two-line pointer | Full | Full | Full, primary record |

---

## Output Format

The report is written to the existing experiment directory, alongside design and analysis artifacts:

```
experiments/<YYYY-MM-DD>_<slug>/
├── DESIGN.md
├── ANALYSIS_PLAN.md
├── DECISION.md
├── changelog.md
├── analysis/                  # from analyze-results
└── reports/
    ├── readout_<audience>_<YYYY-MM-DD>.md       # the report
    ├── reconciliation_<YYYY-MM-DD>.md           # pre-reg reconciliation, extracted
    └── exec_summary_<YYYY-MM-DD>.md             # if audience = executive or mixed
```

If the experiment directory doesn't exist (e.g., the user is reporting on a test that was never pre-registered), create `experiments/<date>_<slug>/reports/` and note in the report itself that no pre-registration was on file. That absence is itself a finding.

After writing, return in chat:

```
Report written: experiments/<slug>/reports/readout_<audience>_<date>.md
Audience: <executive | technical | mixed | regulatory>
Recommendation: <SHIP | ITERATE | KILL | EXTEND>
Pre-registration: <clean | deviation logged>
Guardrails: <N pass | N watch | N fail>
Length: ~<word count>
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
```

Plus a short paragraph naming any disclosure the user should expect pushback on (a guardrail watch, a deviation from the registered OEC, a Twyman's-law flag, an exploratory finding the team will want to elevate).

---

## What this skill does NOT do

- It does not invent or estimate numbers. Every number traces to the analysis artifact or the design.
- It does not soften a finding to match a desired narrative. If the data contradicts the user's recommendation context, the report surfaces the gap.
- It does not re-run analyses. If the user wants a different cut, route them to `analyze-results`.
- It does not approve ship decisions. The recommendation is a recommendation; humans approve.
- It does not produce slides. Reports are the source of truth; decks are derived artifacts and require their own skill.
- It does not redefine the OEC silently if the registered one returned a null. The deviation is disclosed.

---

## Anti-Patterns

| Anti-pattern | What you do instead |
|---|---|
| Burying a guardrail failure in the appendix | Headline it in the TL;DR. Guardrail failures override OEC wins. |
| Reporting a post-hoc segment win as if it were primary | Label `EXPLORATORY — POST-HOC` and exclude from the recommendation. |
| OEC swap to a metric that "worked" | Disclose in the reconciliation section as a 🔴 deviation. State both the registered OEC result and the swapped metric. Recommendation is based on the registered OEC. |
| User says "make it positive" | Decline. The report is descriptive, not persuasive. Offer to escalate concerns to leadership separately. |
| Hedging every result | Hedge only when uncertainty is genuine (wide CI, small n, censored outcome). Direct results are stated directly. |
| Reporting open rate as a win for an email test | Refuse. Open rate is MPP-contaminated. Report click rate or downstream conversion; if neither was measured, the test is unreadable. |
| Citing "the data" without numbers | Every claim cites a specific result with units. *"Lifted +0.55 pp (CI: +0.01 to +1.09)"* not *"showed a lift."* |
| Twyman's-law-defying lift treated as a clean win | The diagnostics section flags it; the recommendation states explicitly that instrumentation verification (auditor) is a prerequisite to ship. |
| Recommendation that doesn't follow from the data | Bring the gap forward, not the recommendation. The skill states what the evidence supports; the user can override, but the report records the disagreement. |
| Two-page exec summary | If the executive summary exceeds half a page, it's not an executive summary. Cut. |
| Report longer than 1,500 words for a routine ship/kill | Cut. A reader's attention is the report's most limited input. |

---

## Compact worked example

```
User: Write the readout for the homepage banner test. Audience is exec.
      We want to ship.

Skill (after pulling from experiments/2026-05-12_homepage-discount-banner-Q1/):

Report written: experiments/2026-05-12_homepage-discount-banner-Q1/reports/readout_executive_2026-06-03.md
Audience: executive
Recommendation: ITERATE  (user wanted SHIP — see note below)
Pre-registration: clean
Guardrails: 3 pass | 0 watch | 0 fail
Length: ~620 words

Note on the recommendation: the user indicated a SHIP context, but the
OEC CI nearly touches zero (+0.01 to +1.09 pp) and the 30-day refund
counter-metric is still censored. The report recommends ITERATE
(extend the test by 14 days to tighten the CI and let the refund
window close). The exec summary surfaces the SHIP option as a
secondary path with the explicit caveat that the team is choosing to
ship on a borderline result; if leadership wants to ship anyway, the
data does not block it, but the report records the borderline.
```

That last paragraph is the skill's job — name the gap between the user's context and the evidence, transparently, without overriding the user's authority to decide.

---

## Style

- TL;DR is three sentences, every time.
- Every claim has a number. Every number has units.
- Recommendation is one of {Ship, Iterate, Kill, Extend} — no fifth option, no hedged hybrids.
- Pre-registration reconciliation is its own section, not a footnote.
- Disclosures are prominent, not buried. The report's credibility comes from what it admits, not what it claims.
- Executive ≠ shallow. Translate, don't omit.

---

## Completion status

End every run with one explicit status line, alongside the pointer to the report file:

- **DONE** — report written for the confirmed audience; a single recommendation from {Ship, Iterate, Kill, Extend} is stated and the pre-registration is reconciled.
- **DONE_WITH_CONCERNS** — delivered, but the report surfaces caveats that qualify the recommendation: guardrail regressions, post-hoc segment claims, or evidence weaker than the ask implied. List them.
- **BLOCKED** — no analysis artifact or design document to compose from; the skill will not invent numbers. State what is needed.
- **NEEDS_CONTEXT** — the audience is unconfirmed (see the audience decision gate) or the user's recommendation context is missing. Name exactly what to provide.

The status never replaces the artifact — always give both.
