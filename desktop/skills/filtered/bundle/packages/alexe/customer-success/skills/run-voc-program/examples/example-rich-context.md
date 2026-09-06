## Input
We're a B2B SaaS — recruitment software for small staffing agencies (5–30 employees). 280 customers, $720k ARR. Current state of feedback collection:
- Support tickets in Intercom: ~120/month, mostly bug reports and how-to questions
- NPS survey sent once a year by email: last year got 41 responses, average NPS = 28
- Sales call notes from new business: not shared with product team
- Occasional customer calls when an account is about to churn: captured in CSM notes, not systematically tagged

Product team reviews support tickets quarterly, loosely. There's no regular VoC review meeting. Product decisions are mostly driven by the CEO's intuition and enterprise customer requests (3 large accounts make up 15% of revenue).

Team available for VoC: product PM (me, 20% of time), CSM (1 person, 10% time).

## Expected output
Feedback channel audit:

| Channel | Volume | Frequency | Structured? | Current Routing to Product |
|---------|--------|----------|------------|--------------------------|
| Intercom support tickets | ~120/month | Continuous | Partially (tags not consistent) | Quarterly review, loose |
| Annual NPS survey | 41 responses/year | Annual | Yes (NPS + open text) | Not formally routed |
| Sales call notes | Unknown | Per deal | No | Not shared with product |
| Churn save calls | Low volume | Reactive | No | CSM notes only |

Gaps: highest-signal source (churn save calls) is the least structured. Sales intel never reaches product. NPS is annual — too infrequent to track trends.

---

VoC program structure:

**Channel 1: Support ticket tagging (continuous)**
- Improve tagging taxonomy in Intercom: each ticket tagged by product area, type (bug / how-to / feature request / complaint), and urgency
- Owner: CSM sets up taxonomy; tags applied to all new tickets
- Volume: ~120/month
- Effort: 1 day to set up taxonomy; ongoing is tagging during support flow

**Channel 2: Quarterly CSAT / NPS survey (replace annual)**
- Replace annual email NPS with a quarterly in-app survey (3 questions): NPS + open text + "What would most improve [Product] for your team?"
- Expected response rate: 20–30% (in-app outperforms email for this segment)
- Volume target: ~50–70 responses per quarter
- Owner: PM sets up; automated via Intercom

**Channel 3: Monthly customer interview rotation**
- 2 customer interviews per month, rotating across segments: 1 healthy account, 1 at-risk account
- Goal: qualitative depth on usage patterns, workflow context, unmet needs
- Structured debrief: note 3 observations per interview in shared doc
- Owner: PM (30 min/month), CSM (schedules interviews, 15 min overhead)

**Channel 4: Churn save call protocol**
- Every churn save call gets a standard 5-question debrief doc completed within 24 hours
- Questions: why are they leaving, what did they use most, what did they find frustrating, would they consider returning, what competitor are they switching to
- Stored in shared doc accessible to PM
- Owner: CSM completes; PM reviews monthly

**Channel 5: Sales feedback loop (new)**
- Sales calls produce a brief product observation note (2–3 sentences max) on recurring objections or product gaps heard during demos
- Shared in a Slack channel #product-sales-signals, reviewed by PM weekly
- Owner: Sales rep (5 min per call); PM reviews on Fridays

---

Synthesis and tagging methodology:
- Monthly: PM reviews support tags, pulls top 5 themes by volume
- Quarterly: PM synthesizes NPS verbatims + interview notes + churn debrief notes into a 1-page summary
- Tagging taxonomy for all qualitative sources: Product Area / Type (feature gap / UX issue / missing integration / pricing / support) / Segment

---

Review cadence:
- Weekly: PM scans Slack #product-sales-signals (10 min)
- Monthly: PM reviews support ticket themes + churn debriefs (1 hour), shares 5 key findings in team meeting
- Quarterly: full VoC synthesis presented at quarterly planning — feeds directly into roadmap input

---

Routing protocol: from insight to product decision:
- Feature requests touching 3+ separate sources in same quarter: add to roadmap backlog as a candidate
- Bug patterns appearing in 5+ tickets/month: escalate to engineering triage as priority
- Churn reasons mentioned in 2+ exit interviews: flag as potential retention initiative
- Segment-specific gaps (e.g., all complaints from 15+ employee agencies): route to relevant OKR owner

---

Program effectiveness metrics:
- Monthly VoC synthesis completion rate (target: 100%)
- % of roadmap items traceable to VoC input (baseline TBD)
- NPS trend quarter-over-quarter
- Time from issue first appears in feedback to product response (baseline TBD, target < 90 days for systemic issues)
