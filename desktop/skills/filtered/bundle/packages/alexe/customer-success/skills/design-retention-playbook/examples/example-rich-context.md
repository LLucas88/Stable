## Input
We've done churn analysis on our freelance marketplace (design and copywriting services). Here's what we know:

Churn root causes (from 3 months of exit surveys + behavioral analysis):
1. Buyer one-project syndrome — 60% of buyers complete one order and never return. Not a product failure; they accomplished their goal. But 15% of these could become repeat buyers if prompted correctly.
2. Failed first match — 18% of buyers who receive a proposal from a freelancer they're not happy with churn before completing any order. Issue is match quality.
3. Price surprise at checkout — 12% churn specifically at checkout when platform fees are shown. They didn't anticipate the fees during browsing.
4. Freelancer quality complaints — 10% cancel after completing an order with a complaint about freelancer work quality.

Customer segments:
- Small businesses (1–5 employees): 65% of buyers, smaller order values, price sensitive
- Agencies and marketing teams (6–50 employees): 35%, larger orders, quality-sensitive

CS team: 1 CSM (part-time, also handles support). Manual intervention only for top 100 accounts by LTV.

## Expected output
Retention plays by churn root cause:

---

**Play 1: One-project syndrome (60% of churn)**

Trigger signal: Buyer completes first order and has no active projects or proposals 14 days later.

Intervention action:
- Day 15 automated email: "Great work on [Project Name] — ready for your next creative project?" + 3 curated relevant freelancer profiles based on the completed order's category
- Day 22 follow-up (if no action): in-app notification with a discount code for the second order (10%, single-use, expires in 14 days)

Owner: automated (product + marketing), not CSM
Timeline: trigger-based, within 15 days of order completion
Escalation: none needed; this is volume play, not high-touch
Success criteria: % of one-project buyers completing a second order within 60 days (target: increase from current baseline by 5 percentage points)

---

**Play 2: Failed first match (18% of churn)**

Trigger signal: Buyer views 3+ proposals and does not select any within 72 hours, OR explicitly rejects all proposals.

Intervention action:
- Automated: immediate offer of "Guaranteed match" — CS manually reviews the brief and sends 1 curated proposal within 4 hours
- If CSM capacity allows: personal message from CSM explaining the match process and offering to help refine the brief

Owner: CSM-assisted for the top 50 accounts by estimated order value; automated for the rest
Timeline: within 4 hours of rejection signal
Escalation: if the rematched proposal is also rejected, CSM calls the buyer directly
Success criteria: % of failed-match buyers who proceed to order completion (currently unknown — instrument this signal first)

---

**Play 3: Price surprise at checkout (12% of churn)**

Trigger signal: Buyer abandons checkout after viewing the fees breakdown (requires checkout abandonment event with fee-display step as last action).

Intervention action:
- In-product: add fee transparency one step earlier — show total estimated cost including fees on the proposal page, not just at checkout. This is a product fix, not a CS play.
- Until fixed: automated email to checkout-abandoned buyers within 1 hour: fee explanation + FAQ link + offer to ask questions

Owner: product (fee transparency) + email automation (save attempt)
Timeline: product change target: within next sprint. Save email: immediate trigger.
Escalation: none — this is a product design problem; CS cannot fix fee structure
Success criteria: checkout completion rate for buyers who see fee breakdown (currently tracking abandonment event — needs fee-display step added)

---

**Play 4: Freelancer quality complaints (10% of churn)**

Trigger signal: Post-order satisfaction score of 2/5 or below, or support ticket tagged "work quality."

Intervention action:
- Automated: offer a partial refund or re-do credit (10% of order value) within 24 hours of complaint
- CSM: review freelancer's quality profile; if 3+ complaints in 90 days, remove from active pool
- Buyer: personal apology + dedicated match for their next project (bypasses standard proposal flow)

Owner: automated refund (platform), CSM review (manual)
Timeline: within 24 hours of quality signal
Escalation: orders above $500 get executive escalation if buyer requests refund after re-do
Success criteria: % of quality-complaint buyers who complete a follow-up order (measures whether the save play actually works)

---

Expansion play:

Trigger: Buyer has completed 3+ orders, all with rating ≥4/5, and hasn't placed an order in 30 days.

Action: Curated upsell email — introduce a higher-tier service category the buyer hasn't tried, with a featured freelancer profile and a time-limited offer.

Owner: automated, driven by CRM tag
Success criteria: additional order revenue from expansion play cohort vs. control group

---

Intervention timeline design:

| Churn Risk | Detection to First Contact |
|-----------|--------------------------|
| One-project (no return in 14 days) | Day 15 |
| Failed match (proposal rejection) | Within 4 hours |
| Checkout abandonment | Within 1 hour |
| Quality complaint | Within 24 hours |

Renewal isn't relevant for a marketplace — churn signal is inactivity or complaint, not contract renewal date.

---

Escalation matrix:

| Signal | First responder | Escalation trigger | Escalated to |
|--------|---------------|-------------------|-------------|
| Quality complaint | Automated refund | Order > $500 or second complaint | CSM |
| Failed match x2 | CSM message | Buyer explicitly asks to speak to someone | CSM call |
| All plays | Automation | No response after 2 automated touches | CSM manual review |

---

Playbook effectiveness metrics:
- Play 1: second-order conversion rate for triggered cohort vs. non-triggered baseline
- Play 2: order completion rate after failed match, pre- vs. post-play
- Play 3: checkout completion rate before vs. after fee transparency change
- Play 4: re-order rate after quality complaint, with and without save play
