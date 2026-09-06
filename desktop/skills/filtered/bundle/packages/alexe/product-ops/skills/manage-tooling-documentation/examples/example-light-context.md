## Input
We have a lot of tools and documentation is a mess. We use Notion, Jira, Confluence, Google Docs, and Slack. We're a product team of 4. Nobody knows where anything is.

## Expected output
Tooling audit (provisional):

The tools listed (Notion, Jira, Confluence, Google Docs, Slack) are all common — the problem is likely not the tools themselves but the lack of defined boundaries between them. "Nobody knows where anything is" almost always means: multiple tools serve the same purpose with no agreed owner.

Typical duplication patterns in this stack:
- Confluence and Notion: both documentation tools — which one is authoritative for product content?
- Jira and Notion: Jira for ticket tracking, Notion for specs — but are specs linked from tickets?
- Google Docs: usually a drafting tool that content never leaves — becomes a documentation black hole

Recommended documentation standard (provisional):
Choose one primary documentation home for product content (Notion or Confluence, not both) and enforce it. Everything else links to it, not duplicates it.

Recommended actions (provisional):
1. Decide: Notion or Confluence for product documentation — not both
2. Define where specs live relative to Jira tickets
3. Establish a naming convention so things are findable
4. Archive or delete Google Docs that have migrated (or should have)
5. Pin a "where things live" reference in Slack #product

Documentation health assessment:
Cannot assess without seeing what exists. Start by listing what you're trying to document (specs, decisions, processes, templates) and then checking whether each has a single home.

Governance:
Not defined — each section of documentation needs one named owner or it will drift.

Missing information:
- Which tool is causing the most friction (where do people go looking for things and not find them?)
- What types of documentation matter most (specs? process guides? decision records?)
- Is there a company-wide documentation tool standard or can the product team choose?

Confidence level:
Provisional
