## Input
We run Breezy, a B2B SaaS tool for managing employee leave requests. The manager approval flow has a 38% drop-off rate — managers open the approval request but don't complete it.

The flow: manager gets email notification → clicks link → lands on approval page → reviews leave details → approves or rejects → done.

Analytics data:
- 94% of managers open the email notification
- 88% click through to the approval page
- 62% of those who land on the approval page complete the approval/rejection
- Average time on approval page: 2m 45s (expected: under 30s for a simple approve/reject)

Support tickets (last 90 days, 47 tickets tagged "approval"):
- "I approved it but it still shows as pending" (12 tickets)
- "I can't find where to add a comment before approving" (9 tickets)
- "The page doesn't show who's covering while the person is out" (8 tickets)
- "I accidentally rejected instead of approved" (7 tickets)
- "It asked me to log in again and I lost the page" (6 tickets)
- Other (5 tickets)

One prior usability test (4 months ago, 3 sessions) found that the approve/reject buttons were too close together and looked similar.

## Expected output
Flow map with quality assessment:

Step 1: Email notification
- Quality: Good
- Evidence: 94% open rate, no support tickets about email content
- Issues: None observed

Step 2: Click-through to approval page
- Quality: Good
- Evidence: 88% click-through from opened emails
- Issues: 6 tickets about re-authentication after clicking link (session expiry forces re-login, users lose context)

Step 3: Review leave details on approval page
- Quality: Poor
- Evidence: 2m 45s average time (expected <30s). 8 tickets about missing coverage information.
- Issues: Page does not show who covers during the leave. Managers may be leaving the page to check this information elsewhere, inflating time-on-page.

Step 4: Approve or reject
- Quality: Poor
- Evidence: 62% completion rate. 12 tickets about "approved but still pending." 7 tickets about accidental rejection. Prior usability test flagged button proximity and similarity.
- Issues: (1) Approve/reject buttons are too similar and too close — accidental rejection risk. (2) Status feedback after action is unclear — managers don't trust the action went through. (3) No comment field is visible before the action (9 tickets).

Friction points by severity:

Critical:
- Unclear confirmation after approve/reject — 12 tickets about "approved but still pending" suggests the UI does not clearly confirm the action was recorded. This undermines trust in the tool.

Major:
- Accidental rejection due to button design — 7 tickets, confirmed by prior usability test. Approve/reject buttons need visual differentiation and spacing.
- Missing coverage information — 8 tickets. Managers need to see who covers before they can confidently approve. This likely drives the high time-on-page.
- Hidden comment field — 9 tickets. Managers want to add context but can't find where.

Minor:
- Re-authentication on click-through — 6 tickets. Session expiry forces re-login, causing some managers to abandon the flow.

Quick wins:
- Add a clear success confirmation state after approve/reject (animation, status change, "Done" message)
- Increase spacing between approve/reject buttons, use distinct colors (green/red)
- Show the comment field by default above the action buttons

Structural improvements:
- Add coverage/delegate information to the approval page (requires integration with team calendar or org chart)
- Fix session handling so email deep links don't require re-authentication

Metrics impact estimation (qualitative):
- Fixing the confirmation state and button design could recover a significant portion of the 38% drop-off, since confusion about whether the action worked and accidental rejection are top ticket drivers
- Adding coverage info may reduce time-on-page substantially

Confidence level:
Evidence-based — grounded in analytics data, 47 support tickets, and one prior usability study
