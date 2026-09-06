## Input
We've built a prototype of an AI-powered "deal coach" for our B2B sales tool. Sales reps paste in a deal context (company, deal stage, last 3 meeting notes, CRM notes) and get back a 5-point action plan for moving the deal forward.

Evaluation goal: decide whether to build this into the product or drop it.
Success criteria: at least 80% of outputs should be rated "would use this" by our sales team, action items must be specific to the deal (not generic sales advice), and latency must be under 10 seconds.

We've run the prototype on 30 deals from our live pipeline — 10 deals per stage (early, mid, late). Sales reps scored each output: "would use / wouldn't use / maybe". They also flagged any generic or irrelevant suggestions.

Results:
- Overall "would use" rate: 67%
- "Wouldn't use" rate: 18%
- "Maybe" rate: 15%
- Generic/irrelevant flags: 22% of outputs had at least 1 generic suggestion
- Late-stage deals: "would use" rate was 89%
- Early-stage deals: "would use" rate was 44% (significantly worse)
- Latency: average 7.2s, max 14s (2 outlier deals with very long meeting notes)

## Expected output
Evaluation dimensions and success criteria:

| Dimension | Success criteria | Result |
|----------|----------------|--------|
| Overall adoption intent | >80% "would use" | 67% — FAILED |
| Specificity (no generic suggestions) | <10% of outputs flagged | 22% flagged — FAILED |
| Latency | <10 seconds | 7.2s average, 2 outliers at 14s — PARTIAL PASS |
| Late-stage quality | N/A (not pre-defined) | 89% — well above threshold |
| Early-stage quality | N/A (not pre-defined) | 44% — well below threshold |

---

Test set design review:
30 deals across 3 stages was a reasonable first test. The stage breakdown was appropriate and revealed a critical finding. Limitation: 10 deals per stage is a small sample — the 44% early-stage figure could shift with more data.

---

Results by dimension:

**Output quality (specificity):**
22% of outputs included at least one generic suggestion. Review of flagged outputs showed a pattern: when meeting notes were sparse (early-stage deals with 1–2 short notes), the model defaulted to generic best practices ("Follow up within 48 hours", "Understand their decision process"). These are technically valid but not specific to the deal — reps rated them as useless.

**Stage-specific performance:**
Late-stage: 89% adoption intent. Reps found the model's action items highly relevant when there was rich meeting note context to work from.
Early-stage: 44% adoption intent. Low context input = low-quality output. This is a fundamental data availability problem, not a model quality problem.

**Latency:**
Average is acceptable. The 2 outliers are caused by very long meeting note inputs exceeding prompt length. Can be addressed with input truncation or chunking.

---

Failure modes and severity:

| Failure mode | Frequency | Severity |
|-------------|----------|---------|
| Generic advice (sparse input) | High — early-stage deals | Medium — reps know to ignore it but it erodes trust |
| Incorrect context interpretation | Low — 2 of 30 deals | High — if AI misreads the deal situation, advice is actively wrong |
| Latency outliers (long inputs) | Rare (2 of 30) | Low — fixable with input length limits |

---

UX assessment:
Reps liked the format (5 action items) but several noted they wanted to know why the AI was suggesting each action. "Move to next stage" without a reason isn't useful. This is a prompt design issue, not a model issue.

---

Readiness verdict: Iterate prototype

Rationale:
The late-stage result (89%) is strong — this is a clear build signal for deals in the last 2 stages. The early-stage result (44%) means the current design fails for ~30–40% of the use case. The problems are addressable:
- Early-stage: either scope the feature to mid/late stage only (quick solution) or add a context-enrichment step where reps fill in a short structured context form before generating advice
- Generic outputs: improve prompt to require the model to cite specific deal details for each action item
- Latency: add input truncation for notes over 2,000 words

Don't build the full feature in its current form. Scope to late-stage deals, fix the specificity prompt, and re-test on 20 more deals before committing.

---

Conditions for proceeding to development:
1. Re-test on 20 late-stage deals with updated prompt requiring cited deal context per action item
2. Confirm >80% "would use" rate on that sample
3. Input length limit implemented and tested (no more 14s outliers)
4. Decision documented: is early-stage included in v1 or scoped out?
