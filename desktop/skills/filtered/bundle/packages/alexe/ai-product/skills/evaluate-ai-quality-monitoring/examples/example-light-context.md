## Input
We have an AI feature that summarizes support tickets for our CS team. It's been in production for a month. We want to make sure the quality is staying good.

## Expected output
Quality dimensions and definitions (for a ticket summarization feature):

| Dimension | Definition |
|----------|-----------|
| Completeness | Does the summary include the key issue the customer reported? |
| Accuracy | Does the summary avoid adding details that weren't in the original ticket? |
| Brevity | Is the summary shorter and faster to read than the original? |
| Actionability | Does the CS agent know what to do after reading the summary? |

---

Quality thresholds (draft — adjust based on your CS team's feedback):
- Acceptable: CS agent can act on the ticket without reading the original
- Needs review: summary is correct but incomplete; agent still needs to skim the original
- Unacceptable: summary is wrong, misleading, or adds information not in the ticket

---

Evaluation methodology:

**Minimum viable monitoring:**
1. Weekly: pick 10 random tickets, read both the original and the AI summary. Score each on completeness and accuracy (simple: correct / incomplete / wrong).
2. Time investment: 20 minutes/week for one CS lead
3. Track: what % of summaries are "correct" vs. "incomplete" vs. "wrong"

**CS team signal:**
- Add a thumbs up/down to the summary card in the CS tool — optional, one tap. Even 20% response rate gives a weekly quality signal.

---

Monitoring plan (minimal):
- Weekly human spot-check (10 tickets, 2 reviewers)
- Monthly: CS team feedback session — "what's the AI summary getting wrong most often?"
- Alert trigger: if the CS team reports they're reading originals more often than summaries (means the summaries aren't trusted), that's a quality failure signal even without a formal metric

---

Iteration loop:
- If completeness is the main issue: add specific prompt instruction about which ticket fields to always include
- If accuracy issues: check if ticket format varies and AI is confused by unusual formats
- Any confirmed quality issue: test prompt change on 20 historical tickets before deploying to production

---

Missing context that would sharpen this:
- What is the ticket format? (Structured fields vs. free text changes how the AI processes it)
- What does a CS agent do with the summary? (Route to a team? Respond immediately? This determines what "actionable" means)
- How are summaries surfaced? (Sidebar, main view, popup?) — affects how much the quality matters for daily workflows
