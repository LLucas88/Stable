## Input
We spend too much time on manual admin work in our product team. Lots of copy-pasting between tools. We use Jira and Slack. We want to automate some of this.

## Expected output
Workflow assessment (provisional):

What is known:
- Manual work is consuming product team time
- Copy-pasting between tools is a specific symptom
- Tools in use: Jira and Slack

What must be understood before recommending automation:
"Copy-pasting between tools" is a symptom. Before automating, the underlying workflows need to be identified — automation of a broken workflow produces faster broken output.

Automation candidates (provisional — needs workflow inventory to confirm):
Common candidates in a Jira + Slack product team:
- Status update reminders or prompts: Slack reminder → structured Slack post
- Ticket updates posted to Slack: Jira webhook → Slack notification (built-in)
- Sprint planning summaries: auto-generated from Jira sprint data

Feasibility:
Cannot assess without knowing which specific workflows are consuming the most time and what tools are available for automation (Zapier? native Jira automations? scripting?).

Governance standards:
Not defined — governance requirements depend on what's being automated and what decision rights need to be preserved.

Risk assessment:
Automating the wrong thing can create new problems. Common mistake: automating notification volume instead of reducing it.

Missing information:
- Which specific workflows are the biggest time drains?
- Tools available for automation (Zapier? Make? Native Jira automations?)
- What "copy-pasting" happens most — what goes from where to where?

Recommended first step:
List 5 recurring tasks that take 15+ minutes each and feel mechanical. That's the automation backlog. Prioritize by time saved × frequency.

Confidence level:
Provisional
