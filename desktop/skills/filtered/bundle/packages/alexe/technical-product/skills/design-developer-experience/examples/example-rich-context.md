## Input
We're launching a public API for our e-commerce analytics platform. Developers integrate us to pull sales data, inventory metrics, and customer cohort reports into their own BI tools or internal dashboards.

Target developer segment: e-commerce engineers at mid-size retailers (10-200 person teams). They're competent backend devs but not API specialists. They have 1-3 days budgeted to integrate us — if it takes longer, the integration gets deprioritized. They're usually working alone or with one other person.

Current pain points from our beta (6 developers, 3 months):
- Average time to first successful API call was 4.7 hours — developers expected under 1 hour
- Three developers gave up during authentication setup; OAuth 2.0 flow was confusing without a clear example
- Our sandbox environment returns different data shapes than production for some endpoints — this caused 2 developers to build against the wrong schema
- No developer community or Slack — questions went to our support email with 2-3 day response time

Competitive DX benchmark: our main competitor has a 30-minute getting-started guide and a Slack community. Their activation rate (first API call) is 78% within 24 hours. Ours is 41%.

## Expected output
Developer persona:

Primary: Mid-level backend engineer at a mid-size e-commerce retailer. Competent in REST APIs and common auth patterns. Not an API specialist. Has 1-3 days to complete the integration. Works alone or in a small team. Decision criteria: "can I get this working without getting stuck?" If they get stuck for more than a few hours, they move to a higher-priority task and may not return.

Developer journey map:

1. Discovery: finds our API in a search or recommendation. Lands on our docs homepage.
2. Evaluation: reads the overview. Decides in 2-3 minutes whether to proceed. Key question: "how long will this take?"
3. Signup: creates an account to get API credentials.
4. Authentication: implements auth to get a valid token.
5. First API call: calls the most useful endpoint for their use case (typically sales summary or inventory endpoint).
6. Integration: builds out their full use case against the sandbox.
7. Production: switches to production, validates data matches sandbox.
8. Expansion: adds more endpoints or shares the integration with teammates.

Current failure point: steps 4 (authentication) and 7 (sandbox/production parity). Three developers abandoned at step 4. Two built against wrong schema at step 6-7.

Hello world path (target: under 30 minutes):

Step 1: Sign up and get API key — target 2 minutes
Step 2: Copy the getting-started code snippet (we provide ready-to-run curl + Python + Node examples) — target 5 minutes
Step 3: Make the first API call (sales summary for last 7 days, authenticated) — target 15 minutes including auth
Step 4: See real data in the response — confirmation moment

Currently 4.7 hours. Target: under 30 minutes. Primary fix: replace OAuth 2.0 for the getting started flow with a simple API key auth. OAuth can be available for production, but the first-run experience should not require it.

Documentation structure:

Getting started: one page, one goal — make a successful API call in 30 minutes. Single code example per language (curl, Python, Node). No prerequisites except an account.

Authentication guide: separate from getting started. Full OAuth 2.0 flow documented with working examples. Links from getting started after the first call is working.

API reference: endpoint-by-endpoint. Each endpoint includes: parameters, example request, example response, error codes. Machine-generated but human-reviewed for accuracy.

Guides: task-based (not endpoint-based). Examples: "Pull daily sales data into Google Sheets", "Build a cohort report". These are the most valuable docs for mid-level engineers.

Sandbox guide: explicit documentation that sandbox returns representative data, not real data — and a clear section on data shape differences with a schema validation tool. This directly fixes the sandbox/production parity confusion.

Friction points and proposed solutions:

Auth complexity: OAuth 2.0 is standard but overkill for solo getting-started developers. Solution: add simple API key auth for non-production use cases; OAuth remains available but is not required for first run.

Sandbox/production parity: different data shapes caused 2 abandonment events. Solution: audit and fix all schema differences; add a schema changelog to docs; add sandbox-to-production migration guide.

No community: 2-3 day support email response is a developer experience failure. Solution: a public Slack community (low cost, high developer trust signal); PM or developer relations joins and answers questions within 4 hours during business hours.

Developer support model:
- Self-serve: docs, getting started guide, guides, API reference
- Community: public Slack channel (primary async support channel)
- Direct: support email for billing and account issues only, not technical questions
- SLA for community responses: within 4 business hours for questions with no answer in docs

DX success metrics:
- Time-to-first-call: target <30 minutes from signup (currently 4.7 hours)
- 24-hour activation rate: target 70% (currently 41%)
- Auth abandonment rate: currently 50% of developers who start auth don't complete it (target <15%)
- Support ticket volume: measure questions per activation; declining = docs are improving
