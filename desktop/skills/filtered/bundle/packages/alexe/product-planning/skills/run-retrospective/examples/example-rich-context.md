## Input
We just finished a 10-week project to rebuild our checkout flow. We shipped on time but it was painful. Here's what I know going in:

- We missed 2 sprint reviews because engineering wasn't ready and the meetings happened anyway without anything to show
- QA was done in the last 3 days and found 11 bugs, 3 of which were regressions in the old checkout flow
- The designer left the project 3 weeks before launch for another team and nobody filled the role — PM and eng made design decisions ad hoc
- Metrics: checkout conversion is up 4% (vs. 6% hypothesis), payment error rate is down 60% (better than expected)
- The team is 4 people: 2 engineers, 1 designer (part-time from week 8), 1 PM (me)
- One prior retro action that was supposed to happen this cycle: "improve QA process" — not acted on

Previous retro action status: "Improve QA process" — not completed. No owner was assigned.

## Expected output
Scope and context summary:
Checkout rebuild — 10 weeks. Shipped on time. Mixed outcome: conversion uplift below hypothesis but payment errors significantly better. Process was rough throughout.

Format selected: Start / Stop / Continue
Rationale: The team has clear behavioral patterns to address, and this format makes desired behavior changes explicit. A timeline retro would be better for root cause depth, but the core issues are already surfaced.

---

Key observations:

**What went wrong:**
- Designer leaving mid-project with no replacement plan created scope ambiguity in weeks 7–9. PM and engineers made design decisions they weren't equipped to make. Result: 3 visual regression bugs in QA.
- Sprint reviews happened on empty sprints rather than being cancelled or rescheduled. These cost 30+ minutes each and eroded team trust in the sprint cadence.
- QA was squeezed into 3 days at the end. Regressions suggest the QA scope was unclear until the last sprint. No one owned defining it earlier.
- Previous action item ("improve QA process") had no owner. It wasn't followed up on, so the same QA bottleneck repeated.

**What went well:**
- Engineering estimates were accurate across the project — no major scope explosions
- Payment error reduction exceeded expectations (60% down vs. 30% hypothesis)
- The team communicated blockers early; nothing was hidden for more than a day

---

Prioritized themes:
1. QA process ownership — recurring problem, no owner, needs a fix before next project
2. Design handoff protocol — what happens when the designer leaves mid-project?
3. Sprint review discipline — stop meeting when there's nothing to show

---

Action items:

| Action | Owner | Due |
|--------|-------|-----|
| Define QA owner and entry/exit criteria for each sprint — write one-page process doc | [Engineer 1] | 2 weeks |
| Create design coverage protocol: what decisions require a designer, what PM/eng can make alone | PM | 1 week |
| Update sprint norms: sprint review is cancelled if there are no shippable stories to demo | PM | This week |

Prior action item status:
"Improve QA process" from last retro — not completed, no owner. Carry forward: assigned to [Engineer 1] with explicit deadline above.

---

Learning statement:
We shipped on time but absorbed significant hidden cost in the last 3 weeks. The pattern was consistent: decisions deferred until they became urgent. Next project needs earlier decisions on design coverage and QA scope, not faster heroics at the end.
