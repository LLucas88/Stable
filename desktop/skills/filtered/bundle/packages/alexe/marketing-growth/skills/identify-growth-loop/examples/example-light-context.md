## Input
We have a fitness app with social features — users can follow each other, share workout completions, and comment. We mostly grow through Instagram ads. We're not sure if our social features drive growth at all or if it's purely paid acquisition.

## Expected output
Identified growth loops with cycle descriptions:

Loop 1: Social sharing loop (candidate — strength unknown)
Cycle: User completes workout → shares completion to social features (or to external social media) → friend sees workout → downloads app → completes workout → shares. This loop is possible given the social features, but whether it's actually driving installs needs data.
Loop type: Acquisition (social / viral)
Current strength: Unknown. The question "if it's purely paid acquisition" can only be answered by looking at install source data. If social features are generating any organic installs, they would show as "direct" or "organic" in App Store attribution.
Weakest link: Unknown until data is reviewed. Typical weakest links in fitness social loops: (a) workouts are completed but not shared (sharing friction), (b) shared posts don't link back to app, (c) friends see posts but don't install.

Loop 2: Engagement loop (likely active, strength unknown)
Cycle: User logs workout → gets social validation (likes, comments from followers) → returns to log next workout → builds streak/history → shares → attracts followers. This loop supports retention but may not drive acquisition directly.
Loop type: Engagement
Current strength: Unknown. The presence of comments and follows suggests the mechanism exists, but whether it creates habitual return is unconfirmed.

Missing loops:
- Content / UGC loop: if users share progress photos or workout stats publicly, this could index and attract organic discovery. No evidence this exists yet.
- Referral loop: no explicit mention of a referral program.

Priority order:
Before prioritizing, confirm one data point: what percentage of installs are attributed to social or organic vs. paid? If it's 95%+ paid, the social loop isn't working and needs to be investigated. If it's 20%+ organic, something is working and should be understood and amplified.

Investment required per loop improvement:
- Diagnosing current loop performance: low — pull install attribution data
- Improving sharing friction (if that's the weakest link): medium — UX change to the sharing flow
- Adding external sharing (post to Instagram from in-app): medium-to-high — integration work

Confidence level:
Context-informed
