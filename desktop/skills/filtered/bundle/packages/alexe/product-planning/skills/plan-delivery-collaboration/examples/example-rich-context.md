## Input
We're shipping a referral program for our freemium productivity app. PRD is complete. Stories are written and estimated.

Team: 2 backend engineers, 1 frontend engineer, 1 designer (partly involved — design is 80% done), 1 QA.
Timeline: hard deadline — 8 weeks. Launch must happen before our summer marketing push.
Key dependencies: marketing team needs the referral link format confirmed to build landing page copy. Legal needs to review the incentive structure (give $10, get $10) before we can publish terms.

Known risks:
- Fraud detection logic is complex and could expand scope significantly if we try to cover all edge cases
- The third-party referral tracking tool (Rewardful) hasn't been integrated before — unknown unknowns in the API
- Designer is splitting time with another team starting week 4

Rough story estimates: referral link generation (3 days), referral tracking + attribution (5 days), reward issuance (4 days), fraud detection v1 (3 days), admin panel (referral overview for CS) (3 days), email notifications (2 days).

## Expected output
Delivery phases / milestones:

**Phase 1 — Foundation (Weeks 1–2)**
- Rewardful API integration spike (1 day — confirm integration complexity before committing)
- Referral link generation
- Basic attribution tracking (referral source logged on signup)
- Designer: finalize edge case states and error screens before going to other team
- Output: core tracking works end-to-end in staging; link format confirmed to marketing

**Phase 2 — Rewards and fraud (Weeks 3–5)**
- Reward issuance logic (credit applied when referred user converts)
- Fraud detection v1 (rate limiting per user, block same-device/IP referrals — not full ML)
- Admin panel for CS team (basic: see who referred whom, reward status)
- Legal review of incentive terms (schedule in week 2, targeting sign-off by week 4)

**Phase 3 — Notifications and QA (Weeks 6–7)**
- Email notifications (referral accepted, reward issued)
- Full QA pass including edge cases
- Internal dogfood test (team uses referral links for 3 days)
- Marketing: confirm landing page copy approved

**Phase 4 — Launch prep and go-live (Week 8)**
- Staged rollout: 10% of users in week 8, 100% after 48 hours if no alerts
- CS briefing on admin panel
- Monitoring dashboard live: referral volume, reward issuance rate, fraud flags

---

Cross-functional dependencies and owners:

| Dependency | Owner | Deadline | Risk if late |
|-----------|-------|---------|-------------|
| Referral link format | Product (week 1) | Week 1 | Marketing blocked on landing page |
| Legal review of incentive terms | Legal | Week 4 | Reward issuance cannot launch |
| Designer availability (weeks 1–4) | Design lead | Week 4 | Edge cases unresolved before handoff |
| Rewardful API confirmed | Backend (week 1 spike) | Week 1 | Whole tracking phase could shift |

Critical path:
Rewardful spike → attribution tracking → reward issuance → legal approval → fraud detection → QA → launch

Risk factors and mitigation:
- Fraud detection scope creep: define "v1" explicitly before sprint starts. V1 = rate limiting + same-device check only. ML-based fraud detection is Q4.
- Designer time: all design decisions finalized by end of week 3. Week 4+ implementation only, no new design work.
- Rewardful unknown unknowns: 1-day API spike in week 1 to surface blockers early. If spike reveals major complexity, escalate immediately — don't absorb it silently.

Alignment checkpoints:
- End of week 1: Rewardful spike result + link format to marketing
- End of week 3: legal review started, reward logic working in staging
- End of week 5: all features working in staging, QA plan ready
- End of week 7: QA complete, launch decision

Open questions before execution starts:
- What is the maximum reward per user per month? (Fraud prevention + legal requirement)
- Does reward issuance apply retroactively to users who were referred before the program launched?
- Who handles CS escalations when a referred user's reward doesn't appear?
