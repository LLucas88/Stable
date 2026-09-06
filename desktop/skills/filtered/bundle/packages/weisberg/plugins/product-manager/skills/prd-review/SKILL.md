---
name: weisberg-prd-review
description: Use this skill when the user has an existing PRD, product spec, one-pager, or PR/FAQ and wants critique, approval-readiness review, quality-bar scoring, required changes, or a red-team pass. Trigger on phrases like "review this PRD", "critique my product spec", "is this PRD ready", "PRD quality bar", "red-team this requirements doc", "find gaps in this PR/FAQ", or "what would block approval". Do NOT trigger for drafting a new PRD from an idea (use prd-writer), converting an approved PRD into an agentic implementation plan (use prd-to-plan), building a roadmap (use roadmap), or ranking multiple initiatives (use prioritization).
metadata:
  source-name: prd-review
  bundle: ops-expanded-2026-09-06
  upstream-allowed-tools: '["Read", "Write", "Edit", "Grep", "Glob", "Bash", "AskUserQuestion"]'
  upstream-mutating: 'True'
  upstream-version: 1.0.0
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# PRD Review

## Contract

Run a structured critique loop against an existing product requirements artifact.
The job is to decide whether the PRD is ready for product, design, engineering,
data, GTM, legal, or executive review, and to name the concrete changes required
to make it decision-ready.

Hard gates:

- If no PRD/spec/brief exists, stop and route to `prd-writer`; do not invent the
  document being reviewed.
- Do not mark a PRD ready when the problem, primary user, decision, success
  metric, or non-goals are missing. Return `DONE_WITH_CONCERNS` or
  `NEEDS_CONTEXT`.
- Do not silently rewrite the PRD unless the user explicitly asks for edits.
  Default output is a findings artifact with suggested wording and patch-ready
  changes.
- Do not approve legal, compliance, security, accessibility, or data-governance
  posture. Identify risks and escalation owners.

Evidence requirements:

- Inspect the supplied PRD and any referenced research, analytics, tickets,
  designs, support notes, prior PRDs, meeting notes, or decision logs.
- Every finding must cite a section, heading, line, source path, or explicit
  absence. Unsupported criticism is not a finding.
- Separate facts verified in source material from reviewer judgment. Mark weak
  evidence as `[ASSUMPTION]`, `[NEEDS EVIDENCE]`, or `[NEEDS OWNER]`.
- For standard/deep reviews, score the PRD against problem clarity, user
  specificity, evidence quality, goals/non-goals, requirements testability,
  success metrics, tradeoffs, rollout, risks, and decision readiness.

Artifact paths and naming:

- Write review artifacts to the first existing parent, creating the final
  directory if needed: `workspace/product/reviews/` then `product/reviews/`.
- Filename: `YYYYMMDD-HHMMSS-prd-review-<slug>.md`.
- If the user only wants inline feedback, return the same structure in chat and
  set `Artifact: none - returned inline`.

## Workflow

1. **Classify mode.**
   - `quick`: narrow review of one section or one approval concern.
   - `standard`: full PRD quality review and required-change list.
   - `deep`: high-risk, regulated, multi-team, executive, or launch-critical PRD.
   - `edit-pass`: user asked for direct revisions in addition to findings.
2. **Identify the review target.** Resolve the source PRD path or supplied text,
   title, owner, status, audience, and the decision the review should unblock.
   If the target is ambiguous, ask once with `AskUserQuestion` when available.
3. **Build an evidence pack.** Read the PRD, referenced artifacts, nearby docs,
   analytics, customer evidence, support/sales notes, and prior decisions. Record
   what was inspected and what was missing.
4. **Run the quality gate.** Check for the five readiness blockers first:
   problem, user, decision, success metric, non-goals. If any are absent, lead
   with those blockers before lower-severity polish.
5. **Review section by section.** Evaluate context, problem, goals, users, use
   cases, requirements, metrics, tradeoffs, risks, rollout, open questions, and
   appendices. Assign severity:
   - `P0`: blocks approval or could cause the team to build the wrong thing.
   - `P1`: material ambiguity, missing evidence, or unowned risk.
   - `P2`: useful improvement that changes execution quality.
   - `P3`: clarity, wording, or hygiene.
6. **Recommend the path to approval.** State the smallest set of changes that
   would move the PRD to the next review state, plus owner/date suggestions when
   evidence supports them.
7. **Write or return the artifact.** Save the review when durable output was
   requested or the review is substantial. Re-read any file written and ensure
   every finding has evidence and a fix.

## Output Format

Use this artifact structure:

```markdown
# PRD Review: <prd title>

**Source PRD:** <path or supplied text>
**Review mode:** quick | standard | deep | edit-pass
**Decision being unblocked:** <decision>
**Overall verdict:** Ready | Ready with changes | Not ready | Needs context
**Confidence:** High | Medium | Low

## Evidence Used
## Readiness Gate
| Gate | Status | Evidence | Required fix |
| --- | --- | --- | --- |
| Problem | Pass/Fail/Partial | <citation> | <fix> |
| User | Pass/Fail/Partial | <citation> | <fix> |
| Decision | Pass/Fail/Partial | <citation> | <fix> |
| Success metric | Pass/Fail/Partial | <citation> | <fix> |
| Non-goals | Pass/Fail/Partial | <citation> | <fix> |

## Findings
| ID | Severity | Section | Evidence | Why it matters | Recommended fix |
| --- | --- | --- | --- | --- | --- |

## Quality Bar Scorecard
## Required Changes Before Approval
## Suggested Edits
## Open Questions
## Approval Path
```

Close every run with:

```text
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Artifact: <path or "none - returned inline">
Verdict: Ready | Ready with changes | Not ready | Needs context
Required changes: <count>
Evidence used: <source list>
Residual risk: <none or concise list>
Next skill: prd-writer | prd-to-plan | roadmap | prioritization | none
```

Status meanings:

- `DONE`: review completed, evidence inspected, and no P0/P1 findings remain.
- `DONE_WITH_CONCERNS`: review completed but approval is qualified by missing
  evidence, unresolved P0/P1 findings, or specialist escalation.
- `BLOCKED`: source PRD or required files are inaccessible.
- `NEEDS_CONTEXT`: the review target, audience, or approval decision is unclear
  after one clarification pass.

## Anti-Patterns

- Reviewing a PRD that has not been provided.
- Treating grammar cleanup as product review.
- Saying "looks good" without section-level evidence.
- Rewriting the PRD without preserving the critique and rationale.
- Inventing user evidence, metrics, owners, dates, or regulatory conclusions.
- Marking approval-ready while P0/P1 findings remain open.
- Letting the existing solution frame hide a weak or missing problem statement.
