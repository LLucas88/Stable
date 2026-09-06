---
name: alexe-run-retrospective
description: Structure and facilitate a product or delivery retrospective to extract learning and improve team practices. Use this skill when a team needs to reflect on a completed cycle, launch, or experiment and turn observations into action.
metadata:
  source-name: run-retrospective
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Run Retrospective

## Purpose
Help teams run structured retrospectives that produce honest reflection, shared learning, and concrete improvement actions — not just feel-good discussions.

## Skill type
Conceptual skill

## Use this skill when
- A sprint, quarter, launch, or experiment has completed and a retro is needed
- A team retro produces low-value conversations and no follow-through
- A post-mortem is needed after a failure or near-miss
- A structured review is needed before starting the next planning cycle

## Do not use this skill when
- The goal is ongoing performance monitoring (use detect-performance-signals)
- The goal is stakeholder communication about results (use communicate-decisions-tradeoffs)

## Required inputs
- Event or period being reflected on (sprint, launch, quarter, experiment)
- Team involved

## Optional inputs
- Prior retro actions and their status
- Relevant metrics or outcome data
- Stakeholder feedback
- Known issues going in

## Upstream context
Works best when:
- The period has a clear end point
- Some outcome data or observations are available

## Downstream handoff
Output can feed:
- design-operating-cadence (retro findings → process improvements)
- build-roadmap-prioritization (learning feeds next cycle)

## Instructions
1. Define the scope: what period or event is being reviewed?
2. Gather data before the session: metrics, events, feedback.
3. Select a retro format appropriate to the context:
   - What went well / what didn't / what to change (simple cycles)
   - Start / Stop / Continue (behavior-focused)
   - Timeline retro (complex launches or long cycles)
   - Post-mortem format (failures or incidents)
4. Generate observations across all dimensions.
5. Prioritize themes that most deserve action.
6. Define specific, owned action items (owner + due date).
7. Review prior retro actions before closing.

## Output
Provide:
- Scope and context summary
- Format selected with rationale
- Key observations organized by theme
- Prioritized themes
- Action items with owner and due date
- Prior action item status (if applicable)
- One "learning statement" capturing the most important takeaway

## Risks / caveats
- Retros without action items are venting sessions — always close with owned actions
- Psychological safety is a prerequisite for honest retros — do not skip it
- Review prior retro actions at the start, not the end
