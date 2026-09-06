## Input
We're building an AI-powered content moderation system for our gaming marketplace. Sellers post listings (game boosting services, in-game items, accounts). We currently have 1 human moderator reviewing all new listings — takes 2–4 hours daily with current volume. We want AI to handle routine approvals and flag edge cases for human review.

Stakes: approving a fraudulent or prohibited listing can result in chargebacks, account bans for buyers, and legal liability if prohibited items (stolen accounts, cheats) slip through. Mistakenly rejecting a legitimate listing frustrates sellers and costs revenue.

Model capability: we've tested our model on 500 historical listings with a 93% accuracy rate. The remaining 7% were edge cases (borderline items, ambiguous descriptions, new product categories).

User segment: sellers (post listings) and buyers (see approved listings). The moderation is invisible to buyers. Sellers see "pending review" or "approved" status.

Regulatory context: no specific regulation, but marketplace policy violations can result in payment processor sanctions.

## Expected output
Workflow map with AI involvement per step:

Step 1: Listing submitted by seller
- AI involvement: none
- Action: listing enters moderation queue

Step 2: AI initial classification
- AI involvement: full — model classifies listing as Approve / Reject / Needs review
- AI also extracts: listing category, price, description risk signals (keywords, image flags)
- Output: classification + confidence score

Step 3: Routing based on AI confidence
- AI involvement: rule-based routing (not generative)
- High confidence approve (>95%): auto-approve, listing goes live
- High confidence reject (>95%): auto-reject, seller receives explanation
- Confidence 70–94% or any flagged signal: route to human review queue
- Below 70%: always route to human

Step 4: Human review (edge cases and low confidence)
- AI involvement: AI provides recommendation and reasoning to reviewer ("Likely prohibited — contains keyword X, similar to 3 previously rejected listings. Recommend: reject")
- Human reviews and decides: approve / reject / escalate
- Human can override AI recommendation with a note (feeds model retraining)

Step 5: Seller notification
- AI involvement: drafts the rejection reason message; human reviews before sending for rejections with legal risk
- Routine rejections: auto-send AI-drafted message
- Complex rejections (account sales, cheating tools): human edits and sends

Step 6: Appeals
- AI involvement: none — all appeals are human-handled
- Any appeal is routed to a second human reviewer (not the original reviewer)

---

Stakes assessment per step:

| Step | Stakes | Consequence of AI error |
|------|--------|------------------------|
| Auto-approve | Medium | Fraudulent listing goes live; caught on buyer complaint; chargeback risk |
| Auto-reject | Low | Legitimate seller frustrated; resubmits; appeal process exists |
| AI recommendation to human | Low | Human reviews the recommendation anyway |
| Auto-send rejection message | Low-medium | Poorly worded message creates seller friction |
| Appeals | High | Incorrect appeal outcome escalates to disputes |

---

Intervention mode per step:

| Step | Mode |
|------|------|
| Initial classification | Fully automated AI (with routing rules) |
| Auto-approve | Fully automated (confidence threshold must be tuned) |
| Auto-reject | Fully automated (with appeal safety net) |
| Edge case review | AI-assisted human (AI recommends, human decides) |
| Rejection communication (sensitive) | Human-reviewed AI |
| Appeals | Fully human |

---

Review, override, and escalation design:
- Human reviewers can override any AI decision; override triggers a flag to the model team for retraining review
- High-volume override patterns (>5 overrides of the same category in one week) trigger a model performance review
- Any listing involving real-money items above $500 must have human review regardless of AI confidence
- Any listing flagged for potential legal risk (stolen accounts, cheating software) bypasses auto-approve/reject entirely and goes directly to human

---

Abstention and flagging criteria:
- AI abstains from auto-routing (sends to human) if: confidence < 70%, new product category not in training set, any image moderation flag, any price anomaly (>3x category average)
- AI explicitly flags for human: listings from new sellers with no history, listings with contact information in description (potential off-platform transaction)

---

Feedback loop design:
- Every human override: note is captured ("AI said approve, human rejected — reason: [category]")
- Monthly: model team reviews override log and retrains on disagreements
- Quarterly: recalibrate confidence thresholds based on observed auto-approve quality (spot-check 50 auto-approved listings monthly against ground truth)
- New seller category: when a new category appears >10 times in review queue, trigger a training data collection sprint before enabling auto-routing for that category

---

Edge case handling:
- Seller appeals after auto-reject: routed to human reviewer, AI recommendation shown but marked "Auto-reject" so reviewer applies extra scrutiny
- AI model unavailable (API downtime): all listings route to human queue; alert triggers if queue exceeds 50 items
- Confidence threshold changes: any threshold change requires a test on 100 historical listings to confirm impact on error rates before deployment
