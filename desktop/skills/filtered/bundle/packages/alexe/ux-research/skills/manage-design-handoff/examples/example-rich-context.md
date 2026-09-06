## Input
We're building Relay, a B2B internal communications platform. We're redesigning the thread-based messaging feature. The product team has defined requirements and the design team has completed high-fidelity mockups in Figma. Now we need to hand off to engineering.

Teams involved:
- Product: 1 PM (me), 1 product analyst
- Design: 1 senior product designer, 1 UI designer
- Engineering: 1 tech lead, 4 frontend engineers, 2 backend engineers

Current state:
- PRD is finalized and shared in Notion
- Figma file has 14 screens covering the thread redesign (create thread, reply, notifications, thread list, search within threads)
- Design system components are updated for the new thread UI
- No annotations or interaction specs exist yet in Figma
- Engineering has seen a 10-minute demo of the designs but hasn't reviewed in detail

Known pain points from previous handoffs:
- Engineers often discover edge cases that weren't designed for (empty states, error states, loading states)
- Mobile responsive behavior is usually undefined
- Animation and transition specs are missing, so engineers implement their own interpretation
- Feedback from engineering goes back to design informally via Slack, creating confusion about what's the latest version

## Expected output
Handoff readiness criteria:
Before handoff is considered complete, the following must be done:
1. All screens annotated with interaction specs (tap/click behavior, transitions, hover states)
2. Edge cases designed: empty states, error states, loading states, permission-restricted states
3. Responsive behavior defined for mobile, tablet, and desktop breakpoints
4. Animation and transition specs documented (duration, easing, trigger)
5. Design tokens and component references linked to the design system
6. Accessibility notes added (focus order, screen reader labels, contrast checks)

Required artifacts:
- Figma file with annotated screens (all 14 screens + edge case screens)
- Interaction spec document or Figma annotations covering: navigation flows, state transitions, micro-interactions
- Responsive behavior spec per breakpoint
- Component mapping: which design system components are used, which are new
- Copy doc: all UI text finalized and reviewed
- PRD link (already exists in Notion)

Review and sign-off process:
1. Design walkthrough session (60 min): designer walks engineering through the full flow screen by screen. Engineers ask questions, note gaps.
2. Gap review (2 days): engineering reviews independently and documents questions, missing states, and technical constraints.
3. Gap resolution session (30 min): product + design address engineering's questions. Design commits to filling gaps with a deadline.
4. Final sign-off: tech lead confirms that all questions are resolved and the handoff package is complete. Sign-off recorded in Notion.

Iteration protocol:
- All feedback from engineering to design goes through a dedicated Notion page (not Slack)
- Each feedback item gets a status: open → in discussion → resolved
- Design updates the Figma file and bumps the version note
- Engineers always work from the latest Figma version — no screenshots or exported PNGs
- Weekly 15-min sync during build phase to catch misalignments early

Handoff checklist:
- [ ] All 14 screens annotated with interaction specs
- [ ] Empty, error, and loading states designed for each screen
- [ ] Responsive behavior defined for 3 breakpoints
- [ ] Animation specs documented
- [ ] Design system components mapped (existing vs. new)
- [ ] Copy finalized
- [ ] Accessibility notes added
- [ ] Design walkthrough session completed
- [ ] Engineering gap review completed
- [ ] All open questions resolved
- [ ] Tech lead sign-off recorded

Common failure modes and mitigations:
1. Missing edge cases discovered during build → Mitigation: explicit edge case review as part of readiness criteria, plus gap review period before build starts.
2. Informal feedback via Slack → Mitigation: all feedback routed through Notion with status tracking. Slack discussions must be summarized in Notion.
3. Engineers working from outdated designs → Mitigation: single source of truth in Figma, version notes on every update, no exported assets.
4. Animation interpretation mismatch → Mitigation: animation specs with duration, easing, and reference videos where needed.
