## Input
We're a product org of 4 PMs, each owning a squad. The company sets annual OKRs at the exec level. We run quarterly planning cycles. Problem: quarterly planning produces a priority list, but by week 6 of the quarter the list is already outdated and nobody updates it. PMs have no structured way to input their discovery findings into quarterly planning. There's also no mid-quarter review — problems pile up until the next quarterly cycle.

Team size: 4 PMs, ~16 engineers across 4 squads, 2 designers.
Planning horizon: annual goals + quarterly cycles + 2-week sprints.
Company planning calendar: company OKRs finalized by Dec 1 for the next year; quarterly planning starts 3 weeks before each quarter.

## Expected output
Planning levels and their purposes:

Annual:
- Purpose: set product strategy direction aligned to company OKRs
- Outputs: product team annual goals (not a roadmap — a direction and bet list)
- Participants: CPO + 4 PMs
- Timeline: November, before company OKR finalization

Quarterly:
- Purpose: translate annual goals into committed quarterly priorities, accounting for capacity and discovery findings
- Outputs: quarterly OKRs per squad + rough roadmap with top 3 priorities per squad
- Participants: 4 PMs + engineering leads (capacity input) + CPO (final approval)
- Timeline: 3 weeks before quarter start; 2 working sessions of 2 hours each

Cycle (6-week):
- Purpose: mid-quarter review — not a full re-plan but a go/no-go on current priorities
- Outputs: updated risk log, any scope changes documented with rationale
- Participants: 4 PMs + CPO (30-minute sync)
- Timeline: week 6 of each quarter

Sprint (2-week):
- Purpose: execution planning within committed quarterly priorities
- Outputs: sprint goal, sprint backlog, dependency flags
- Participants: PM + squad
- Timeline: sprint start; 1-2 hour session

Planning cascade design:

Annual goals → Quarterly OKR drafts:
At quarterly planning start, each PM presents: what we learned in discovery last quarter (3 slides max), what's at risk from annual goals, and what they recommend for next quarter. CPO uses this to finalize priorities before OKRs are written.

Quarterly OKRs → Sprint goals:
Each sprint's goal must map to one quarterly OKR key result. If a sprint contains work that doesn't map to a current OKR, it gets flagged — either the OKR is wrong or the sprint work is off-strategy.

Key planning events calendar (annual rhythm):
- Nov: annual direction session
- Dec 1: company OKRs finalized
- Week 3 before Q1: quarterly planning for Q1
- Week 6 of Q1: mid-quarter review
- Week 3 before Q2: quarterly planning for Q2
(repeat pattern)

Strategy change protocol:
Mid-quarter scope changes require: PM documents the change with rationale in the quarterly plan doc, notifies CPO async, and flags any OKR key result that is now at risk. No undocumented scope changes — this is the root cause of the "outdated list" problem.

Emergency priority change (unplanned): CPO approval required; PM updates the quarterly plan doc within 24 hours.

Documentation artifacts per level:
- Annual: product strategy brief (1-pager per PM with goals and bets)
- Quarterly: OKR doc + roadmap slide per squad (3 priorities max, confidence level per priority)
- Cycle (mid-quarter review): risk log update (1 page, shared async before the sync)
- Sprint: sprint goal statement + backlog in Jira/Linear; sprint review notes

Known failure modes:
- Quarterly priorities outdated by week 6: fixed by the mid-quarter review (week 6 cycle)
- PMs have no input channel into quarterly planning: fixed by discovery brief presentation at planning start
- Scope changes accumulate silently: fixed by the documentation requirement for any mid-quarter change
