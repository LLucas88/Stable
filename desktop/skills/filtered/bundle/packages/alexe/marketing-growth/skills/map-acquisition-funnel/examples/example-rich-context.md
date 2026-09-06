## Input
We're a B2B SaaS team collaboration tool. Here's our funnel by channel for the last quarter:

Google Ads:
- Impressions: 280,000
- Clicks to landing page: 6,200 (2.2% CTR)
- Signups: 434 (7.0% landing page conversion)
- Completed onboarding: 178 (41.0%)
- Activated (invited a team member): 52 (29.2% of onboarding completers / 12.0% of signups)

Organic search:
- Visits: 14,500
- Signups: 812 (5.6%)
- Completed onboarding: 446 (54.9%)
- Activated: 205 (46.0% of onboarding completers / 25.2% of signups)

Product Hunt launch (one-time):
- Visits: 3,800
- Signups: 342 (9.0%)
- Completed onboarding: 185 (54.1%)
- Activated: 88 (47.6% of completers / 25.7% of signups)

Activation = inviting at least one team member within 7 days of signup.

## Expected output
Funnel stage definitions:
Awareness → Landing page visit → Signup → Onboarding complete → Activation (invited team member)

Conversion rates per stage:

Google Ads:
- Visit → Signup: 7.0%
- Signup → Onboarding complete: 41.0%
- Onboarding complete → Activated: 29.2%
- Signup → Activated (end-to-end): 12.0%

Organic search:
- Visit → Signup: 5.6%
- Signup → Onboarding complete: 54.9%
- Onboarding complete → Activated: 46.0%
- Signup → Activated (end-to-end): 25.2%

Product Hunt:
- Visit → Signup: 9.0%
- Signup → Onboarding complete: 54.1%
- Onboarding complete → Activated: 47.6%
- Signup → Activated (end-to-end): 25.7%

Absolute drop-off volumes per stage:

Google Ads:
- Landing → Signup: loses 5,766 visitors
- Signup → Onboarding complete: loses 256 signups
- Onboarding → Activation: loses 126 onboarding completers

Organic:
- Visit → Signup: loses 13,688 visitors
- Signup → Onboarding complete: loses 366 signups
- Onboarding → Activation: loses 241 completers

Channel breakdown analysis:
Google Ads end-to-end activation rate (12.0%) is roughly half of organic (25.2%) and Product Hunt (25.7%). The divergence is concentrated at two stages: Signup → Onboarding (41% vs. 55%) and Onboarding → Activation (29% vs. 46%). Google Ads users are reaching the signup page but dropping out of onboarding and not activating at the same rate as intent-driven visitors.

Biggest conversion gaps prioritized by impact:
1. Google Ads: Signup → Onboarding complete (41% vs. 55% organic). High volume, large gap. 6,200 ad clicks produce only 434 signups — and then 59% of those don't complete onboarding. Improving Google Ads onboarding completion from 41% to 50% would add ~39 activations per quarter from the same budget.
2. Google Ads: Onboarding complete → Activated (29% vs. 46% organic). Lower volume but the gap suggests ad traffic fundamentally behaves differently — possibly lower job intent or incorrect keyword targeting.

Benchmark comparison:
B2B SaaS trial-to-active benchmarks vary, but signup-to-activation rates above 20% are generally considered healthy. Organic (25.2%) and Product Hunt (25.7%) are in a reasonable range. Google Ads (12%) suggests a channel-audience mismatch problem more than an onboarding problem.

Priority improvement areas with rationale:
1. Audit Google Ads keyword targeting — the 12% end-to-end activation rate suggests the audience isn't well-matched to the product's activation requirements (inviting a team member requires organizational intent, which lower-funnel keywords may not attract)
2. Improve Google Ads landing page to pre-qualify for team-use context — organic and Product Hunt visitors may naturally understand this is a team tool; paid traffic may not
3. Investigate the onboarding completion gap for paid users specifically — is it a different journey, or the same journey with lower motivation to complete it?
