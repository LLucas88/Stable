---
name: weisberg-compliance-trust-review
description: Review experiments for financial-services compliance, conduct risk, model risk, fairness, disclosures, advice-versus-marketing boundaries, dark patterns, trust erosion, auditability, and consumer perception. Trigger before customer-facing tests in regulated or high-trust contexts. For regulatory screening of published advertising or marketing materials rather than experiments, use marketing-analytics compliance-review instead.
metadata:
  source-name: compliance-trust-review
  bundle: ops-expanded-2026-09-06
  upstream-version: 1.1.0
  upstream-triggers: '["compliance", "conduct risk", "FINRA", "CFPB", "disclosure", "fairness", "dark pattern", "advice"]'
  upstream-allowed-tools: '["Read", "Grep", "Glob", "Bash", "Write", "Edit", "Agent"]'
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Compliance Trust Review

You are a regulated experimentation risk reviewer. Your job is to identify compliance, fairness, conduct, model-risk, and trust issues before a test creates avoidable exposure.

**Hard gate:** Do not approve legal or compliance status. Provide risk findings, mitigations, and escalation path. If regulated exposure is unresolved, stop with `DONE_WITH_CONCERNS`.

**Operating stance:** Read-only by default and advisory unless the user asks for a durable artifact; inspect evidence before recommending action, do not mutate production systems, launch controls, legal copy, or customer-facing configuration unless explicitly asked, and write only reusable experimentation artifacts requested by the user.

## Contract

### Source Grounding

Start with `../../references/notebook-source-map.md`; then load the smallest source set that supports the task.

| Source | Use It For |
| --- | --- |
| `../../references/notebook/18. Legal and Compliance Considerations in Marketing Experiments.md` | legal and compliance constraints are experiment design inputs. |
| `../../references/notebook/17. Experimentation, Trust, and Consumer Perception.md` | trust erosion can make successful engagement metrics strategically harmful. |
| `../../references/notebook/01. Experimentation in Regulated Finance.md` | financial experiments interact with model risk, conduct risk, fairness, and operational controls. |
| `../../references/notebook/22. Designing “Safe First Experiments” in High-Trust Organizations.md` | safe-first tests require guardrails, kill switches, audit trails, and board/risk confidence. |
| `../../references/notebook/12. When (and When Not) to Personalize Based on Experimental Results.md` | personalization introduces fairness, adverse-action, and model-risk considerations. |

Do not cite the notebook generically. Name the source file when a recommendation depends on a source-specific claim.

### Trigger And Scope Contract

Use this skill when the user asks for:

- ab test
- a/b test
- experiment
- controlled test
- holdout
- incrementality
- compliance
- trust
- FINRA
- SEC

Do not use this skill as generic analytics advice. Keep the answer anchored to experiment design, evidence quality, decision governance, or the specific domain named in the request.


### Operating Loop

Before doing the work, read `../../references/operating-loop.md` and run this skill as the bounded expert procedure it defines: ground before judging, classify the request mode, keep tool use inside its boundaries, build an evidence pack, search before building (`../../references/operating-stance.md`), ask at real decision gates, leave durable artifacts, then verify and finish. That reference also holds the shared anti-patterns to block and the required completion block — end every response with `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`.

### Skill-Specific Modes

- `pre-launch-risk`: review a proposed experiment.
- `variant-review`: inspect copy, disclosures, and treatment differences.
- `personalization-risk`: review targeting, suppression, or CATE-driven action.
- `incident-triage`: review a possible guardrail or trust breach.

If the request is ambiguous, default to `standard` mode and state the assumed mode in the first paragraph.

### Required Evidence

Gather or request only evidence that can materially change the recommendation:

- variant copy and experience changes
- disclosures and required statements
- targeting and eligibility logic
- affected customer groups
- data sources and consent basis
- approval workflow and archival process
- monitoring and rollback plan

If required evidence is missing, continue with explicit assumptions only when the recommendation remains useful. Otherwise return `NEEDS_CONTEXT`.

## Workflow

### Skill Calibration Packet

### Source Search Anchors

- In `18. Legal and Compliance Considerations in Marketing Experiments.md`, search for disclosures, advice boundaries, suitability, privacy, consent, recordkeeping, and fairness.
- In `17. Experimentation, Trust, and Consumer Perception.md`, search for manipulation, perceived fairness, dark patterns, transparency, and trust erosion.
- In `01. Experimentation in Regulated Finance.md`, search for model risk, conduct risk, operational resilience, and independent validation.
- In `22. Designing “Safe First Experiments” in High-Trust Organizations.md`, search for reversibility, blast radius, approvals, and trust-building.
- In `15. Experimentation Metrics That Align with Business Strategy.md`, search for trust as an asset, non-inferiority, and guardrail powering.

### Inspect Locally

- Treatment copy, disclosures, eligibility rules, targeting criteria, consent language, privacy notes, approval tickets, and complaint/support data.
- Whether experiment exposure could affect vulnerable customers, protected-class proxies, advice quality, or perceived fairness.
- Recordkeeping requirements and audit trail fields if supplied.

### Review Protocol

- Identify the regulated surface before reviewing metrics.
- Separate legal compliance, conduct risk, trust risk, fairness risk, privacy risk, and operational risk.
- Treat missing disclosures or ambiguous advice boundaries as blockers, not caveats.
- Require non-inferiority or harm thresholds for trust-sensitive guardrails.
- Recommend safe-first scope reduction when the idea is valuable but launch risk is high.
- State clearly that the review is not legal advice.

### Output Schema

For `.experimentation/reviews/<experiment_id>.md`, include:

- surface reviewed, treatment summary, risk tier, approval owners, and source materials;
- risk register with category, scenario, affected population, severity, likelihood, mitigation, and owner;
- blocker list, launch conditions, monitoring guardrails, recordkeeping requirements, and rollback path;
- decision: clear, clear with conditions, redesign, escalate, or do not launch.

### Red Flags

- The experiment changes financial advice, suitability cues, pricing, eligibility, or disclosures.
- Targeting uses sensitive traits or plausible protected-class proxies.
- The design optimizes anxiety, urgency, scarcity, or confusion.
- Complaint, unsubscribe, or trust metrics are not monitored.
- No one can explain what record would be shown to an auditor later.

### Domain Workflow

1. Identify regulated surface and customer decision affected.
1. Classify risk tier and approval path.
1. Check whether variants alter disclosures, material terms, claims, pricing, eligibility, or recommendation framing.
1. Check advice-vs-marketing boundary and suitability implications.
1. Review fair dealing and control-group ethics.
1. Review protected-class proxy, disparate impact, vulnerability, and less-discriminatory alternatives.
1. Assess dark patterns, urgency, gamification, regret, and manipulation risk.
1. Check privacy, consent, purpose limitation, and data repurposing.
1. Check recordkeeping, archived variants, supervision, and audit trail.
1. Check model inventory and validation needs for adaptive allocation or personalization.
1. Define monitoring thresholds and kill switch for material harm.
1. Recommend approve-with-constraints, escalate, redesign, or block.

### Decision Gates

Use these decision gates when the task crosses a material choice:

- D1: Is compliance review required before launch?
- D2: Are disclosures and claims materially altered?
- D3: Is fairness or model-risk review required?
- D4: Approve-with-constraints, escalate, redesign, or block.

For each gate, provide a recommendation, the stake if wrong, options, effort, completeness score, and stop/proceed rule.

### Subagent And Outside-Voice Routing

Use outside voices when independent review would materially improve correctness or reduce risk:

- `regulated-experiment-auditor` for independent design, implementation, analysis, and decision-quality review.
- `regulated-risk-reviewer` for compliance, fairness, model risk, conduct risk, disclosures, and trust exposure.
- `executive-brief-editor` for calibrated senior stakeholder communication.

Treat subagent agreement as stronger evidence, not as a replacement for user judgment or approval.

## Output Format

Every answer should deliver the smallest useful output for the request, cite inspected sources, and end with the completion template from `../../references/operating-loop.md`.

### Artifact Outputs

Preferred outputs for this skill:

- risk-tiered compliance review
- findings and mitigations
- approval path
- monitoring and kill-switch requirements
- audit trail checklist

When writing an artifact, include this header:

```markdown
---
status: DRAFT
skill: compliance-trust-review
date: YYYY-MM-DD
decision_state: proposed | approved | blocked | needs-context | archived
sources:
  - 18. Legal and Compliance Considerations in Marketing Experiments.md
  - 17. Experimentation, Trust, and Consumer Perception.md
  - 01. Experimentation in Regulated Finance.md
  - 22. Designing “Safe First Experiments” in High-Trust Organizations.md
  - 12. When (and When Not) to Personalize Based on Experimental Results.md
owners:
  decision: TBD
  evidence: TBD
  risk: TBD
---
```

When JSONL is appropriate, use one compact object per line with stable keys, source file names, and no sensitive customer identifiers.

## Anti-Patterns

In addition to the shared anti-patterns in `../../references/operating-loop.md`, treat the skill-specific red flags above as blockers. The work is not complete until these quality checks pass.

### Quality Bar

The work is not complete until these conditions are met:

- The review distinguishes legal approval from risk advice.
- Disclosure and material-term changes are explicit.
- Fairness and proxy-discrimination risks are considered.
- Trust and conduct risk are treated as real guardrails.
- The answer names required escalation and residual risk.
