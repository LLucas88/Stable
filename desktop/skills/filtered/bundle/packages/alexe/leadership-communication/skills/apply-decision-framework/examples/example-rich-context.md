## Input
We need to decide whether to shut down our Android app and go iOS-only for the next 12 months. Context:
- Android is 22% of our user base but 8% of revenue (lower conversion rate on Android)
- Our engineering team is 4 people; maintaining both platforms is causing significant slowdown
- Several key features have shipped iOS-only because Android parity takes too long
- One of the co-founders is strongly opposed to sunsetting Android (user count argument)
- The decision needs to be made in the next 2 weeks before Q3 planning locks

Stakeholders: CEO (final authority), co-founder (opposed), Head of Engineering, Head of Product (me), 2 Android users on advisory board.

## Expected output
Decision statement:
Should we sunset Android app development for 12 months (maintain but no new features) or continue maintaining full Android parity?

Framework selected: DACI
Rationale: This is a cross-functional strategic decision with contested ownership. DACI makes clear who makes the final call vs. who inputs. It won't resolve the co-founder disagreement, but it makes the decision-making process explicit and prevents escalation after the fact.

Role assignments:
- Driver: Head of Product (me) — owns the analysis, prepares the recommendation, facilitates the process
- Approver: CEO — makes the final call; this is company-level strategy
- Contributors: Head of Engineering (provides capacity impact analysis), Co-founder (provides user base arguments), Android advisory board users (provide user impact perspective)
- Informed: full engineering team (after decision is made), support team (if user communication is needed)

Important note: the Co-founder is a Contributor, not an Approver. Their opposition should be heard and addressed in the recommendation, not treated as a veto. If this is unclear, it needs to be explicit before the process starts.

---

Options considered:

Option A: Sunset Android (maintenance-only for 12 months)
- Android base stays active but receives no new features
- Engineering capacity freed: estimated 1 engineer equivalent per quarter
- Risk: lose 22% of users gradually; reputational risk if visible

Option B: Continue Android parity
- All features ship on both platforms
- Engineering cost: current pace, ~2–3 week delay on major features
- Risk: continue the current delivery slowdown; iOS competitive advantage erodes

Option C: Selective parity (core features on Android, premium features iOS-only)
- Android users get stable core product; premium users nudged to iOS
- Complexity: requires maintaining two product specs and two QA paths
- Risk: user confusion, support overhead

---

Decision made:
Option A: Sunset Android new feature development for 12 months, with a review at month 9.

Rationale:
At 8% of revenue from 22% of users, Android has a 3x lower conversion rate. Closing the iOS roadmap velocity gap is more likely to improve revenue and retention than feature parity across a lower-monetizing platform. The 12-month sunset with a review gate reduces the permanence of the decision and gives us data to revisit.

Trade-offs acknowledged:
- 22% of user base loses new feature access — some will churn, though exact rate is unknown
- Co-founder's concern is legitimate: user count is a real asset. This trade-off is acknowledged, not dismissed.
- We are betting that iOS velocity improvements outperform the cost of Android user loss

Communication plan:
- Co-founder: 1:1 meeting before announcement; share the specific revenue and capacity data; acknowledge their concern; explain the review gate at month 9
- Engineering team: PM + Engineering Head presentation within 48 hours of decision
- Android advisory board users: honest email from Head of Product explaining the decision and timeline
- Public: app store update note if needed; no proactive announcement if Android app continues working

Review trigger:
Month 9 review: evaluate Android user churn rate, iOS velocity improvement, and whether the decision should be extended, reversed, or made permanent.
