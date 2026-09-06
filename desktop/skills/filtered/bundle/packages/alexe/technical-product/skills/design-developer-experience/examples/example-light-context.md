## Input
We're building an API for developers and want to make sure the developer experience is good. It's a REST API for our project management tool.

## Expected output
Developer persona (provisional):
Not defined. "Developers" covers a wide range — what skill level, what use case, what integration context? A solo indie developer integrating for a personal project has different needs than a backend engineer at a company building an internal workflow tool. The DX design should be different for each.

Developer journey map (provisional):
Standard phases: discovery → signup → authentication → first API call → integration → production → expansion. Without knowing the target persona, friction points can't be identified.

Hello world path:
Not designed. Key question: what is the single most useful thing a developer can do in 30 minutes? Identify that and make it the getting-started guide. Everything else is secondary.

Documentation structure (provisional):
Minimum viable API docs:
- Getting started (one goal: first successful API call)
- Authentication guide
- API reference (all endpoints, parameters, example responses)

For a project management API, likely high-value guides: "Create and update tasks via API", "Sync project status to an external tool".

Friction points:
Cannot identify without developer feedback or usage data. Most common failure points in REST APIs: authentication complexity, unclear error messages, sandbox/production differences, missing code examples.

Developer support model:
Not defined. Minimum: documentation that answers common questions so developers don't need to contact support.

DX success metrics:
- Time-to-first-call
- Activation rate (% of registered developers who make at least one successful call)

Missing information:
- Target developer segment (skill level, use case, company size)
- Whether you have any developer feedback or support patterns from existing integrations
- Authentication design (API key? OAuth? Both?)
- Whether a sandbox environment exists

Confidence level:
Provisional
