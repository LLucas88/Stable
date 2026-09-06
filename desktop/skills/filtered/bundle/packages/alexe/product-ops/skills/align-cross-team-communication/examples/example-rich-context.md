## Input
We have three squads — Growth, Core Product, and Platform — each with a PM and engineering team. We're shipping more frequently now (moved from monthly to weekly releases) and communication is breaking down. The specific problems:

1. Growth squad sometimes ships experiments that touch Core Product's UI without telling them. Core PM finds out when users complain.
2. Platform squad makes infrastructure changes that affect Growth's experiment setup — no heads up before the change, so experiments break unexpectedly.
3. Stakeholders (CEO, Head of Sales) are getting status updates from individual PMs in different formats — inconsistent and sometimes contradictory.
4. Engineering leads don't know what other squads are building, so there's duplicate work — both Core and Growth built a user segmentation utility independently.

Current setup: each squad has its own Slack channel; there's a #product channel that's mostly announcements; no cross-squad PM sync.

## Expected output
Communication flow map (who needs what, when, how):

Growth PM needs from Core PM:
- Any UI changes in areas Growth experiments run in, at least 1 sprint before they ship
- Format: brief Slack message in #cross-squad-pm with affected surface and timeline

Core PM needs from Growth PM:
- Any experiments that touch Core's owned surfaces, before experiment launch
- Format: experiment brief linked in #cross-squad-pm at experiment kickoff

Platform PM needs from Growth and Core:
- Upcoming experiments or features that will depend on new platform capabilities
- Format: added to Platform's roadmap review session (biweekly)

Growth and Core PMs need from Platform:
- Infrastructure changes that could affect experiment tooling or shared services, at least 1 week in advance
- Format: #platform-changes channel with clear "affects: [growth/core]" tag

Stakeholders (CEO, Head of Sales):
- Single weekly status update covering all three squads, not individual squad updates
- Format: structured weekly digest in a shared Notion page; PM lead rotates ownership

Current breakdown points:
- No shared visibility between squads before shipping — squads operate as if they're independent products
- No infrastructure change communication channel — Platform makes changes without broadcast
- Status updates are squad-level, not product-level — stakeholders reconcile them themselves

Recommended communication channels by type:

Synchronous:
- Weekly cross-squad PM sync (30 min, all three PMs): dependency review, shared decisions, status input for weekly digest
- Biweekly Platform roadmap review (Platform PM + Growth + Core engineering leads): upcoming platform changes, dependency surfacing

Async:
- #cross-squad-pm (Slack): daily home for inter-squad coordination, dependency flags, decisions
- #platform-changes (Slack): Platform announces infrastructure changes with affected squads tagged
- Weekly product digest (Notion): single source of truth for stakeholder status, owned by PM lead rotation

Decision communication norms:
- Decisions that affect another squad's surface must be posted in #cross-squad-pm before implementation
- Decisions that affect product direction or scope go to a weekly cross-squad sync for alignment
- Escalation path: if a cross-squad conflict isn't resolved in the sync, it escalates to CPO within 24 hours (not left to fester)

Status update and escalation protocol:
- Weekly digest published every Friday by 4pm
- If a squad is at risk on a commitment, the PM flags it in the weekly cross-squad sync (not in the digest for the first time)
- Escalation trigger: if a risk affects a stakeholder commitment (sales deal, public deadline), PM escalates to CPO same day

Feedback loop design from engineering to product:
- Each engineering lead has a 15-minute slot in the weekly cross-squad sync to raise cross-squad technical concerns
- Infrastructure dependency feedback: Platform engineering raises in #cross-squad-pm with @PM handle
- Retrospective: each squad runs a monthly retro; one item from each retro is shared at the next quarterly planning session
