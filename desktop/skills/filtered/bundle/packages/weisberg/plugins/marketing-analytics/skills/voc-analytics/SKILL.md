---
name: weisberg-voc-analytics
description: Use when the user mentions NPS, Net Promoter Score, CSAT, customer satisfaction, CES, Customer Effort Score, survey analytics, survey results, customer feedback, open-text analysis, verbatim analysis, sentiment analysis on feedback, voice of customer, VoC, customer comments, feedback themes, review analysis, or satisfaction tracking. Also trigger on 'what are customers saying' or 'analyze our survey results.' For sentiment on public social posts use social-analytics; for grouping customers into segments use audience-segmentation; this skill owns survey/feedback metrics and open-text themes. If survey data is not yet in the workspace, run data-extraction first.
metadata:
  source-name: voc-analytics
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Survey & Voice-of-Customer Analytics

NPS/CSAT/CES tracking with bootstrap CIs, LLM-based open-text theme extraction,
key-driver analysis, and satisfaction-behavior correlation.

## Contract

**Role:** Advisory analyst. Measures satisfaction and extracts themes; does not
contact respondents. Metric computation runs in deterministic Python scripts;
theme extraction uses a structured LLM call.

**Mode:**
- `quick` — NPS/CSAT/CES with confidence intervals.
- `standard` (default) — add open-text theme extraction and key-driver analysis.
- `deep` — add segment cross-tabs, satisfaction-behavior correlation, trend
  detection.

**When to use:** NPS/CSAT/CES metrics, survey verbatim/theme analysis, key
satisfaction drivers, satisfaction trends.

**When NOT to use:** sentiment on public social posts → `social-analytics`;
customer clustering → `audience-segmentation`; email feedback surveys' delivery →
`email-analytics`. See `../../references/skill-index.md`.

**Evidence required (inputs):**
- `workspace/raw/survey_responses.csv` — `respondent_id`, `question_id`,
  `response`, `score`, `timestamp`. Required. If absent, STOP and run
  **data-extraction** first.
- `workspace/processed/segments.json` — from audience-segmentation (optional;
  cross-tabs).
- `workspace/analysis/clv_predictions.json` — from clv-modeling (optional;
  satisfaction-value correlation).

**Depends on:** data-extraction, audience-segmentation. **Feeds into:** reporting,
seo-content, email-analytics. Builder detail in `references/authoring-notes.md`.

**Hard STOP (PII / low sample):** (a) Before sending any open-text to an external
LLM, run PII detection and redact account-specific information — STOP extraction if
redaction can't be confirmed. (b) If a segment has fewer than 30 responses, do not
report its metric as reliable — flag it low-confidence rather than emitting a
precise number.

Parse `$ARGUMENTS` for inline paths, metric type, or theme taxonomy.

## Workflow

1. **Validate inputs.** Load `survey_responses.csv`; verify columns; confirm score
   ranges match the metric (0–10 NPS, 1–5 CSAT, 1–7 CES). Apply the low-sample Hard
   STOP per segment.

2. **Compute metrics.** Run `scripts/compute_metrics.py`: NPS (%Promoters −
   %Detractors), CSAT (top-box %), CES (mean effort), each with bootstrap CIs
   (≥10,000 iterations). See `references/survey_methodology.md`.

3. **Theme-taxonomy gate (AskUserQuestion).** Before extracting open-text themes,
   confirm the approach:
   - **Question:** "How should I categorize open-text responses?"
   - **Options:** (a) *Predefined taxonomy* — you supply the theme list, best for
     tracking known issues over time; (b) *Emergent discovery* — the LLM proposes
     themes from the data; (c) *Hybrid* — predefined plus emergent additions
     (default). Then apply the PII Hard STOP before any external LLM call.

4. **Extract themes.** Run `scripts/text_categorization.py`: structured LLM
   categorization into the chosen taxonomy with sentiment + intensity per response;
   handle multilingual input. See `references/text_analytics.md`.

5. **Key drivers.** Run `scripts/key_driver_analysis.py`: permutation importance
   (random forest) linking themes/touchpoints to Promoter vs Detractor
   classification — not bivariate correlation.

6. **Trends** (deep mode). Run `scripts/satisfaction_trends.py`: detect significant
   shifts over time; flag NPS movement > 5 points; control for seasonality and
   response-mix.

7. **Cross-tabulate** (deep mode). If `segments.json` present, break metrics down
   by segment/product/channel/touchpoint; surface high-value Detractors and
   low-effort Promoters (respecting the low-sample gate).

8. **Correlate with behavior** (deep mode). If `clv_predictions.json` present, link
   satisfaction to CLV/retention with explicit correlation-not-causation
   disclaimers.

9. **Report.** Write outputs and the HTML dashboard.

## Output Format

Artifacts:

| File | Contents |
|------|----------|
| `workspace/analysis/satisfaction_metrics.json` | NPS, CSAT, CES with CIs and trend significance |
| `workspace/analysis/text_themes.json` | Theme extraction with frequency and sentiment |
| `workspace/analysis/satisfaction_drivers.json` | Key-driver analysis linking themes to scores |
| `workspace/reports/voc_dashboard.html` | Voice-of-customer dashboard |

Report states: metric definitions used, CI method, theme taxonomy, low-confidence
segments (n<30), and the causal disclaimer on any correlation.

**Financial services mode:** survey data may hold PII subject to data-protection
rules — apply access controls and anonymization; NPS/satisfaction used in marketing
claims must meet SEC Marketing Rule testimonial provisions (no endorsement framing
without disclaimers); run PII detection/redaction before sending text to external
LLM APIs. Satisfaction claims used in marketing route through **compliance-review**.

**Completion status:**
- `DONE` — metrics, themes, and drivers written with CIs.
- `DONE_WITH_CONCERNS` — e.g., low-confidence segments, PII redaction limited
  extraction, thin verbatim volume.
- `BLOCKED` — PII Hard STOP unresolved or missing survey data; state the fix.
- `NEEDS_CONTEXT` — theme taxonomy unresolved by the user.

## Anti-Patterns

- Sending un-redacted open-text with account details to an external LLM.
- Reporting a segment metric as precise when n < 30.
- Normal-approximation CIs on NPS instead of bootstrapping.
- Key drivers from bivariate correlation instead of permutation importance.
- Presenting satisfaction-behavior correlation as causation.
- Letting the model compute NPS or confidence intervals instead of the scripts.
