## Input
We're a product team of 5 PMs at a 200-person B2B SaaS company. We use Notion as our documentation tool. Problems we're trying to solve:

1. Onboarding: new PMs take 6-8 weeks to become productive. Most of their ramp time is spent asking questions in Slack that are answered individually, never documented.
2. Decisions get relitigated: we've revisited the same pricing page redesign decision three times in 12 months. No one can find the original reasoning.
3. Process inconsistency: each PM writes specs in a different format. Engineering can't predict what they'll get.
4. Repeated Slack questions: "where do I find the customer interview template?", "how do we do design handoff?", "what's the bug escalation process?"

Current state: we have a Notion workspace with ~400 pages. Navigation is by page creation date. Nobody knows what's in it. No owner assigned to most pages. Half the pages are outdated.

Main use cases we want the wiki to support:
- PM onboarding (days 1-30 track)
- Decision records (searchable history with rationale)
- Process guides (spec process, design handoff, launch process, etc.)
- Templates (spec template, research plan template, etc.)

## Expected output
Wiki purpose and primary use cases:
- Primary: onboarding new PMs and answering recurring process questions without Slack interruptions
- Secondary: decision record — searchable log of product decisions with rationale, so decisions aren't relitigated
- Not the home for: meeting notes, draft specs in progress, personal PM notes (those stay in personal workspaces)

Top-level structure (navigation design):

```
Product Wiki (Notion)
├── Start Here (onboarding track)
│   ├── Days 1-7: What to read, who to meet, what tools to set up
│   ├── Days 8-30: First projects, key processes to learn
│   └── Key contacts and escalation paths
├── How We Work (process guides)
│   ├── Discovery process
│   ├── Spec and requirements
│   ├── Design handoff
│   ├── Launch process
│   └── Bug escalation
├── Templates
│   ├── Product spec template
│   ├── Research plan template
│   ├── Experiment brief template
│   └── Launch checklist
├── Decision Records
│   ├── [Pricing page redesign — Dec 2024] (example)
│   └── [Add new entry] button visible
└── Reference
    ├── Product strategy and roadmap context
    ├── Team glossary
    └── Tools and access
```

Content types and locations:
- Process guides: "How We Work" section, not in personal PM spaces
- Templates: "Templates" section, linked from the relevant process guide
- Decision records: "Decision Records" section, one page per decision, structured format
- Onboarding: "Start Here" section, maintained by Head of Product

Content ownership map:
- Start Here: Head of Product (reviews quarterly)
- How We Work: each section owned by the PM most accountable for that process
  - Discovery: PM lead
  - Spec and requirements: PM lead
  - Design handoff: Lead designer (co-owner with PM lead)
  - Launch process: PM responsible for most recent launch (rotates)
  - Bug escalation: PM on-call rotation
- Templates: same ownership as the related process guide
- Decision Records: the PM who made the decision; no expiry — these are permanent records
- Reference: Head of Product

Freshness system:
- Each page has a "Last reviewed" date and owner tag at the top
- Quarterly review: during Q planning, each owner confirms their section is current (or updates it)
- "Stale" flag: any page with a "Last reviewed" date over 6 months old gets a yellow banner automatically (Notion automation)
- Decision Records: never expire; flag as "superseded" with a link to the newer decision if the decision changes

Tool boundary definition:
- Wiki (Notion): process guides, templates, decision records, onboarding
- Tickets (Linear/Jira): sprint scope, bug tracking, delivery status
- Slack: real-time questions and coordination — if an answer takes more than 2 messages, it becomes a wiki page
- Docs/Figma: working drafts of specs and designs (linked from wiki, not copied in)

Maintenance plan:
- Quarterly: owners review their sections during Q planning week (30-min slot added to the planning session)
- New process: when a new process is agreed, the PM who owns it writes the wiki page before the process is "official"
- New template: template is created in the wiki before it's used for the first time; links shared in Slack
- Annual: Head of Product runs a full audit — archive pages that haven't been viewed in 12 months
