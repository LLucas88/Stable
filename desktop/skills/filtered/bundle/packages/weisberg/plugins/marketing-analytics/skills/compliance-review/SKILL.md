---
name: weisberg-compliance-review
description: Use when the user mentions compliance review, regulatory check, SEC compliance, FINRA compliance, FCA compliance, marketing compliance, disclosure check, disclaimer, performance presentation, testimonial compliance, endorsement compliance, fair and balanced, risk disclosure, past performance disclaimer, GIPS, investment advertisement, financial promotion, advertising review, regulatory filing, or archival requirements. ALWAYS trigger automatically when any other skill produces customer-facing content in a workspace tagged as financial services. Also trigger on 'is this compliant' or 'check this for regulatory issues.' For experiment conduct-risk and trust review use experimentation:compliance-trust-review, not this skill.
metadata:
  source-name: compliance-review
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Compliance-Aware Content Review

**Role:** Read-and-advise. Fix-allowed only within `workspace/compliance/`; you
**never** modify the source content — you flag issues and suggest remediation,
preserving the human compliance officer's final authority.

> **ADVISORY NOTICE (HARD GATE):** This skill provides an advisory first-pass
> review only. It does NOT constitute compliance certification, legal advice, or
> regulatory approval. Every finding requires confirmation by a qualified human
> compliance officer before any content is distributed. Never treat this output
> as a final compliance determination. Every report you emit must restate this
> notice. When in doubt, flag for human review rather than pass content silently.

## Contract

**When to use**
- First-pass regulatory screen of marketing/customer-facing content for SEC
  Marketing Rule 206(4)-1, FINRA Rule 2210, and/or FCA financial-promotions rules.
- The mandatory FS-mode gate other skills route through before distributing
  reports, ad copy, email, or web content.

**When NOT to use** (route instead)
- Experiment conduct-risk, fairness, or trust-erosion review →
  `experimentation:compliance-trust-review`.
- Non-financial brand/voice/style review → outside this plugin's scope.

**Mode classification** (declare which)

| Mode | Trigger | Scope |
|---|---|---|
| **Quick** | Single short asset (one ad, one subject line) | Classify → scan → findings; skip archival unless asked. |
| **Standard** | A report or campaign asset for distribution | Full pipeline through archival manifest. |
| **Deep** | Multi-jurisdiction / performance-heavy content | Standard + performance-presentation validation across SEC/FINRA/FCA and disclosure insertion. |

**Inputs**

| Source | Description |
|---|---|
| `workspace/reports/*.html` or `*.docx` | Content produced by other skills for distribution. |
| `workspace/reports/mmm_executive_summary.html` | Attribution reports with performance claims. |
| `workspace/analysis/experiment_results.json` | Experiment results used in marketing claims. |

**Rule references (the checklists this pipeline screens against):**
`references/sec_marketing_rule.md`, `references/finra_rule_2210.md`,
`references/fca_financial_promotions.md`, `references/disclosure_templates.md`,
`references/archival_requirements.md`. These are versioned and carry their own
effective dates — screen against the reference, do not hardcode rules here.

**Outputs**

| File | Description |
|---|---|
| `workspace/compliance/review_report.json` | Issue-by-issue findings: severity, rule citation, remediation. |
| `workspace/compliance/compliant_content.html` | A *copy* with suggested disclosures inserted (never overwrites source). |
| `workspace/compliance/archival_manifest.json` | Content tagged for regulatory archival with retention metadata. |
| `workspace/compliance/review_log.json` | Append-only, immutable audit trail of all reviews. |

## Workflow

An ordered review pipeline. Each stage feeds the next; do not skip classification
or the advisory notice.

1. **Intake.** Load the content to review. Identify what it is (report, ad copy,
   email, testimonial, web page) and confirm the workspace's regulatory context
   (SEC-registered adviser, FINRA broker-dealer, FCA UK, or multiple). If the
   jurisdiction is ambiguous, screen against all applicable references and say so.

2. **Classify (drives everything downstream).** Run `scripts/content_scanner.py`
   classification to tag the content along five dimensions:
   - **Jurisdiction:** SEC / FINRA / FCA / multiple.
   - **Audience:** institutional (>$50M AUM) / retail (25+ in 30 days) / correspondence.
   - **Content type:** performance / testimonial / educational / promotional / commentary.
   - **Filing requirement:** pre-use / post-use / supervision-only.
   - **Risk level:** High / Medium / Low / Info.

3. **Screen against each applicable regulation's checklist.** For each jurisdiction
   in scope, run `scripts/content_scanner.py` against that reference:
   - **SEC 206(4)-1** (`references/sec_marketing_rule.md`): the seven general
     prohibitions — untrue/unsubstantiated claims, misleading implications, omitted
     material facts, cherry-picked performance, audience-inappropriate claims, and the
     catch-all. Require a traceable workspace data source for every material factual claim.
   - **FINRA 2210** (`references/finra_rule_2210.md`): fair-and-balanced standard,
     benefit/risk balance, prohibition on retail projections, and filing triggers
     (first-year firms, options, structured products, leveraged/inverse ETFs, RICs).
   - **FCA** (`references/fca_financial_promotions.md`): clear/fair/not-misleading,
     product-specific risk warnings, capital-at-risk and complexity warnings,
     target-market appropriateness (PS22/10 high-risk warnings).
   For **performance content**, additionally run `scripts/performance_validator.py`:
   gross/net equal prominence, required 1/5/10-year (or since-inception) periods,
   benchmark inclusion, and hypothetical/back-tested disclosure.

4. **Findings with severity.** Compile each issue with severity, rule citation,
   content location, and suggested remediation. Reserve **HIGH** for clear violations
   (superlatives, guarantees, missing mandatory disclaimer); use **MEDIUM/LOW** for
   judgment calls (tone, emphasis). High-severity violations aim for near-100% recall;
   keep the false-positive rate low on Low/Info to preserve reviewer trust.

5. **Decision gate — disclosure insertion.** When required disclosures are missing,
   use **AskUserQuestion** before writing `compliant_content.html`: insert the
   firm-approved template language (from `references/disclosure_templates.md`), insert
   the regulatory-standard fallback, or leave placeholders for the compliance officer?
   Never silently rewrite the source. Run `scripts/disclosure_inserter.py` on a *copy*.

6. **Advisory report.** Write `workspace/compliance/review_report.json` (schema below)
   with `overall_status` PASS/WARNING/FAIL, the full issue list, disclosures
   required/present/missing, and the classification. Restate the advisory notice in the
   report and set `requires_human_review: true` on every issue.

7. **Archival manifest.** Run `scripts/archival_tagger.py` to write
   `workspace/compliance/archival_manifest.json`: content ID, ISO-8601 review timestamp,
   reviewer `"automated-first-pass"`, retention period (per SEC Rule 17a-4 / FINRA,
   `references/archival_requirements.md`), WORM flag, filing status, and content hash.
   Append the review to the immutable `workspace/compliance/review_log.json`.

**Cross-skill wiring:** this is the terminal FS-mode gate. `reporting`,
`email-analytics`, `paid-media`, `seo-content`, `social-analytics`, and
`attribution-analysis` route customer-facing output here before distribution. It
reads from their output directories and writes only to `workspace/compliance/`;
it does not block other skills from running.

## Output Format

Report to the user with the advisory notice, then the findings summary. The
`review_report.json` schema:

```json
{
  "review_id": "string (UUID)",
  "review_timestamp": "string (ISO 8601)",
  "content_source": "string (file path)",
  "overall_status": "PASS | FAIL | WARNING",
  "advisory_notice": "This is an advisory first-pass review, not compliance certification.",
  "issues": [
    {"issue_id": "string", "severity": "HIGH | MEDIUM | LOW | INFO",
     "category": "SEC | FINRA | FCA | DISCLOSURE | ARCHIVAL",
     "rule_citation": "string", "description": "string", "location": "string",
     "remediation": "string", "requires_human_review": true}
  ],
  "disclosures_required": ["string"],
  "disclosures_present": ["string"],
  "disclosures_missing": ["string"],
  "classification": {"jurisdiction": ["SEC","FINRA","FCA"],
    "audience": "INSTITUTIONAL | RETAIL | CORRESPONDENCE",
    "content_type": "string", "filing_required": "PRE_USE | POST_USE | NONE"},
  "archival_metadata": {"retention_period_years": 0, "worm_required": true,
    "content_hash": "string (SHA-256)"}
}
```

Completion status (this skill never emits an "approved" verdict):
- `DONE` — reviewed, findings + archival manifest written, advisory notice included.
  `overall_status` still requires human confirmation.
- `DONE_WITH_CONCERNS` — HIGH-severity findings present; distribution should not
  proceed until a human compliance officer clears them.
- `BLOCKED` — content unreadable or jurisdiction undeterminable; name the blocker.
- `NEEDS_CONTEXT` — missing the content, the jurisdiction, or firm disclosure
  templates (state what).

## Anti-Patterns

- **Do not** certify compliance or emit an "approved" determination — advisory only.
- **Do not** overwrite source content; write suggestions to a copy in `workspace/compliance/`.
- **Do not** hardcode regulatory rules in this body; screen against the versioned references.
- **Do not** use HIGH severity for judgment calls; reserve it for clear violations.
- **Do not** pass content silently when uncertain — flag for human review.
- **Do not** mutate the review log; it is append-only and immutable once written.

Builder-facing acceptance criteria and engineering conventions live in the
plugin's `references/authoring-notes.md`, not in this runtime body.
