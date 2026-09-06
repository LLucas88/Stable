## Input
We want to turn our product into a platform. We have a SaaS tool and want to let other companies build on top of it.

## Expected output
Platform layer definition (provisional):
"Turn our product into a platform" covers a wide range — from opening a read-only API to building a full app marketplace. The right scope depends on what external developers need and what the business model supports.

Three common platform layers:
1. API-only: external developers can read/write data via API; no UI extension
2. Integration registry: third parties connect their products bidirectionally; listed in a partner directory
3. App marketplace: third parties build features that appear inside your product's UI

These are different levels of investment and risk. Without knowing which one fits, can't recommend a platform design.

Developer/partner value proposition:
Not defined. Key question: why would another company build on your platform? The answer drives the design.

Developer experience principles:
Cannot define without knowing the target developer segment.

Extensibility model:
Not assessed. Open, controlled, or hybrid — each has different quality, support, and governance implications.

Ecosystem opportunity and risk:
Not assessed. How many partners or developers are asking for this? Is there existing demand, or is this a product strategy bet?

Build vs. partner boundary:
This is the most important decision to make before designing the platform. What should only you build? What should partners build? Without this, the platform has no clear scope.

Open questions:
- What specific developer or partner demand exists today?
- What is the business model for the platform (revenue share, free listing, paid API access)?
- What API or integration surface currently exists?

Missing information:
- Product type and current capabilities
- Developer or partner audience (who would build on this?)
- Current API state (does one exist?)

Confidence level:
Provisional
