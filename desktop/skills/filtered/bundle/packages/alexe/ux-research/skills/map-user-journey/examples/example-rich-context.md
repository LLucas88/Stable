## Input
We run Greenline, a personal finance app for tracking spending and setting budgets. We want to map the first-time user journey from app download to setting up their first budget.

Target persona: "Cautious Claire" — 28–35, salaried professional, never used a budgeting app before, motivated by a recent financial scare (unexpected bill, overdraft). Wants control over spending but intimidated by finance tools.

Research data:
- 12 user interviews with new users (first 30 days)
- Analytics funnel: download → open (82%) → signup (64%) → connect bank account (31%) → create first budget (18%) → return within 7 days (9%)
- Support tickets (last 60 days): 34 about bank connection failures, 22 about "I don't know what categories to use," 15 about "the app feels like it's judging me"
- NPS survey comments: "I liked it but got overwhelmed," "connecting my bank felt scary," "I set up a budget but forgot about the app"

## Expected output
Journey map:

Stage 1: Discovery & Download
- Steps: Sees ad or recommendation → visits app store → reads reviews → downloads
- Touchpoints: App store listing, social media, word of mouth
- Thoughts: "Maybe this will help me get my spending under control"
- Emotions: Hopeful but skeptical
- Pain points: None observed at this stage
- Evidence quality: Assumed (no pre-download research conducted)

Stage 2: Signup
- Steps: Opens app → sees onboarding screens → creates account (email or social login)
- Touchpoints: Onboarding screens, signup form
- Thoughts: "This looks simple enough"
- Emotions: Cautiously optimistic
- Pain points: Minor — signup itself is straightforward, but 18% who open don't complete signup (possible friction in account creation or onboarding screens)
- Evidence quality: Research-backed (analytics: 82% open, 64% signup)

Stage 3: Connect Bank Account
- Steps: Prompted to connect bank → sees bank selection screen → enters credentials → waits for sync
- Touchpoints: Bank connection screen, credential entry, loading/sync screen
- Thoughts: "Is this safe? What if something goes wrong?"
- Emotions: Anxiety, hesitation
- Pain points: Critical — drop from 64% signup to 31% bank connection. 34 support tickets about connection failures. Interviews confirm users feel "scared" about sharing bank credentials.
- Evidence quality: Research-backed (analytics, support tickets, interview quotes)

Stage 4: Create First Budget
- Steps: Sees transaction data → prompted to create budget → chooses categories → sets amounts
- Touchpoints: Transaction feed, budget creation flow, category selector
- Thoughts: "I don't know how much I should budget for groceries" / "These categories don't match how I think about spending"
- Emotions: Overwhelm, self-doubt
- Pain points: Major — drop from 31% bank connection to 18% first budget. 22 tickets about confusing categories. Interview theme: "I got overwhelmed by all the options." NPS: "felt like it's judging me."
- Evidence quality: Research-backed (analytics, support tickets, interviews, NPS)

Stage 5: Post-Setup Return
- Steps: Receives push notification or remembers app → opens app → checks budget status
- Touchpoints: Push notifications, app home screen, budget dashboard
- Thoughts: "Did I overspend?" / "I forgot this app existed"
- Emotions: Guilt or indifference
- Pain points: Major — drop from 18% first budget to 9% return within 7 days. NPS comment: "I set up a budget but forgot about the app." No re-engagement mechanism observed in interview data.
- Evidence quality: Research-backed (analytics, NPS comments)

Top friction moments (priority-ordered):
1. Bank connection (Stage 3): biggest absolute drop-off (64% → 31%). Driven by trust anxiety and connection failures. Affects the entire downstream funnel.
2. Budget creation (Stage 4): second-largest drop (31% → 18%). Driven by category overwhelm and emotional discomfort.
3. Return/retention (Stage 5): 50% of users who create a budget don't come back within a week. No clear re-engagement hook.

Opportunity areas by stage:
- Stage 3: Offer a "skip bank connection" path with manual entry. Address trust with security messaging. Fix connection reliability (34 tickets).
- Stage 4: Pre-fill suggested budgets based on spending data. Reduce category count. Reframe language from judgmental to supportive.
- Stage 5: Design a meaningful first-week notification strategy (not just "check your budget" but specific, useful nudges like "you spent $X on coffee this week").

Cross-team handoff points:
- Stage 3 involves engineering (bank API reliability) and compliance (security messaging)
- Stage 5 involves marketing/growth (notification strategy) and product (dashboard design)

Open research questions:
- What would make users trust the bank connection? (Need concept testing of trust-building UI elements)
- Do users who skip bank connection and enter manually have better retention?
- What notification content brings users back vs. triggers uninstall?
