## Input
We're launching a new "Advanced Analytics" add-on for our B2B SaaS tool (project management platform). Target: AEs and CSMs who need to pitch and support it.

What it is: a $49/month add-on that gives admins a dashboard with team productivity metrics — task completion rates, overdue rates by person and project, and workload distribution. It's positioned at team leads and ops managers who need visibility across multiple projects.

Common objections we're hearing in sales:
- "We can build this ourselves in Google Sheets"
- "How is this different from the reports already in the product?"
- "Our manager won't approve another add-on expense"

CS pain points:
- CSMs are getting questions about "how to read the metrics" — the data isn't explained in the UI yet
- Two customers asked if the data can be exported to CSV — it can, but CSMs didn't know

Positioning: "See where your team is actually stuck — not just what's late."

## Expected output
Product brief for internal use:

Advanced Analytics Add-on
Price: $49/month per workspace
Who it's for: team leads and ops managers who oversee multiple projects and need cross-project visibility
Core value: surface workload imbalances and recurring bottlenecks before they become delivery problems
Key metrics: task completion rate by person and project, overdue rate trends, workload distribution across team members
Primary use case: weekly team health check; pre-planning review before a new sprint or quarter

Objection handling guide:

"We can build this in Google Sheets"
Response: You can — if someone remembers to update it every week, pulls data from the right sources, and keeps the formulas working as the team changes. This updates automatically with no maintenance. The question is whether that person's time is worth $49/month.

"How is this different from the existing reports?"
Response: The existing reports show you one project at a time. Advanced Analytics gives you the cross-project view — who is overloaded across everything they're working on, not just within one project. That's the gap it fills.

"My manager won't approve another add-on"
Response: $49/month for a team lead who manages 5-10 people is less than a few hours of their time. The business case is: how many times has a deadline been missed because workload was invisible? Frame it as a visibility cost, not a software cost.

Demo flow outline:
1. Start from the team health dashboard — show the overdue rate trend for the past 4 weeks
2. Drill into one person who has high overdue rate — show their task load
3. Show the workload distribution chart — highlight if one person is carrying disproportionate load
4. Export to CSV in two clicks — confirm the feature for any customer who asked

Escalation paths:
- Metric definitions or data accuracy questions: product team (Slack: #advanced-analytics-support)
- CSV export issues or data not matching: backend engineering via CS lead
- Pricing or contract questions: sales ops

FAQ:
Q: Can we export the data?
A: Yes. From any dashboard view, click "Export" in the top right. Exports as CSV.

Q: Does it include data from before we enabled the add-on?
A: Yes, historical task data is included from account creation.

Q: Can individual team members see their own metrics?
A: No, Advanced Analytics is admin-only. Members cannot see individual comparisons.

Q: Is it per workspace or per user?
A: Per workspace. One $49/month charge regardless of team size.

Feedback loop from CS/sales to product:
- Weekly Slack post in #cs-product-feedback: top 3 questions or objections this week
- AEs to log objections not covered in the guide in a shared Notion doc
- CSMs to flag any metric definition that customers find confusing — these feed the next UI update
