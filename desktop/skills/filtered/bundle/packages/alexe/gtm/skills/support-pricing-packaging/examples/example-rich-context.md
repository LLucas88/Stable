## Input
We're reviewing pricing for our B2B team collaboration tool. Current situation:

Business model: monthly subscription, self-serve
Current pricing: $12/user/month (flat), no free tier, 14-day trial
Target segments:
- Segment A: small teams (3-10 people), price-sensitive, often non-technical founders or ops leads
- Segment B: mid-size companies (20-100 people), willing to pay for admin controls and integrations

Pain points with current pricing:
- Conversion from trial to paid is 9% — lower than we'd like. Exit surveys mention "too expensive for a small team just getting started"
- Segment B accounts churn after 3-4 months because they hit permission and admin limits on the flat plan
- Sales keeps asking for a discount lever for larger deals (50+ seats)
- No way to let teams try the product after trial ends — they just disappear

Competitive pricing: closest competitor charges $8/user/month with a free tier (up to 5 users). Another charges $15/user with more enterprise features.

Unit economics: CAC is $45 per account, average account size at signup is 6 users, average LTV is $380.

## Expected output
Value metric:
Seats (users added to the workspace). This maps naturally to team size growth and is already what customers expect to pay for in this category.

Pricing model options with trade-offs:

Option 1: Freemium + two paid tiers
- Free: up to 5 users, core collaboration features, limited integrations
- Pro: $10/user/month — full features, all integrations, standard admin controls
- Business: $16/user/month — advanced permissions, SSO, priority support, usage analytics
- Trade-off: Free tier increases acquisition and trial conversion, but adds support load and requires clear conversion triggers. Reduces competitor's free tier advantage directly.

Option 2: Reduce base price + add enterprise tier
- Keep flat plan at $9/user/month
- Add Enterprise tier (custom pricing, 50+ seats) with SSO, dedicated support, SLAs
- Trade-off: simpler to implement, but doesn't address the small-team acquisition problem. Sales gets a discount lever for large deals.

Option 3: Seat-based with a team starter pack
- Starter: $49/month flat for up to 8 users (captures small teams without per-seat anxiety)
- Growth: $12/user/month from seat 9 onward
- Enterprise: custom
- Trade-off: reduces friction for small teams; messy pricing communication at the tier boundary.

Recommended packaging structure:
Option 1 (freemium + two paid tiers). Rationale: the primary conversion problem is acquisition and small-team trial-to-paid. The free tier directly addresses the competitor advantage and the "too expensive for a small team" signal from exit surveys. The Business tier captures Segment B's willingness to pay for admin features and reduces churn from hitting limits.

Rationale per tier:
- Free: acquisition engine for small teams, replaces the 14-day trial as a sustained entry point
- Pro: the main conversion target — priced below current ($10 vs. $12) to reduce friction
- Business: targets Segment B explicitly with the features they were churning over (permissions, SSO)

Validation steps:
- 5-8 customer interviews with Segment A to validate free tier conversion triggers
- Win/loss analysis on deals lost to the $8 competitor
- Pricing survey with Segment B on Business tier willingness to pay (Van Westendorp or choice-based conjoint)
- Test free tier announcement on a landing page before full implementation

Risks and open questions:
- Free tier support load: needs a cap on CS touches for free users
- Pro price reduction ($12 to $10) reduces revenue per existing account — model the ARPU impact before shipping
- "Business" tier name may not resonate with SMB buyers — test naming
