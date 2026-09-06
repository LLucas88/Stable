## Input
Our activation is at 27% and D7 retention is at 35%. We think onboarding is the issue. Can you analyze this?

## Expected output

Status:
Incomplete inputs for funnel and retention analysis.

What's available:
- An activation rate (27%) and a D7 retention rate (35%) as single aggregate numbers
- A directional hypothesis (onboarding is the issue)

What's missing before meaningful analysis is possible:

**Funnel breakdown:**
- Step-by-step user counts (how many users at each step of the activation flow?)
- Total users entering the funnel in the measured period
- How "activation" is defined (what event counts as activated?)

Without step-level data, there is no way to identify where drop-off is concentrated. Knowing activation is 27% does not reveal whether the problem is at step 1, step 3, or the transition to first value.

**Retention breakdown:**
- Cohort sizes (how many users is the 35% based on?)
- Cohort time range (which signup weeks or months?)
- Definition of D7 retention (any session? specific action?)
- Step that users must complete before D7 retention is measured (all users? activated users only?)

A 35% D7 retention rate could mean very different things depending on how the cohort is defined and whether it's measured from all signups or from activated users.

**Cohort comparison:**
- Is retention improving, stable, or worsening over time?
- Are there segment differences (mobile vs. desktop, acquisition channel, plan type)?

What analysis would be possible with complete inputs:

With step-level funnel data and cohort sizes:
- Step-to-step drop-off rates pinpointing where volume is lost
- Comparison to benchmarks for the product type
- Identification of the highest-leverage drop-off point
- Hypotheses for that specific step

With cohort-level retention data (multiple cohorts):
- Retention curve shape (fast decay, plateau, improving trend)
- Cohort-to-cohort comparison to detect product change impact
- Segment breakdown to find which user groups retain well vs. poorly

Recommended next inputs:
- Export funnel data with user counts at each step for the last 4-8 weeks
- Cohort retention table: 4-6 cohorts (signup week/month) with D1, D7, D14, D30 values and cohort sizes
- Clarify activation event definition and D7 retention definition
