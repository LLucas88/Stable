## Input
We have a personal finance app. Users connect their bank accounts to see spending, set budgets, and get alerts. Activation event: setting at least one budget category after bank connection. Current onboarding: 7 steps — email signup, password, phone verification, then 4 steps collecting profile info (income, financial goals, risk tolerance, family size). Bank connection happens after all of that. Only 28% of signups reach the bank connection step, and only 19% complete activation (budget set). We know from user interviews that people download the app because they want to understand their spending — not to fill out a profile.

## Expected output
Activation event definition:
Setting at least one budget category after bank connection. This is correctly defined — it represents the moment the user has connected their data and taken the first action toward their stated goal (understanding spending).

Critical path to activation (minimum steps):
1. Email signup (required for account)
2. Bank connection (the core value delivery mechanism — must come early)
3. View categorized spending (automatic after bank connection — immediate "aha" moment)
4. Set first budget category (activation event)

That's 4 steps. Everything else is secondary.

Steps to defer post-activation:
- Phone verification: defer to post-activation or make optional (add friction before value)
- Income input: useful for budget recommendations but not required to show spending
- Financial goals: valuable for personalization but doesn't prevent activation
- Risk tolerance: relevant for investment features, not budget setup
- Family size: nice-to-have for household budgeting, not for initial activation

Onboarding flow structure with rationale per step:
1. Email signup — required, keep minimal (email + password only, no confirmation email gate)
2. Connect your bank — introduce the core value proposition immediately. Frame: "See where your money actually goes." One CTA. No profile collection before this.
3. Spending overview (automatic) — after connection, show 3 months of categorized transactions automatically. This is the hook. User sees value without taking another action.
4. "Set your first budget" nudge — offer one simple prompt to set a budget for their highest spending category. Low friction: one tap to accept or adjust.

Personalization hooks (after activation):
- Post-activation: ask about goals (save for vacation, reduce dining spend, etc.) to enable smart budget suggestions
- Progressive: surface income input when the user first views their savings rate

Empty state design guidance:
Bank connection screen: show a preview of what the spending overview will look like (anonymized example data). Removes uncertainty about what "connecting" means.
Post-connection before categorization loads: show a loading state with copy: "Analyzing your last 90 days of spending..." — sets expectation for the automatic value delivery.

Follow-up touchpoint plan:
- Day 1 (if not activated): email with the subject "Your spending is ready to review" — leads directly to the spending overview, not to the onboarding flow
- Day 3 (if activated but no budget set): in-app prompt: "You've seen your spending — want to set a limit for [highest category]?"
- Day 7 (if connected but no bank): push notification "Your spending snapshot is one connection away"

Success criteria for the new onboarding:
- Primary: activation rate from signup (current 19%) increases to 35%+
- Secondary: bank connection rate from signup (current 28%) increases to 50%+
- Guardrail: Day-7 retention must not decrease (users who activate with shorter onboarding should retain at least as well as current activators)
