## Input
We're a B2B SaaS, 420 accounts. Feedback comes in from:
- Intercom support chat: ~300 messages/month
- Canny (feature request board): ~50 new requests/month, 400 total requests
- NPS survey (in-app, quarterly): ~120 responses/quarter
- CSM notes: 2 CSMs managing 420 accounts, log notes to HubSpot after calls

Product team: 2 PMs. We have weekly product-CS syncs. The current problem: Canny has 400 unreviewed feature requests, PMs dip into it randomly but there's no systematic review. CSM notes are in HubSpot but PMs never read them. Intercom support is handled by CS but never formally routed to product.

## Expected output
Feedback source map with volume estimates:

| Source | Volume | Who owns it | Current routing to product |
|--------|--------|------------|--------------------------|
| Intercom support | ~300 messages/month | CS team | None — support resolves and closes |
| Canny | ~50 new/month (400 backlog) | Product (nominally) | Random, no cadence |
| NPS survey | ~120 responses/quarter (~40/month) | Unknown | Not formally routed |
| HubSpot CSM notes | 2 CSMs × call notes | CS team | PMs don't access |

---

Tagging taxonomy:

Apply to all feedback sources. Four dimensions:

1. Product area: [Onboarding / Core feature X / Core feature Y / Billing / Integrations / Performance / Other]
2. Type: [Bug report / Feature request / UX friction / Question (how-to) / Positive signal / Competitive mention]
3. Urgency: [Urgent (blocks user today) / High (impacts key workflow) / Normal (quality-of-life) / Low (nice-to-have)]
4. Segment: [Enterprise / Mid-market / SMB / Unknown] — pull from HubSpot account record

---

Triage process design:

**Who:** One PM on rotation (alternates weekly between two PMs)
**How often:** Tuesday morning, 45 minutes maximum
**What is reviewed:** New Intercom tags from the past week (CS team applies tags to closed tickets) + new Canny requests + flagged HubSpot notes

**Criteria for action:**
- Bug / Urgent: route to engineering same day via Jira ticket. PM confirms with engineering lead.
- Feature request / 5+ Canny votes OR mentioned in 2+ separate sources: add to product backlog as a candidate with evidence
- Feature request / <5 votes, single source: close in Canny with a "Thanks, logged" response — do not add to backlog
- Competitive mention: log to a shared doc "Competitive signals" — reviewed monthly at product strategy
- Positive signal: share in team Slack #product-wins — builds morale and alignment

**Canny backlog triage (one-time cleanup):**
- Schedule a 2-hour session to review the 400 existing requests
- Mark: Under consideration / Planned / Won't build / Duplicate
- Goal: reduce the live open request count to under 50 by merging duplicates and closing clear non-starters
- Timeline: within 4 weeks of starting this program

---

Routing rules by team:

| Feedback type | Destination | Owner |
|-------------|-------------|-------|
| Bug / critical | Engineering triage → Jira | PM (creates ticket) |
| Feature request with evidence | Product backlog candidate | PM (adds to Notion backlog) |
| Customer workflow question (how-to) | CS knowledge base | CS team (no product action) |
| NPS detractor verbatim | CSM for account follow-up + PM for theme tracking | Both |
| Competitive mention | Competitive signals doc | PM |
| Account-specific complaint from HubSpot | CSM reviews + PM if systemic | CSM primary |

---

Escalation process:

| Condition | Action | Timeline |
|----------|--------|---------|
| Bug causing data loss or access failure | P0 engineering alert + PM involved | Same hour |
| 3+ accounts report same bug in one week | Escalate to engineering as priority, not backlog | Same day |
| NPS promoter score drops 10+ points QoQ | Product strategy review + CSM pulse check with 5 accounts | Within 1 week |
| CSM flags account as churn risk in HubSpot | PM and CSM discuss in weekly sync | Next sync |

---

Feedback-to-action loop:
1. Feedback arrives in source channel
2. CS or PM tags it within 48 hours using taxonomy
3. PM reviews tagged items on Tuesday
4. High-urgency items route same day; others batch to weekly
5. Monthly: PM shares top 5 feedback themes at team meeting
6. Quarterly: full synthesis before planning cycle (use synthesize-feedback-themes skill)
7. Closed loop: when a feature ships that was requested in Canny, update the request with the release note. Canny users receive the notification automatically.

---

Tooling requirements:
- Intercom: add tagging macro to support flow; CS applies type and product area before closing tickets
- Canny: enable voting notifications for PM; PM receives daily digest of new requests above 3 votes
- HubSpot: add "Product signal" flag to call note template; CSMs check this box when a call surfaces a product issue or insight — PM filters by this flag weekly
- No new tools required
