## Input

Product: Petly — a B2C marketplace connecting pet owners with local service providers (groomers, walkers, sitters, vets).

Observations from 10 user interviews (5 churned, 5 retained):

1. "I booked a dog walker once but I didn't know them and it felt weird handing over my keys." — 4 of 10 users
2. "Once I found a groomer my dog was comfortable with, I never searched again. I just rebook." — 4 of 5 retained users
3. "The ratings don't tell me anything. Everyone has 4.8 stars." — 6 of 10 users
4. "I signed up because I needed someone last minute, but the soonest available was three days later." — 3 of 10 users
5. "Honestly I just ask my neighbour now. At least I know them." — 3 of 5 churned users
6. All 5 retained users described their primary provider by name and personal details ("she always sends me photos"). No churned user mentioned a provider by name.
7. 4 of 5 retained users found their primary provider through a recommendation from a friend, not through the app's search or ranking.

Prior assumption the team held: Churn was assumed to be caused by insufficient provider supply or poor search results.

## Expected output

Insight 1: Trust, not supply, is the primary barrier to first booking. Pet owners are entrusting a stranger with their home and their animal, and the platform provides no meaningful trust signal beyond a generic star rating.
- Supporting evidence: "It felt weird handing over my keys" — 4 of 10 users. Churned users defaulted to known alternatives (neighbours) rather than booking from the app. No churned user mentioned lack of providers as the reason for leaving.
- Evidence quality: Pattern — consistent across 4+ data points; trust language spontaneous and unprompted.

Insight 2: The marketplace's value shifts entirely after the first successful match. Once a pet owner finds a provider they trust, they stop searching and the app becomes a rebooking tool, not a discovery tool.
- Supporting evidence: 4 of 5 retained users described rebooking the same provider repeatedly. No retained user was actively browsing or comparing providers. The app's search and ranking features are irrelevant to retained users.
- Evidence quality: Pattern — complete behavioural split between retained (rebooking) and churned (never found a match) groups.

Insight 3: Star ratings provide no differentiation and therefore no decision support. When every provider has 4.8 stars, the rating system fails its primary function.
- Supporting evidence: "The ratings don't tell me anything" — 6 of 10 users. No user described ratings as useful in their decision. Retained users found their provider through personal recommendation, bypassing the rating system entirely.
- Evidence quality: Strongly supported — 6 of 10 interviews; consistent across both retained and churned groups.

Insight 4: Most retained users found their provider through off-platform recommendations, not through the app. The platform's own discovery mechanism is not producing successful matches.
- Supporting evidence: 4 of 5 retained users found their primary provider through a friend's recommendation. The app's search, filters, and ranking were not the path to match for the majority of successful relationships.
- Evidence quality: Pattern — 4 of 5 retained users; suggests the marketplace's core matching function is underperforming.

Insight 5: Urgency-driven sign-ups encounter availability gaps that immediately invalidate the value proposition. Users who need someone today are told the soonest option is days away.
- Supporting evidence: "I needed someone last minute, but the soonest available was three days later" — 3 of 10 users. These users described the experience as a deal-breaker, not a minor inconvenience.
- Evidence quality: Pattern — 3 of 10 users; consistent emotional response (frustration turning to abandonment).

Contradictory or complicating data: One retained user continued using the app despite never finding a single preferred provider. They described booking different walkers each time and not minding the variation. This user may represent a distinct low-attachment segment where convenience matters more than trust. Worth investigating whether this pattern exists at scale or is an outlier.

What changes relative to prior assumptions: The team assumed churn was caused by insufficient provider supply. The data suggests the cause is a trust gap at the point of first booking, not a supply gap. Users are not failing to find providers — they are failing to trust them enough to book. This reframes the solution space from "add more providers" to "make providers trustworthy before the first booking."

Gaps: No data on provider-side experience — what do providers see and how does it affect their availability and responsiveness? No data on whether verified reviews or provider video introductions would reduce the trust gap. Urgency use case not explored in depth — would same-day availability change the acquisition and retention curve? Geographic variation not explored.
