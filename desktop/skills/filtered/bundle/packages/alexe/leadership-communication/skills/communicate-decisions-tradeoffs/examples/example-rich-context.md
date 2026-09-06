## Input
We've decided to sunset our desktop web app and go mobile-first. This is a big shift. The decision is made — CEO signed off.

Context:
- 65% of our user sessions are on mobile, up from 40% two years ago
- The desktop experience hasn't been significantly updated in 18 months
- We have 3 engineers; maintaining two UX paradigms at quality is no longer sustainable
- Desktop users are 12% of MAU but represent 28% of premium subscribers — they're disproportionately valuable
- Some desktop users have told us they prefer desktop for complex tasks (long-form creation, data management)
- The decision: mobile becomes the primary platform. Desktop moves to "view-only" for the next 12 months. At month 12, we re-evaluate whether to invest further in desktop or officially deprecate it.

Affected stakeholders: premium desktop users (direct), enterprise accounts we're trying to grow (indirect), sales team (who sell to enterprise accounts that use desktop), internal design and engineering team.

## Expected output
Decision statement:
As of [date], our primary product investment shifts to mobile. Desktop will remain accessible as a view-only experience for the next 12 months. New features will ship on mobile first.

---

Alternatives considered:

1. Maintain full desktop parity — rejected: with 3 engineers, full parity creates a permanent delivery bottleneck. The last 18 months have shown this leads to neither platform being excellent.
2. Deprecate desktop immediately — rejected: 28% of premium revenue is on desktop. Immediate deprecation without transition time is not appropriate.
3. Mobile-first with a 12-month view-only desktop window — chosen: provides continuity for desktop users, gives us data on actual desktop usage post-announcement, and preserves the option to reverse at month 12 if the business case changes.

---

Trade-off summary:

What we chose:
- Mobile experience improves significantly because engineering focus is undivided
- New features ship faster

What we're giving up:
- Desktop power users lose access to creation and editing workflows on desktop for at least 12 months
- Some desktop-preferring premium users may churn
- The enterprise sales motion gets more difficult until we have a clear long-term desktop answer

---

Rationale:
Sessions are 65% mobile and growing. Maintaining two UX paradigms at quality requires approximately 40% more engineering time than mobile-only (Engineering's estimate). That cost is now visible: mobile quality has suffered because resources are split. The alternative — letting both platforms degrade gradually — is worse for all users than being explicit about where we're investing.

---

Next steps:
- All premium desktop users receive an email before this goes live: what changes, when, what they can still do, and the 12-month review commitment
- Sales team briefing: what to say to enterprise accounts asking about desktop roadmap
- Month 12 review: evaluate desktop usage data and the cost of investing further vs. depreciating

---

Objection handling:

*"You're abandoning desktop users who pay more per user."*
We hear this. Desktop premium users are disproportionately valuable. The 12-month window is specifically designed not to force a permanent choice while we have limited data on the real impact. The month 12 review is a real gate, not a delay mechanism.

*"Enterprise customers need desktop."*
True. This creates a real tension in our enterprise sales motion. The honest answer is: we cannot tell enterprise customers we have a desktop roadmap when we don't. We can tell them we have a view-only desktop experience for at least 12 months and a review gate. That's less than ideal but more honest than promising parity we can't deliver.

*"Why didn't you consult us before deciding?"*
The decision timeline was driven by Q3 planning. Engineering capacity planning could not wait. The decision was made with data — session distribution, revenue by platform, engineering capacity. It was not made arbitrarily.

---

Communication format recommendation:
- Premium desktop users: email (direct, before the change goes live — minimum 2 weeks notice)
- Enterprise accounts: personal call from their CSM before the announcement
- Sales team: internal briefing + FAQ document
- Full team (engineering/design): meeting where PM walks through the rationale and Q&A
- Public: blog post or in-app announcement after the individual outreach is done — don't let customers hear from external sources first
