## Input
We run a B2B project management SaaS with 12,000 paying teams. We've built over 20 integrations ourselves (Slack, Jira, GitHub, Salesforce, etc.) but partners and customers keep asking for integrations we don't have and can't build fast enough. We're considering opening up an API and building a partner integration program.

Current state:
- We have a REST API (internal-use only, not documented publicly)
- 3 enterprise customers have asked for custom integrations — we've built two manually
- 15 partners have expressed interest in building integrations
- Engineering estimates 1-2 integrations per quarter at current pace
- 20% of churn surveys mention "missing integration" as a reason

Business model: subscription SaaS, no revenue share currently. Partners want whitelabeling and co-marketing.

Developer/partner audience: mid-size SaaS companies who sell to our overlapping customer base. They want native integrations (not just API access) — their users shouldn't have to leave our product to use theirs.

## Expected output
Platform layer definition:
The platform layer is the extension surface that third-party developers build on. For this product, the right platform layer is: a public REST API + a webhooks system for event-driven integrations, plus an integration listing in a partner directory visible to customers.

This is not a full app marketplace — it's a partner integration registry. The distinction matters: an app marketplace allows third parties to build end-user features inside our UI; a partner registry allows external products to connect bidirectionally to ours. Start with the registry; expand to marketplace only if demand validates it.

Developer/partner value proposition:
Partners get: native integration with a 12,000-team user base, listed in our integration directory, co-marketing opportunity with an established SaaS. The integration itself becomes a distribution channel for their product — their users can activate the integration without leaving their workflow.

Customers get: integrations built and maintained by the product that owns them, with faster delivery than we could achieve building them in-house.

Developer experience principles:
1. Predictable — API behavior must be consistent and well-documented; breaking changes are versioned with a migration path, never silent
2. Minimal friction to first value — partner should be able to build a working integration in under a week with one engineer
3. Honest about limits — what the platform exposes is documented; what it doesn't expose is stated, not silently missing

Extensibility model: controlled
We will not open the full data model — only the resources and events that support integration use cases (tasks, projects, users, comments, status changes). Open extensibility (any partner can build anything) creates support and quality risks we can't handle at current team size. Controlled means: defined API surface, approved partner program, integration review before listing.

Partners apply to be listed; we review before making their integration discoverable to customers. This maintains quality without requiring us to build everything.

Ecosystem opportunity and risk assessment:

Opportunities:
- 15 interested partners represent integrations we'd otherwise need 7+ quarters to build ourselves
- Partner integrations reduce churn from the 20% who cite missing integrations
- Partner directory creates a network effect: as the integration count grows, the switching cost increases

Risks:
- Poor-quality partner integrations damage our product's reputation — a bad Salesforce integration reflects on us, not just the partner
- Support burden: customers will ask us to debug partner integrations; need clear ownership boundaries
- API stability: once external developers depend on our API, breaking changes become customer incidents

Build vs. partner boundary decision:
Build: integrations where we own the relationship and data (internal analytics, billing, core workflows). These touch sensitive data or core product flows that third parties shouldn't own.
Partner: integrations where the external product owns the use case (Salesforce CRM integration owned by the Salesforce-native partner; HR system integrations owned by HR platform partners).
Ecosystem (future): if demand validates it, open the UI extension surface so partners can add features inside our product — not year 1.

Open questions:
- Revenue share: do we take a cut of partner integrations, or is listing free? Free listing is faster to launch and removes a negotiation barrier; revenue share adds complexity but aligns incentives. Recommend: free listing for year 1.
- Integration review process: who reviews partner integrations? Needs a defined owner before launch.
- API versioning policy: before external developers build on the API, the versioning and deprecation policy must be documented and agreed internally.
