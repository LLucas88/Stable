## Input
We have a B2B HR platform — companies use it for employee onboarding, document management, and compliance tracking. Customers are HR managers at SMB companies (10–200 employees).

We need to define what "healthy adoption" looks like and set up monitoring. We currently have CS reactive — customers only contact us when something's wrong, and by then they've already decided to leave.

Our product has 3 core modules: Onboarding (new hire workflow), Documents (e-sign, storage), Compliance (deadline tracking). A healthy customer uses all 3.

Usage data is available: login events, module access, specific actions (new hire created, document sent, compliance deadline set), last active per user.

Account tiers: Small (10–50 employees, ~$3k ARR), Mid (51–150, ~$8k ARR), Large (150+, ~$18k ARR).

## Expected output
Definition of healthy adoption:

Healthy adoption for this product means:
1. All 3 modules are being actively used (not just logged into)
2. Core value actions are occurring regularly relative to company size
3. At least 2 user logins per week across the account (not just the admin)

Key behaviors and milestones:
- Within 30 days of signup: first new hire created, first document sent, first compliance deadline set
- Ongoing: HR manager login at least weekly, new hire created at least monthly (for accounts with normal hiring velocity), compliance deadlines updated when new regulatory deadlines are released

---

At-risk signals (ranked by severity):

| Signal | Severity | Threshold |
|--------|---------|----------|
| No login for 14+ days | Critical | Account-level |
| Only 1 of 3 modules used in last 30 days | High | Account-level |
| 0 new hires created in 60 days (for accounts that had new hires in onboarding) | High | Account-level |
| No compliance deadlines updated in 90 days | Medium | Account-level |
| Only admin user logging in (no other employees) | Medium | Account-level |
| Support ticket open > 7 days without response | High | Account-level |

---

Health score model design:

Inputs (5 signals, weighted):
- Module coverage (3/3 modules active in 30 days): 30%
- Login recency (days since last login): 25%
- Core action frequency (new hires, docs sent, deadlines updated in last 30 days): 25%
- User breadth (unique users logged in last 30 days): 10%
- Open support issues: 10%

Tiers:
- Healthy (70–100): all modules active, regular logins, multiple users engaged
- At-risk (40–69): 1–2 modules inactive, infrequent logins, or open unresolved ticket
- Critical (0–39): no login in 14+ days, or only 1 module active, or negative support escalation

---

Monitoring cadence and alerting thresholds:
- Weekly health score refresh (every Monday)
- Immediate alert: any account drops from Healthy to Critical in one cycle (unusual — indicates incident or cancellation intent)
- Weekly CSM digest: all At-risk and Critical accounts sorted by ARR
- Monthly review: accounts in At-risk zone for 4+ consecutive weeks escalate to CSM manager

---

Intervention workflow for at-risk accounts:

| Tier | First Action | Timeline | Owner |
|------|------------|---------|-------|
| At-risk | Proactive email check-in with specific product tip related to underused module | Within 3 business days of detection | CSM |
| Critical | Outbound call within 24 hours | Next business day | Senior CSM |
| Critical (Large accounts) | Executive sponsor outreach + solution review | Same week | CSM + VP CS |

---

Expansion signal identification:
- Account is adding users beyond original licensed seats (upsell trigger)
- All 3 modules active with high frequency + new hire creation has accelerated (growth signal)
- Admin has added a second HR manager as a user (organizational signal — team is growing)

---

Data requirements:
- Module access events: which module (Onboarding / Documents / Compliance) was opened — available now
- Core action events: new hire created, document sent, compliance deadline set — confirm instrumentation
- User roster sync: current licensed user count vs. active users — requires HR system sync check
