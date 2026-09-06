## Input
We want to test TikTok as a new acquisition channel for our fitness app. Currently 100% of paid spend is on Meta. We've seen competitors use TikTok creator campaigns. Our target user is 22-32 year old women interested in home workouts. Meta CAC is $21 with Day-30 retention of 18%. Free-to-paid conversion is 3.8%. We have $8,000 available to run a test over 6 weeks. Our team has done Meta creatives but not TikTok. We want to understand if TikTok can match or beat Meta on CAC without sacrificing user quality.

## Expected output
Channel hypothesis:
We believe TikTok creator campaigns will acquire 22-32 year old female home workout users at a CAC under $25 (within 20% of Meta's $21) with Day-30 retention of at least 16% (within 10% of Meta's 18%), because TikTok's algorithm has strong affinity for fitness content in this demographic and creator-style video outperforms banner/static ad formats for workout product discovery.

Success criteria:
- CAC under $25 on TikTok
- Day-30 retention at or above 16% for TikTok-attributed installs
- At least 150 installs in the test period (minimum for meaningful retention signal)

Failure criteria:
- CAC above $35 (>65% premium over Meta without quality offset)
- Day-30 retention below 12% (materially worse than Meta's user quality)
- Fewer than 80 installs in 6 weeks (insufficient signal to evaluate)

Minimum test budget and timeline:
$8,000 over 6 weeks. At a $25 expected CAC, this should produce ~320 installs. At worst-case $35 CAC, this produces ~228 installs — above the 150 minimum. Budget is adequate for a valid signal. Timeline of 6 weeks allows Day-30 retention to be measured for the first 2 weeks of installs.

Test parameters:
- Audience: interests-based targeting on TikTok (fitness, home workout, wellness), 22-32 female, US
- Creative: 3 creator-style videos from 2-3 micro-influencers in the home fitness space. Not repurposed Meta content.
- Message: focus on the "at-home, no equipment" angle — this is the hook most relevant to TikTok's home-context viewing
- Landing experience: deep link to the home workout content category, not the generic app store page
- Creative note: do NOT test audience and creative simultaneously. Fix the audience targeting and test 3 creative variations to identify which performs best.

Measurement plan:
- Primary: CAC (total spend / attributed installs via SKAdNetwork + TikTok attribution)
- Secondary: install volume, Day-30 retention (compared to Meta cohort from same period), free-to-paid conversion rate
- Track by creative variant to identify which video format works best

Decision framework: scale / iterate / kill
- Scale: CAC <$25 AND Day-30 retention ≥16% → increase TikTok budget to 20-30% of paid mix
- Iterate: CAC $25-35 OR retention 12-16% → test new creative or audience targeting before scaling
- Kill: CAC >$35 AND retention <12% → discontinue TikTok and reallocate to Meta

Risks and mitigations:
- Creative quality risk: TikTok requires native-feel content; repurposed Meta ads perform poorly. Mitigation: source actual TikTok creators, not video editors.
- Attribution risk: iOS ATT limits TikTok attribution accuracy. Mitigation: use blended attribution (TikTok-reported vs. organic baseline delta) and accept some uncertainty.
- Budget exhaustion before Day-30 data: test starts 6 weeks out, so only the first 2 weeks of installs will have mature Day-30 data. Accept this limitation and plan a second assessment in week 10.
