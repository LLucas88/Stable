## Input
We have a productivity SaaS, B2B. Churn is around 4% monthly. Activation is OK but we don't have great lifecycle messaging in place. We have email. Some users go quiet after a few weeks. Not sure who is at risk or when to reach them.

## Expected output
Lifecycle stage map:
New user → Activated → Retained → At-risk (gone quiet) → Churned

Touchpoint design per stage (draft — requires behavioral trigger data):

Stage 1: New user — goal: get to first meaningful outcome
- The activation event needs to be defined. What does "activation OK" mean specifically? A concrete event (e.g., "created first project," "connected first integration") is required to define the transition from new user to activated.
- Without a behavioral trigger for activation, the lifecycle touchpoint for new users defaults to time-based email sequences (Day 1, Day 3, Day 7) — less effective than event-triggered.

Stage 2: Activated → Retained — goal: establish regular use habit
- Common B2B SaaS touchpoints: weekly digest email (usage summary per user), feature discovery prompts when a new workflow is relevant
- Requires: usage data per account to generate meaningful content

Stage 3: At-risk — goal: intervene before churn
- "Gone quiet after a few weeks" is the at-risk signal. The question is: how many days of inactivity is the threshold?
- Typical B2B SaaS at-risk trigger: 14 days of no product activity. But this needs calibration against your actual churn timing — when do churned accounts go quiet before canceling?

Automation opportunities:
Email automation is available. To build behavioral triggers, the product needs to emit activity events that the email tool can consume.

Missing information to complete the lifecycle plan:
- What is the activation event definition?
- What email tool is in use? (determines what behavioral triggers are available)
- When do at-risk accounts typically go quiet before churning? (pull from churned account history)
- Is churn driven by lack of use, budget, or competition?
- Who is the primary contact for lifecycle messages — the individual user or the account admin?

Data and tooling requirements:
- Activity events per user (logins, core feature usage) need to flow into the email tool
- Account-level usage rollup needed for admin-facing digests

Confidence level:
Context-informed
