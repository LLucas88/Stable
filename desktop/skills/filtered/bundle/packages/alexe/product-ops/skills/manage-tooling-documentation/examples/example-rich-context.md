## Input
We're a 6-person product team (2 PMs, 2 engineers, 1 designer, 1 analyst) at a 80-person startup. We've accumulated tools over 3 years without ever rationalizing them. Current tool stack I've mapped:

- Planning: we use both Jira and Linear. Engineers prefer Linear. PMs added Jira a year ago for a cross-team initiative and never removed it.
- Documentation: Confluence (company-wide), Notion (product team only), and Google Docs (individuals write specs here first, then "should" move them to Confluence).
- Communication: Slack (team), email (mostly for external), Loom (some PMs, not all).
- Roadmapping: Productboard (we pay for it, few people log in), a shared Google Sheet that the CEO actually reads, and Notion pages.
- Analytics: Mixpanel (product events), Google Analytics (marketing site), Metabase (internal SQL-based reports).

Pain points:
- It's unclear where to find anything. New hires ask where specs live and get 3 different answers.
- We're paying for Productboard and nobody uses it.
- Decisions about priorities are made in the Google Sheet but context is in Notion. Nobody links them.
- Confluence is the "official" doc tool but product team writes everything in Notion.

## Expected output
Current tooling audit:

Planning:
- Jira: used by PMs for cross-team tracking; engineers don't use it
- Linear: used by engineers; PM view is incomplete
- Verdict: duplication; Linear should be the single planning tool for the product squad

Documentation:
- Confluence: company-wide; product team uses it minimally
- Notion: product team's actual home for specs, processes, templates
- Google Docs: drafts and specs that never migrate
- Verdict: keep Notion as product team's documentation home; link to Confluence only for company-wide artifacts; eliminate Google Docs as a spec destination

Roadmapping:
- Productboard: paid, under-used — sunset it
- Google Sheet: CEO reads it; that's a real use case that must be preserved
- Notion roadmap pages: detailed but not connected to the Sheet
- Verdict: Google Sheet stays (stakeholder-facing); Notion pages stay (PM-level detail); eliminate Productboard

Analytics:
- Mixpanel + GA + Metabase: three tools for three distinct use cases — not duplicative
- Verdict: keep all three; document which tool answers which question type

Recommended tooling stack by category:
- Planning: Linear (only)
- Documentation: Notion (product team), Confluence (company-wide artifacts only)
- Specs: Notion (drafts and final), linked from Linear tickets
- Roadmap: Google Sheet (stakeholder view) + Notion (PM detail view)
- Communication: Slack + Loom (adopt team-wide for async walkthroughs)
- Analytics: Mixpanel, GA, Metabase (document use cases)

Documentation standards:
- Specs: written in Notion using the spec template, linked from the Linear ticket. No specs in Google Docs.
- Naming: [Product area] — [Feature name] — [Status: Draft/In Review/Approved]
- Update cadence: spec author updates status field when status changes; no other version required
- Decision records: one Notion page per major product decision, stored in "Decision Log" section
- Where things live (single source of truth card, pinned in #product Slack channel):
  - Specs: Notion / Product Specs
  - Roadmap (PM view): Notion / Roadmap
  - Roadmap (exec view): Google Sheet (linked from Notion)
  - Process guides: Notion / How We Work
  - Company-wide policies: Confluence

Documentation health assessment:
- What exists: spec templates (Notion), partial process guides (Notion), some decision records
- What's missing: clear spec naming convention, a process guide for design handoff, onboarding track for new hires
- What's outdated: Confluence product pages haven't been updated in 18 months — archive or redirect to Notion

Recommended immediate actions:
1. Cancel Productboard subscription — save ~$300/month
2. Archive or redirect stale Confluence product pages (2-hour task)
3. Publish "where things live" card in Slack (30-minute task, solves the "where do I find specs?" question)
4. Deprecate Jira for the product squad — migrate open tickets to Linear (1-day project)

Governance:
- Tool administration: Notion admin = PM lead; Linear admin = engineering lead
- Documentation upkeep: each section in Notion has an owner (see wiki ownership map)
- Tool addition policy: any new tool requires PM lead approval; must replace something or fill a documented gap
