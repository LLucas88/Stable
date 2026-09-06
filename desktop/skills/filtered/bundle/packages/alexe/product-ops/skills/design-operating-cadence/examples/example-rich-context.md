## Input
We're a product team of 3 PMs, 8 engineers across 2 squads, and 1 designer. We work in 2-week sprints. We report to a CPO who wants a weekly status update. Our current state is messy: we have a daily standup that most people skip, a biweekly sprint review that's usually just a demo with no decisions made, and no regular retrospective. PMs have separate 1:1s with engineering leads but no shared forum for cross-squad alignment. The CPO's status update is currently a Slack message we write from memory each Friday.

Key pain points:
- Cross-squad dependency issues discovered late
- Sprint reviews don't produce decisions, just observations
- No consistent retrospective practice, so we repeat the same problems
- CPO status update is a last-minute scramble

Planning horizon: quarterly OKRs + 2-week sprints.

## Expected output
Meeting cadence design:

Daily standup (async, per squad):
Frequency: daily
Format: async written update in a squad Slack channel by 10am (replaces meeting; skip the standup that no one attends)
Goal: surface blockers for the PM to resolve that day
Duration: no meeting; PM reads updates and follows up 1:1 or with a 15-min sync only when there's a blocker

Weekly cross-squad sync (PM + engineering leads):
Frequency: weekly, 30 minutes
Attendees: 3 PMs, 2 engineering leads
Goal: surface cross-squad dependencies, share status on OKR progress, escalate blockers that need CPO visibility
Output: notes in shared doc; CPO status update drafted during this meeting

Sprint review (biweekly, per squad):
Frequency: end of each sprint
Duration: 45 minutes
Attendees: squad + PM + stakeholder (CPO joins once per month)
Goal: demo completed work, review sprint metric, make explicit decisions (continue/pivot/drop)
Change from current: end every review with a "decisions made this sprint" section; minimum one decision documented

Retrospective (biweekly, per squad):
Frequency: after each sprint review, same day
Duration: 30 minutes
Format: rotate facilitator, use a simple format (what slowed us down, what worked, one thing to change)
Owner: PM to ensure it happens; engineering lead to run it

Quarterly planning:
Frequency: once per quarter, 2 weeks before new quarter starts
Duration: half-day session per squad + 1 joint session
Goal: review OKR progress, draft next quarter's priorities, surface capacity constraints
Output: next quarter's OKR draft + rough roadmap

CPO status update:
Format: written, produced in the weekly cross-squad sync
Content: 3 bullets per squad: what shipped, what's at risk, what needs a decision
Delivery: async Slack post every Friday before 5pm; CPO responds async

Planning cycle design:
Quarter: OKRs set with CPO; product team owns drafts
Sprint: backlog groomed 2 days before sprint start; PMs own grooming with input from eng leads
Mid-quarter: 15-minute check-in on OKR progress at week 6 of the quarter

Decision-making framework:
- Scope decisions (what's in the sprint): PM decides
- Architecture decisions: engineering lead decides, PM informed
- Scope changes that affect OKRs: PM escalates to CPO; default answer is no without a trade-off

Async communication norms:
- Standup updates in squad Slack channel, tagged #standup
- Decisions from sprint reviews documented in Confluence within 24h
- Cross-squad questions in #product-engineering channel, not DMs

Known failure modes and mitigations:
- CPO status update gets skipped if there's no forcing function: fix by making it the output of the cross-squad sync, not a separate task
- Sprint review without decisions: add "decisions made" as a standing agenda item with a named owner
- Retrospective skipped when the sprint was hard: these are the most important ones to run. Protect the time.
