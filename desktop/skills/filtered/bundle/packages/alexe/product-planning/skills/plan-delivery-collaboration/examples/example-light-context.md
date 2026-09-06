## Input
We're building a new onboarding flow. We have 2 engineers and 1 designer. We want to launch in about 6 weeks. No hard deadline but the sooner the better.

## Expected output
Delivery phases / milestones (draft — requires requirements to finalize):

**Phase 1 — Design and spec (Weeks 1–2)**
- Finalize onboarding flow designs and edge cases
- Engineer review of designs for feasibility issues
- Define what "done" means: what screens, what user actions, what tracking events?
- Output: agreed design, engineering ready to start

**Phase 2 — Build (Weeks 2–5)**
- Frontend implementation of onboarding screens
- Backend: any API endpoints needed (user state, goal selection, etc.)
- Analytics instrumentation (step completion rates must be tracked from day 1)
- Note: overlap with design phase if designer finishes early

**Phase 3 — QA and launch (Week 6)**
- QA pass against acceptance criteria
- Staged rollout or A/B test setup (if comparing to current onboarding)
- Launch

---

Cross-functional dependencies and owners (to confirm):
- Analytics team: confirm event tracking schema before build starts
- Marketing / growth: does new onboarding affect any paid acquisition landing pages?

Risk factors:
- Without requirements defined, this plan is a shell — it cannot be used for actual sprint planning
- 6 weeks is tight if design is not finalized by end of week 1

Open questions before execution starts:
- What is the new onboarding flow? What does it change vs. the current one?
- Is this an A/B test (run alongside old onboarding) or a direct replacement?
- What is the success metric? Without this, there is no way to decide if the launch was good.
- Are there backend changes required, or is this purely frontend?
- Who is responsible for QA?

Delivery confidence:
Low — too many unknowns to commit to this plan. Recommend scoping requirements and design before treating this timeline as real.
