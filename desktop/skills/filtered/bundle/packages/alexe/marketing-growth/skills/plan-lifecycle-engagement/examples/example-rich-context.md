## Input
We run a language learning app (mobile, subscription). Key metrics: activation rate 29% (defined as completing first lesson), Day-30 retention 21%, monthly churn 5.8%. Users on annual plans churn at 2.1%, monthly plan churn is 8.4%. We have email, push, and in-app messaging available. Behavioral triggers we can use: lesson completed, streak broken, subscription renewal approaching, days since last lesson. We know from cohort analysis that users who complete 3 lessons in their first week retain at Day-30 at 54% — vs. 21% average. Users who miss 2 consecutive days in their first 2 weeks almost never come back.

## Expected output
Lifecycle stage map:

New user (Day 0-7) → Activated learner (completed first lesson, building streak) → Retained learner (active in weeks 2-4) → At-risk (2+ days missed) → Churned

Touchpoint design per stage:

Stage 1: New user (Day 0-7) — goal: get to 3 lessons in first week
- Trigger: user completes registration but doesn't start lesson within 2 hours
  Message goal: reduce time-to-first-lesson
  Channel: push notification ("Your first lesson takes 5 minutes. Start now.")
  Timing: 2 hours post-signup if no lesson_started event

- Trigger: user completes first lesson (Day 1)
  Message goal: reinforce habit, drive second lesson
  Channel: in-app (celebration screen with streak start) + push 22 hours later if no return
  Content: "You started your streak. Come back tomorrow to keep it going."

- Trigger: user misses Day 2 (no lesson in first 48h after activation)
  Message goal: prevent early churn
  Channel: push + email
  Content: personalized to lesson topic from Day 1 ("Continue where you left off: [topic]")

Stage 2: Activated learner (Day 7-30) — goal: cement habit, reach 3 lessons/week
- Trigger: streak reaches 7 days
  Message goal: reinforce milestone, set next target
  Channel: in-app + email
  Content: milestone acknowledgment + "Learners with 7-day streaks improve 3x faster"

- Trigger: user misses a day (not in at-risk zone yet)
  Message goal: streak recovery
  Channel: push (evening, not morning)
  Content: "Your [X]-day streak is at risk. 5 minutes keeps it going."

Stage 3: Retained learner (Day 30+) — goal: sustain engagement, prevent at-risk transition
- Trigger: weekly cadence, no specific event
  Message goal: progress review + motivation
  Channel: email (weekly)
  Content: "This week: [X] lessons, [Y] minutes, [Z] new words. You're [X]% of the way to [goal]."

- Trigger: approaching end of monthly plan period
  Message goal: upgrade to annual (reduces 8.4% to 2.1% churn)
  Channel: email + in-app
  Content: "Switch to annual and save 35% — and learners on annual plans are 4x more likely to reach their goal."

Stage 4: At-risk (2+ consecutive days missed in first 2 weeks, or 5+ days missed any time)
- Trigger: 2 consecutive days missed in first 2 weeks
  Message goal: prevent permanent churn (the data shows this is the critical window)
  Channel: push + email (both)
  Content: "Life gets busy — your streak is waiting. 5 minutes today."
  Urgency: send within 4 hours of the second missed day, not the next morning

- Trigger: 7+ days inactive
  Message goal: win-back with lower friction
  Channel: email
  Content: restart framing ("Start fresh from where you left off") + remind them of progress made

Priority ranking of lifecycle interventions:
1. First 2 weeks missed-day recovery: highest impact on long-term retention based on cohort data
2. First week 3-lesson acceleration: 54% Day-30 retention for users who hit this target vs. 21% average — this is the single most valuable behavior to drive
3. Monthly-to-annual upgrade prompt: directly addresses the 8.4% monthly churn rate
4. Weekly progress email: retention maintenance, lower urgency but ongoing value

Success metrics per stage:
- New user: % completing 3 lessons in first week (target: increase from current baseline)
- Activation: first-lesson completion rate within 24h of signup
- At-risk: % of at-risk users who return within 72h of trigger
- Retained: monthly churn rate for messaging-enrolled cohort vs. control

Automation opportunities:
All four trigger-based flows (missed day, lesson completion, streak milestone, renewal) are automatable via behavioral triggers in a lifecycle tool (Customer.io, Braze, or similar). Weekly progress email requires a data pipeline for per-user progress metrics — higher implementation effort.

Data and tooling requirements:
- Behavioral events required: lesson_completed, days_since_last_lesson, streak_length, plan_type, plan_renewal_date
- Tooling: current channels (email, push, in-app) are sufficient. Needs a lifecycle messaging tool with behavioral trigger support and per-user property access.
