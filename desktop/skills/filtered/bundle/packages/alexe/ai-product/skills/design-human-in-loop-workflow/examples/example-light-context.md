## Input
We're using AI to generate email responses to customer inquiries. We want humans to review them before they go out. How should we set this up?

## Expected output
Workflow map with AI involvement:

Step 1: Customer inquiry arrives
- AI involvement: none

Step 2: AI generates draft response
- AI involvement: full — generates a suggested reply based on the inquiry and knowledge base
- Output: draft email text, confidence or category classification (if available)

Step 3: Human review
- AI involvement: none — agent reads AI draft and decides to send, edit, or discard
- Decision: send as-is / edit and send / discard and write from scratch

Step 4: Send
- AI involvement: none

---

Stakes assessment:
- Customer emails are typically medium stakes — wrong information creates frustration, occasionally escalates to complaints
- High-stakes exception: billing disputes, legal requests, churn-risk accounts — these should always have a more careful human review, regardless of AI confidence

---

Intervention mode:
Current design (AI-assisted human) is appropriate for medium-stakes customer communications. The human stays responsible for every outgoing email; AI reduces drafting time.

Potential future state (not recommended immediately): auto-send high-confidence AI responses for simple FAQs (account questions, feature how-tos). Only viable after building a quality baseline and testing auto-send on low-risk categories first.

---

Review and override design:
- Human reviewer should have a one-click discard option — don't make it harder to discard a bad AI draft than to edit it
- Track how often reviewers edit vs. send as-is — high edit rate (>50%) indicates AI drafts aren't useful enough to speed up the review

---

Feedback loop design:
- Capture reviewer edits: when a reviewer makes significant changes, flag for periodic review
- Monthly: spot-check 20–30 sent AI-generated emails for quality (accuracy, tone, resolution)
- If accuracy falls below 80% or reviewers consistently rewrite from scratch: reconsider AI approach or retrain on more recent customer interactions

---

Missing context that would sharpen this design:
- What type of inquiries? (Support questions, billing, feature requests, complaints) — stakes and failure mode differ per type
- How many emails per day? If volume is 20/day, HITL is simple. If it's 500/day, review becomes a bottleneck and the routing logic needs more structure.
- Is there a confidence score from the AI? (This enables routing: low-confidence drafts flagged for extra scrutiny)
