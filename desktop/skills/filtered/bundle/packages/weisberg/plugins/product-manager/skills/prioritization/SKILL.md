---
name: weisberg-prioritization
description: Use this skill when the user wants to rank, score, triage, or compare product opportunities, features, PRD requirements, backlog items, roadmap candidates, or initiatives using RICE, impact-effort, confidence, reach, value, effort, risk, or tradeoff analysis. Trigger on phrases like "prioritize these features", "rank this backlog", "RICE score", "impact effort matrix", "what should we build first", "compare these initiatives", or "stack rank product bets". Do NOT trigger for a time-based roadmap (use roadmap), writing or reviewing one PRD (use prd-writer or prd-review), turning a PRD into an agentic plan (use prd-to-plan), or analyzing experiment results (use ab-testing or experimentation skills).
metadata:
  source-name: prioritization
  bundle: ops-expanded-2026-09-06
  upstream-allowed-tools: '["Read", "Write", "Edit", "Grep", "Glob", "Bash", "AskUserQuestion"]'
  upstream-mutating: 'True'
  upstream-version: 1.0.0
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Product Prioritization

## Contract

Create a transparent prioritization decision artifact for a known set of product
options. The output may be a RICE scorecard, impact-effort matrix, ranked
backlog, or hybrid recommendation, but it must expose the assumptions behind the
ranking instead of laundering opinion through numbers.

Hard gates:

- Do not rank anything until the candidate set and decision criterion are clear.
  Ask once or return `NEEDS_CONTEXT`.
- Do not compute RICE when reach, impact, confidence, or effort are missing.
  Use a scoring template or impact-effort triage and mark gaps.
- Do not hide strategic constraints, dependencies, compliance risk, customer
  harm, or must-do commitments behind a single score.
- Do not treat prioritization as a roadmap. Ranking answers "what first";
  roadmap sequencing adds horizon, capacity, dependencies, and timing.

Evidence requirements:

- Inspect supplied backlog items, PRDs, analytics, customer evidence, support
  themes, sales/GTM input, effort estimates, dependencies, OKRs, and existing
  roadmap constraints.
- Every score must cite evidence or be labeled `[ASSUMPTION]`.
- Confidence must reflect evidence quality, not stakeholder enthusiasm.
- Effort must include engineering, design, data, QA, operations, migration,
  compliance, and launch work when relevant.
- Include a sensitivity check: name which uncertain input could change the top
  recommendation.

Artifact paths and naming:

- Write artifacts to the first existing parent, creating the final directory if
  needed: `workspace/product/prioritization/` then `product/prioritization/`.
- Filename: `YYYYMMDD-HHMMSS-prioritization-<slug>.md`.
- If the user wants only a quick ranking, return inline and set
  `Artifact: none - returned inline`.

## Workflow

1. **Classify mode.**
   - `quick`: impact-effort matrix or top-three recommendation.
   - `standard`: RICE or hybrid scorecard with ranked recommendations.
   - `deep`: portfolio tradeoff with constraints, dependencies, and sensitivity.
   - `refresh`: update an existing scorecard after new evidence.
2. **Define the decision.** Identify candidates, audience, decision criterion,
   time horizon if any, constraints, and whether the output feeds a roadmap,
   PRD, or backlog grooming session. Ask once if candidates or criterion are
   missing.
3. **Choose the method.**
   - Use `RICE` when reach, impact, confidence, and effort are available or can
     be responsibly estimated.
   - Use `Impact-Effort` when evidence is early, candidates are coarse, or the
     user needs triage rather than a numeric stack rank.
   - Use `Hybrid` when must-do obligations, dependencies, risk, or strategic fit
     must override raw score.
4. **Collect scoring inputs.** For each candidate, record reach, impact,
   confidence, effort, strategic fit, risk, dependency, and source evidence.
   Mark missing inputs explicitly.
5. **Score and rank.** Compute RICE as `(Reach * Impact * Confidence) / Effort`
   when valid. For impact-effort, place each item into quick wins, big bets,
   fill-ins, or deprioritize. For hybrid, separate score from override reason.
6. **Run sensitivity and sanity checks.** Identify ties, score cliffs, weak
   assumptions, options dominated by better alternatives, and candidates whose
   rank changes under reasonable input variation.
7. **Recommend action.** Give the ranked list, the top recommendation, what to
   do next, and what evidence would change the decision.
8. **Write and verify.** Save the artifact when durable output was requested or
   the scorecard is substantial. Re-read written files and ensure every score has
   evidence, assumption labels, and a status.

## Output Format

Use this artifact structure:

```markdown
# Prioritization Brief: <scope>

**Decision:** <decision>
**Method:** RICE | Impact-Effort | Hybrid
**Candidate set:** <count and source>
**Recommendation:** <one-line recommendation>
**Confidence:** High | Medium | Low

## Evidence Used
## Scoring Method
## Ranked Recommendation
## Scorecard
| Rank | Candidate | Reach | Impact | Confidence | Effort | Score | Evidence | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |

## Impact-Effort Matrix
## Overrides And Constraints
## Sensitivity Check
## Risks And Tradeoffs
## Next Decisions
```

Close every run with:

```text
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Artifact: <path or "none - returned inline">
Method: RICE | Impact-Effort | Hybrid
Candidates ranked: <count>
Top recommendation: <candidate>
Evidence used: <source list>
Residual risk: <none or concise list>
Next skill: roadmap | prd-writer | prd-review | prd-to-plan | none
```

Status meanings:

- `DONE`: candidate set, method, evidence, scores, ranking, and sensitivity
  check are complete.
- `DONE_WITH_CONCERNS`: ranking is useful but depends on assumed or missing
  evidence, unvalidated effort, or unresolved constraints.
- `BLOCKED`: candidate list or required source files are inaccessible.
- `NEEDS_CONTEXT`: candidates or decision criterion remain unclear after one
  clarification pass.

## Anti-Patterns

- Ranking a hidden or shifting candidate set.
- Using RICE decimals to pretend weak inputs are precise.
- Letting executive preference appear as "confidence" without evidence.
- Ignoring must-do work because it scores poorly.
- Comparing initiatives at different grains without normalization.
- Collapsing dependency, risk, and compliance constraints into one opaque score.
- Treating the ranking as a roadmap without horizon, capacity, or sequencing.
