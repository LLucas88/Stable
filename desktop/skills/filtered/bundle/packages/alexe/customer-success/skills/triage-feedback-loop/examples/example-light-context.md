## Input
We get feedback from support tickets and from users emailing us directly. The product team sees maybe half of it. We want a system so good feedback doesn't get lost.

## Expected output
Feedback source map:

| Source | Volume | Current routing |
|--------|--------|----------------|
| Support tickets | Unknown | Partial — ~50% reaching product team |
| Direct user emails | Unknown | Partial — unstructured |

Volume unknown — this affects how much process overhead is justified. A 20-ticket/month operation needs a different system than a 500-ticket/month operation.

---

Tagging taxonomy (minimal starting point):

For each feedback item, capture two things:
1. Type: Bug / Feature request / UX friction / Question / Positive
2. Urgency: Urgent (blocks user now) / Normal / Low

That's the minimum. Add product area once you have consistent tagging working.

---

Triage process (minimal viable):

**Who:** One person owns this, rotating or fixed. Two people with no designated owner means it doesn't happen.
**When:** Once a week, fixed time. Review everything tagged in the past 7 days.
**Time budget:** Should take 30 minutes max if volume is under 100 items/week.

**Criteria:**
- Bug / Urgent: flag to engineering immediately, don't wait for the weekly review
- Feature request: log to a shared doc or backlog tool; note how many times it's been mentioned
- Question (how-to): escalate to knowledge base owner or CS — product action not needed

---

Routing rules (draft):
- Bugs go to engineering (same day if urgent, weekly batch otherwise)
- Feature requests go to product backlog (PM reviews weekly)
- How-to questions go to CS knowledge base (no product action)

---

What needs to be defined before this works reliably:
- Who owns the triage step? Without a specific person, reviews will be skipped.
- What counts as a "product signal" vs. a "support issue that CS resolves"? The line needs to be clear so CS doesn't bottleneck everything through PM review.
- What happens after feedback is logged? The loop must close — if users never hear back about feature requests, they'll stop submitting them.

---

Tooling:
No new tools needed to start. A shared Google Sheet or Notion page with source / type / date / summary is enough for the first 30 days. Add structured tooling once the process is proven.
