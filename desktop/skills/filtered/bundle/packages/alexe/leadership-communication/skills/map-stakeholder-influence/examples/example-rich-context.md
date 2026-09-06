## Input
I'm a PM leading the initiative to consolidate our two separate mobile apps (iOS and Android) into a single unified app with a new shared codebase. This is a 6-month project with significant user impact and requires engineering alignment across two existing teams.

Stakeholders I'm aware of:
- CTO: owns engineering org, has approved the initiative in principle but hasn't engaged deeply
- VP Engineering: directly manages both mobile engineering teams; skeptical of the timeline
- iOS Engineering Lead: enthusiastic supporter, this was partly their idea
- Android Engineering Lead: concerned about the timeline and worried the iOS stack will "win" over Android
- VP Product: my direct manager; aligned, but stretched thin across 4 product initiatives
- Head of Design: wants to use this as an opportunity to redesign the full UX; hasn't committed bandwidth
- CS Team Lead: worried about user-facing disruption and support volume during the migration
- Finance: approved budget; not involved day-to-day

## Expected output
Stakeholder inventory with role, interest, influence, stance:

| Stakeholder | Role | Interest Level | Influence Level | Current Stance |
|------------|------|---------------|----------------|---------------|
| CTO | Ultimate engineering authority | Low-medium (wants outcome, not process) | Very high | Supporter (passive) |
| VP Engineering | Direct owner of both mobile teams | High (owns the teams and timeline) | High | Skeptic on timeline |
| iOS Engineering Lead | Execution owner — iOS | Very high (their idea, their team) | Medium | Active supporter |
| Android Engineering Lead | Execution owner — Android | Very high (their team's future stack at stake) | Medium | Skeptic / anxious |
| VP Product | My manager; product alignment | Medium (busy, trusts me) | High | Aligned (passive) |
| Head of Design | Design direction and UX | Medium (wants scope expansion) | Medium | Opportunistic — wants to use this for full redesign |
| CS Team Lead | User migration and support impact | High (will own migration support volume) | Low-medium | Concerned |
| Finance | Budget holder | Low (approved, monitoring) | Medium-high (can block if costs overrun) | Neutral/supportive |

---

Influence-interest map:

High influence, high interest: VP Engineering, iOS Engineering Lead, Android Engineering Lead
High influence, low interest: CTO (passive supporter — engage only at milestones and escalations)
Medium influence, high interest: Head of Design, CS Team Lead, VP Product
Medium influence, low interest: Finance

---

Engagement strategy by quadrant:

**High influence, high interest (manage closely):**
- VP Engineering: weekly 1:1. Surface timeline risks early, not at the end of the sprint. The skepticism on timeline is based on real experience — take it seriously.
- iOS Engineering Lead: already aligned; give visibility and co-ownership. Their credibility with the iOS team is an asset — use it.
- Android Engineering Lead: most important stakeholder to manage. The "iOS stack wins" fear is legitimate. Create explicit, documented parity commitments early. Involve them in architecture decisions before they're made, not after.

**High influence, low interest (keep informed):**
- CTO: monthly summary. Flag decisions that require their approval. Don't surface every issue.
- VP Product: keep updated at major milestones; flag anything that might require prioritization trade-offs.

**Medium influence, high interest (manage carefully):**
- Head of Design: the UX redesign is a real risk to scope. Define boundaries early: this project will migrate the stack; design improvements will be scoped separately unless agreed in advance. Don't let the scope expand by default.
- CS Team Lead: involve early in migration planning. They will own user-facing disruption; their input on rollout timing is critical. Underinvestment in CS prep leads to spike in support volume.

**Low influence, low interest (monitor):**
- Finance: quarterly update. Alert if budget trajectory changes.

---

Key blockers and how to address them:

1. Android Engineering Lead's anxiety about stack choice:
   - Address before it becomes resistance: schedule a technical architecture session in week 1 that gives Android Lead co-design authority on the shared stack. Document that the outcome is a decision, not a fait accompli.

2. VP Engineering's timeline skepticism:
   - Don't dismiss. Request a 1-hour risk review session in week 2: surface their top 3 concerns explicitly. If the timeline needs adjustment, better to know now than at month 3.

3. Head of Design's scope expansion:
   - Agree on a scope boundary document before design kick-off. "Scope creep from Design" is a predictable failure mode for consolidation projects — address it proactively.

---

Key allies and how to leverage them:

- iOS Engineering Lead: visible advocate in engineering conversations; useful for presenting the technical case to engineering audiences
- CS Team Lead: early involvement creates a better migration plan and turns a potential obstacle into a proactive partner; invite them to the rollout planning session at week 4

---

Engagement plan for high-priority stakeholders:

| Stakeholder | First action | When | Format |
|------------|-------------|------|--------|
| Android Engineering Lead | Architecture co-design session | Week 1 | Workshop (60 min) |
| VP Engineering | Risk review session | Week 2 | 1:1 (60 min) |
| Head of Design | Scope boundary alignment | Week 1 | 30 min sync + written doc |
| CS Team Lead | Migration impact session | Week 3 | 45 min sync |
| CTO | Kickoff briefing | Week 1 | Email summary (5 min read) |
