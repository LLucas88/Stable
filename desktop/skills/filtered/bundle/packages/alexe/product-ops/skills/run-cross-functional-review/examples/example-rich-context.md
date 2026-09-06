## Input
We need to run a cross-functional review for a decision to deprecate our legacy API (v1). The API is used by ~40 external customers. We want to give a 6-month sunset period and migrate them to API v2. The decision affects engineering (migration work), CS (customer communication), sales (deals that reference API v1 in contracts), and legal (contract terms for sunset).

The decision has been delayed 3 months because every time we bring it up, CS raises concerns about customer impact and the meeting ends without a decision. We need a structured review that produces a decision, not another alignment meeting.

Decision timeline: we need a decision in the next 2 weeks.

Prior conflict: CS lead believes we need 12 months, not 6. Engineering believes 6 is enough. CPO hasn't weighed in yet.

## Expected output
Review scope and decision to be made:
Should we proceed with API v1 deprecation with a 6-month sunset period, or a different timeline? The output must be a documented go/no-go decision and, if go, a confirmed timeline.

Participant list with roles:

Decide:
- CPO (final call if CS and engineering can't agree)
- PM (owns the decision and facilitates)

Advise:
- Engineering lead (API migration complexity and timeline feasibility)
- CS lead (customer impact assessment and communication plan)
- Legal (contract review — any v1 API commitments in active contracts)
- Sales lead (whether any active deals reference v1 API commitments)

Inform (post-decision):
- Customer-facing teams (CS reps, AEs)
- External customers (via CS)

Pre-read structure and content:
The pre-read must be distributed 48 hours before the session. It must contain:

1. Problem statement: why deprecating v1 is necessary now (technical debt cost, maintenance load, security risk — 1 paragraph from engineering)
2. Customer impact data: how many customers use v1 API, their usage volume, which customers are on active contracts — from CS and sales
3. Migration path: what v2 offers that v1 doesn't, what breaking changes exist, what the migration effort looks like for customers — from engineering
4. Proposed timeline: 6-month sunset with key milestones (announcement, migration support window, hard cutoff)
5. CS's concern formalized: what specific customer situations make 6 months insufficient? (CS lead to write this section, not PM)
6. Legal check: any contracts that explicitly commit to v1 API availability? Yes/no + list

Session agenda and facilitation guide:

00:00-00:05: PM states the decision to be made and the time constraint. One sentence per person confirming they read the pre-read.
00:05-00:20: Engineering presents the migration path (10 min). CS presents specific customer cases at risk (5 min).
00:20-00:35: Legal presents any contract blockers (5 min). Open discussion on timeline (10 min).
00:35-00:45: CPO makes the call or requests one clarification. PM documents the decision in real time.
00:45-00:50: Action items assigned with owners and dates.

Facilitation note: if CS raises a concern that wasn't in the pre-read, pause and ask: "Is this a new data point or a re-statement of the pre-read concern?" If new data — pause the decision and schedule a follow-up with that data. If re-statement — acknowledge it and proceed.

Decision documentation template:
- Decision: [proceed / do not proceed / proceed with modified timeline]
- Timeline agreed: [X months from announcement date]
- Conditions (if any): [e.g., "proceed only if legal confirms no v1 contract obligations"]
- Concerns noted (non-blocking): [CS's top 2 customer concerns, acknowledged and tracked]
- Action items: [name, task, date]
- Next communication: [who tells external customers, and when]

Concern and blocker escalation path:
- If legal finds a contract obligation: decision paused; legal returns with options within 5 business days
- If CS raises a new customer case not in the pre-read: PM adds it to the risk log; decision proceeds unless it changes the contract situation
- If engineering and CS timelines remain irreconcilable after the session: CPO makes the call with a clear rationale documented

Action item format:
[Owner]: [task] by [date]
Example: CS lead: draft customer communication plan for 6-month sunset by [date + 5 days]
