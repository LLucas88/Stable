## Input
We run a B2C fitness app with a freemium model. Free users get 3 workouts per week, paid users get unlimited. Monthly subscription is $9.99. Our main goal for Q3 is improving free-to-paid conversion — currently at 4.2% of all registered users. We think users hit the 3-workout limit and churn instead of converting. The activation event is completing the first workout. We're on Amplitude, tracking most core events already. Need to define a metrics framework for the conversion funnel specifically — from signup to paying subscriber.

## Expected output
Primary metric:
Free-to-paid conversion rate
Definition: percentage of registered free users who start a paid subscription within 30 days of signup

Secondary metrics:
1. Workout limit hit rate — share of free users who hit the 3/week cap at least once (leading indicator for conversion intent)
2. Time from signup to first workout (time-to-activation) — median days; shorter is correlated with retention and conversion
3. Paywall exposure rate — share of free users who see the upgrade prompt at least once (measures funnel reach)
4. Upgrade prompt click-through rate — share of users exposed to paywall who tap upgrade (measures intent signal)

Guardrail metrics:
- Day-7 retention for new free users (must not degrade if we tighten the free limit)
- Paid subscriber churn rate (must not rise if we change upgrade messaging)

Metric-to-goal mapping:
- Free-to-paid conversion rate → Q3 OKR: increase paid subscriber base
- Workout limit hit rate → leading indicator for conversion opportunity pool
- Paywall CTR → optimization target for upgrade UX
- Day-7 retention → guardrail to ensure conversion changes don't hurt free experience

Instrumentation requirements:
- workout_completed event with user_plan property (free / paid)
- paywall_shown event with trigger context (hit limit / organic / end of session)
- upgrade_clicked event with placement (paywall / settings / workout end screen)
- subscription_started event with source

Vanity metrics to avoid:
- Total registered users (high signup volume with low activation is misleading)
- Total workouts completed (doesn't distinguish free from paid users or indicate conversion intent)

Gaps in current data coverage:
- No event for workout_limit_reached — needs to be added to measure limit hit rate
- Paywall events don't include trigger context — can't distinguish limit-triggered vs. organic upgrade prompts

Confidence level:
Context-informed
