## Input
We run Stacks, a project management tool for small creative agencies (5–30 people). We need a design brief for redesigning the client feedback and approval flow.

Current state: clients get an email with a link to review a deliverable (design comp, video cut, copy draft). They can leave comments and mark it "approved" or "needs changes." The flow hasn't been updated since launch 2 years ago.

Problems (from research):
- 6 client interviews: clients say they "lose track of what they've already approved." One client: "I approved version 3 but then got asked to look at version 4 and couldn't tell what changed."
- Agency-side interviews (4 account managers): "Clients approve things and then come back saying they didn't approve that." "We spend 30 min per project per week chasing approvals."
- Analytics: 42% of approval requests get no response within 48 hours. Average time to approval: 5.2 days.
- Support tickets: 18 tickets about "I can't find the previous version" in the last quarter.

Target user: Client reviewer — non-technical, reviews deliverables across 2–5 active projects, checks in a few times per week, often on mobile.

Constraints:
- Technical: must work within existing React frontend. Backend can be extended.
- Business: agency customers on the Growth plan ($49/mo) and above. Free plan users see a simplified version.
- Time: design exploration should take 2 weeks. Engineering build is scoped for the following sprint (3 weeks).
- Brand: Stacks brand is clean, minimal, professional. No playful UI patterns.

Non-goals:
- This brief is not about the agency-side workflow (how agencies upload and send deliverables)
- Not about real-time collaboration on deliverables (that's a separate initiative)
- Not about integrating with external tools (Slack, email) — notification improvements are a separate project

Success criteria:
- Client can identify what changed between versions without asking the agency
- Client approval is recorded with a clear timestamp and version reference
- Time to approval decreases (target: from 5.2 days to under 3 days)
- Reduction in "I didn't approve that" disputes (qualitative signal from account managers)

## Expected output
Problem statement:
Clients reviewing deliverables in Stacks cannot easily track what they've approved, compare versions, or understand what changed between revisions. This leads to delayed approvals (5.2 days average, 42% unresponsive within 48 hours), disputes about what was approved, and significant account management overhead (30 min per project per week chasing approvals).

Target user and context:
Client reviewer. Non-technical, managing feedback across 2–5 active projects. Reviews deliverables a few times per week, often on mobile. Does not live in the tool — drops in when prompted. Needs clarity and speed, not power features.

Desired outcome:
Clients can confidently review, compare versions, and approve deliverables without confusion about what changed or what they previously approved. Agencies spend less time chasing approvals and resolving disputes.

Constraints:
- Technical: React frontend, backend extensible
- Business: Full experience for Growth plan ($49/mo) and above; simplified version for Free plan
- Time: 2-week design exploration, followed by 3-week engineering sprint
- Brand: Clean, minimal, professional. No playful or decorative patterns.

Non-goals:
- Agency-side upload and delivery workflow (out of scope)
- Real-time collaboration on deliverables (separate initiative)
- External tool integrations for notifications (separate project)

Success criteria:
- Version comparison is available without leaving the review screen
- Approval records include timestamp and version reference
- Time to approval decreases from 5.2 days toward under 3 days
- Account managers report fewer "I didn't approve that" disputes within 1 quarter

Supporting materials:
- 6 client interviews: key theme is version confusion and lost approval context
- Client quote: "I approved version 3 but then got asked to look at version 4 and couldn't tell what changed"
- 4 account manager interviews: approval chasing as time sink, trust disputes
- Analytics: 42% of approval requests unresponded within 48 hours, 5.2-day average approval time
- Support tickets: 18 tickets about finding previous versions (last quarter)

Open questions for the designer to explore:
- How should version comparison work for different deliverable types (images vs. documents vs. video)?
- Should the approval action include a required summary of what the client reviewed (to reduce disputes)?
- How does the experience change on mobile, where most clients check in?
- Should the review screen show approval history for the project (not just the current deliverable)?
