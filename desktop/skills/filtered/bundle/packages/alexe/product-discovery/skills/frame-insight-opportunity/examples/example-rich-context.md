## Input

Product: Movezy — a B2C urban mobility app offering electric scooter and e-bike rentals in mid-size European cities.

Validated insights from 8 user interviews and ride data analysis:
1. Users who complete their first ride within 10 minutes of downloading the app retain 3x better at Day 30 than users who browse but don't ride. The unlock-to-ride friction (payment setup, ID verification, scooter search) is where most first-session drop-off occurs.
2. 70% of rides happen during two windows: morning commute (7:30–9:00) and evening return (17:00–19:00). Weekend usage is 4x lower and skews toward leisure, not transport.
3. Users describe Movezy as "the thing I use when my usual option fails" rather than a primary transport mode. The trigger is disruption (missed bus, train delay, running late) rather than planned choice.
4. Price perception is anchored to public transit, not taxis. Users who compared Movezy to a bus ticket felt it was expensive; users who compared it to a taxi felt it was cheap. No user spontaneously described it as "good value."
5. Scooter availability anxiety is real: 6 of 8 users described checking the app, seeing no scooters nearby, and closing it. Two said this happened enough times that they stopped checking.

Business goal: Increase weekly active riders from 18% to 30% of registered users. Primary segment: weekday commuters in the 25–35 age range.

## Expected output

Opportunity 1:
- HMW statement: How might we reduce the time from app download to first completed ride, so that new users experience the core value before losing motivation?
- Source insight: Users who complete their first ride within 10 minutes of downloading retain 3x better. Payment setup, ID verification, and scooter search create first-session friction.
- Affected segment: All new users; highest impact on commuters who download during a disruption moment and need to ride immediately.
- Potential impact: High — directly addresses the primary behavioural differentiator between retained and churned users. First-ride completion is the strongest activation predictor in the data.
- Evidence quality: Data-informed — ride data confirms the 3x retention difference; interview data explains the friction points.
- Risks: Reducing verification steps may create regulatory or liability issues. Allowing rides before payment confirmation introduces fraud risk. Speed of onboarding may conflict with compliance requirements.
- Suggested next step: Formulate experiment hypothesis. Test a "ride now, verify later" flow where ID verification is deferred until after the first ride, with a control group that follows the current sequential flow.

Opportunity 2:
- HMW statement: How might we shift Movezy from a backup transport option to a planned part of the daily commute, so that usage becomes habitual rather than reactive?
- Source insight: Users describe Movezy as "the thing I use when my usual option fails." The trigger is disruption, not planned choice.
- Affected segment: Weekday commuters (25–35) who currently use Movezy 1–2 times per week reactively.
- Potential impact: High — converting even a portion of reactive users to daily commuters would significantly increase weekly active riders. But this requires changing an entrenched mental model.
- Evidence quality: Data-informed — 6 of 8 users described reactive usage; commute window ride concentration confirmed in ride data.
- Risks: Users may resist being "sold" on daily usage when they currently see Movezy as situational. Push too hard and the app feels aggressive. The positioning shift may alienate leisure users.
- Suggested next step: Research first. Run 4–6 interviews specifically with users who ride 3+ times per week to understand what shifted their mental model from backup to primary. Use findings to inform a positioning or feature experiment.

Opportunity 3:
- HMW statement: How might we reduce scooter availability anxiety, so that users trust they can find a ride when they need one instead of giving up after failed checks?
- Source insight: 6 of 8 users described checking the app, seeing no scooters nearby, and closing it. Two stopped checking entirely after repeated failures.
- Affected segment: All active users; highest impact on reactive commuters whose usage depends on availability at the moment of need.
- Potential impact: Medium — addresses a specific churn trigger, but solving it requires operational changes (fleet rebalancing, density increases) that may be capital-intensive and outside the product team's direct control.
- Evidence quality: Data-informed — consistent pattern across 6 of 8 interviews; availability checks with no subsequent ride confirmed in app event data.
- Risks: Promising availability the product cannot deliver will damage trust further. Reservation systems may reduce spontaneous availability for other users. Fleet rebalancing costs may not justify the retention uplift.
- Suggested next step: Quantify the problem first. Analyse app open events with no subsequent ride unlock to estimate the frequency and location patterns of "empty map" experiences. Share findings with operations before designing a product solution.
