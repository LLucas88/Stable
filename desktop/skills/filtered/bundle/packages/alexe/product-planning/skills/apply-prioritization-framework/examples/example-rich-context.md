## Input
We run a B2B project management SaaS. 800 paying teams, $420k MRR, mostly SMB. Our Q3 goal is reducing churn — currently at 4.2% monthly, target 2.8%.

We have 5 initiatives to prioritize. Engineering capacity is 3 engineers for 10 weeks.

Initiatives:
1. In-app churn survey — show a 2-question survey when users cancel; estimated 1 week, affects all churning users (~35/month)
2. Proactive check-in at day 30 — CSM reaches out to accounts that haven't had a login in 2 weeks; ongoing CSM time, no engineering
3. Templates library — 50 pre-built project templates for new accounts; estimated 4 weeks, mostly affects new users in first 30 days
4. Bulk task import (CSV) — top-requested feature, mentioned in 40+ support tickets; estimated 3 weeks, affects onboarding and power users
5. Guest access (view-only) — teams want to share projects with clients without a paid seat; estimated 6 weeks, affects expansion and upsell

We want to apply RICE or ICE — whichever makes more sense here.

## Expected output
Framework selected: ICE

Rationale: RICE is better when you have volume data (monthly reach) for each initiative. Here, some initiatives are CSM-driven (no engineering), and reach estimates would be speculative for most items. ICE is faster to apply honestly with the data available. Define criteria before scoring:
- Impact: how directly does this address churn? (1 = no connection, 10 = directly reduces churn in meaningful volume)
- Confidence: how confident are we that it will work? (1 = gut feel, 10 = validated data)
- Ease: how fast can we ship? (1 = 6+ weeks, 10 = under 1 week)

Scoring:

| Initiative | Impact | Confidence | Ease | ICE Score | Notes |
|-----------|--------|-----------|------|-----------|-------|
| In-app churn survey | 4 | 7 | 9 | 252 | Learns why churn happens; doesn't prevent it. High ease, medium impact on the goal. |
| Proactive day-30 check-in | 7 | 6 | 10 | 420 | No engineering needed; acts on early churn signals. Impact depends on CSM quality. |
| Templates library | 5 | 5 | 5 | 125 | Helps new-user activation but churn impact is 60–90 days delayed; medium confidence. |
| Bulk task import | 6 | 7 | 6 | 252 | Requested by users; high confidence it reduces friction. Churn connection is indirect. |
| Guest access | 7 | 6 | 3 | 126 | Strong expansion signal but 6-week build; not the right thing for a 10-week churn sprint. |

Ranked list:
1. Proactive day-30 check-in (ICE: 420) — start now, no engineering dependency
2. In-app churn survey (ICE: 252) — 1-week build; feeds learning for future quarters
3. Bulk task import (ICE: 252) — tied on score, but directly reduces power-user friction that may drive churn
4. Templates library (ICE: 125) — valuable but delayed impact; deprioritize for Q3
5. Guest access (ICE: 126) — important for expansion, wrong timing for this goal

Top 3 items with rationale:
- Day-30 check-in: highest confidence, zero engineering cost, directly addresses at-risk accounts
- Churn survey: small investment, generates the data you need to make better decisions in Q4
- Bulk task import: most-requested feature; likely reduces churnable friction from power users who are vocal about the gap

Items that scored but should be deprioritized:
- Guest access: scored reasonably on impact but ease kills it for this cycle. Don't drop it — schedule for Q4 when the churn work is done.
- Templates library: good idea, wrong metric. This is an activation initiative, not a churn initiative. Move to Q4 or connect it to an activation OKR.

Assumptions behind key scores:
- Day-30 check-in impact score assumes CSM team has capacity to run 35–40 check-ins per month
- Bulk task import confidence is based on 40+ support tickets; actual churn connection is assumed, not validated
- Guest access ease score reflects product complexity, not just engineering time — there are likely permission and billing edge cases
