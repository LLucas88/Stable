## Input
We're a 3-PM product team at a B2B SaaS company. I've done a rough process audit and found several workflows that are eating time without adding value:

1. Weekly status update: PM writes a Slack message every Friday from memory. Takes 15-20 min per PM. 3 PMs = ~1 hour/week of low-value writing.
2. Sprint review notes: someone writes up what was demoed in the sprint review. Done inconsistently; often skipped. Takes 30-45 min when done.
3. Bug triage: PMs check Intercom for new bug reports every morning and manually copy them to Linear. ~20 min/day.
4. Roadmap update: PM manually updates a Google Sheet roadmap after each sprint planning. Format varies by PM. ~30 min/sprint.
5. New feature spec review: specs are shared in Slack with a "please review by [date]" message. No tracking of who reviewed or approved. Often forgotten.

Tools available: Linear, Notion, Slack, Zapier, Intercom, Google Sheets.

Governance requirement: any change to quarterly OKRs must be documented and approved by the CPO.

## Expected output
Workflow inventory with time investment estimates:

| Workflow | Frequency | Time per occurrence | Total per week |
|---|---|---|---|
| Weekly status update | Weekly | 15-20 min × 3 PMs | ~55 min |
| Sprint review notes | Biweekly | 30-45 min | ~18 min/week |
| Bug triage (Intercom → Linear) | Daily | 20 min | ~100 min |
| Roadmap update (Google Sheet) | Biweekly | 30 min | ~15 min/week |
| Spec review tracking | Per spec | 10-15 min overhead | variable |

Automation candidates with feasibility and value assessment:

Bug triage (Intercom → Linear):
- Feasibility: high — Intercom → Zapier → Linear integration exists
- Value: high — 100 min/week, purely mechanical copying
- Automation: Zapier rule creates a Linear ticket for every new bug-tagged Intercom conversation. PM reviews the Linear backlog, not Intercom. PM still triages priority — only the copying is automated.
- Risk: some Intercom conversations are not bugs; need accurate tagging in Intercom first. Fix: PM reviews Linear bug backlog daily instead of Intercom.

Weekly status update:
- Feasibility: medium — can be templated and prompted, but writing quality depends on PM
- Value: medium — 55 min/week, but the writing itself is still PM judgment
- Automation: Zapier or Slack workflow sends a Friday reminder at 3pm with a structured template in Slack. PM fills in template; post is formatted automatically. Reduces blank-page time, not writing time.
- Better fix: combine 3 PM status updates into one digest (reduce from 3 posts to 1 structured post); PM lead rotates ownership

Sprint review notes:
- Feasibility: low for full automation (content requires judgment)
- Value: medium — inconsistency is the main problem, not the time
- Automation: structured template triggered in Notion at the end of every sprint (Linear webhook → Notion page created with template). PM fills it in; the page creation is automatic.

Roadmap update (Google Sheet):
- Feasibility: medium — Linear sprint data can feed a Sheet via API
- Value: low-medium — 15 min/week, and format inconsistency is the main problem
- Automation: a read-only Google Sheet fed by Linear data via API (or a simple Zapier integration). PMs stop manually editing; Sheet reflects current sprint status automatically.
- Risk: Google Sheet format would be fixed by the integration — requires stakeholder agreement on format before automating.

Spec review tracking:
- Feasibility: high — Linear has review/approval states
- Value: high — missed reviews are a real process failure, not just a time issue
- Automation: standardize spec review as a Linear ticket type with a "review" state. Reviewers are assigned in Linear, not messaged in Slack. Status is visible without chasing.

Priority list of automation opportunities:

High priority:
1. Bug triage (Intercom → Linear): highest time savings, cleanest automation, low risk
2. Spec review tracking (Linear ticket type): fixes a governance failure, not just a time problem

Medium priority:
3. Sprint review notes (Notion template auto-creation): reduces inconsistency
4. Weekly status update (Slack prompt template): reduces blank-page time

Lower priority:
5. Roadmap update (Linear → Google Sheet): requires stakeholder format agreement before automating

Governance standards for product operations:

OKR changes:
- Any change to quarterly OKR key results requires a written record in the quarterly plan Notion page
- PM documents: what changed, why, what was deprioritized
- CPO approves async (Notion comment or Slack DM) within 24 hours
- Without CPO approval, the OKR is unchanged — informal Slack agreement is not sufficient

Spec approval:
- All specs require at least one engineering lead review before moving to "In Progress" in Linear
- Review is tracked in Linear (reviewer assigned, review state visible)
- PM is responsible for ensuring review happens; not for doing it themselves

Ownership and accountability:
- Bug triage automation: PM lead owns the Zapier configuration; engineering lead owns the Intercom tagging standard
- Roadmap Sheet: PM lead is sole editor once automated; other PMs do not edit manually
- Spec review process: each PM owns the review tracking for their own specs

Risk assessment:
- Automating bug triage depends on accurate Intercom tagging — if tags are inconsistent, noise goes up. Fix tagging first, then automate.
- Automating the roadmap Sheet locks the format — stakeholders must agree to the format before the integration is built, not after.
