## Input
We want to monitor whether customers are adopting our product. It's a project management SaaS. We have login data. How do we set this up?

## Expected output
Definition of healthy adoption (provisional — needs product-specific calibration):

For a project management SaaS, healthy adoption typically means:
- Users log in regularly (at minimum, the account owner)
- Core project management actions are occurring (tasks created, assigned, completed — not just logins)
- Multiple team members are active, not just the admin who signed up

These are placeholder definitions. "Healthy" must be defined based on your product's core value action, not just presence in the tool.

---

At-risk signals (generic starting point):
- No login in 14+ days (any user on the account)
- Only 1 user logging in (solo admin use, team isn't adopted)
- No core action (task creation, project update) in 30 days

---

Health monitoring framework (minimal viable):

With only login data available now, monitoring will be limited. Login data tells you if someone showed up; it doesn't tell you if they got value.

What you can monitor today:
- Last login date per account
- Weekly active users per account
- Trend: is usage growing, stable, or declining week-over-week?

What you should add before building a real health score:
- Core feature action events: what action in your product signals that a user is getting value? (Task completed, project created, team member invited — whatever is most correlated with retention in your context)
- Multi-user engagement: are multiple seats being used or just the buyer?

---

Monitoring cadence (starting point):
- Weekly: pull all accounts with no login in 14+ days
- Monthly: review accounts with declining usage trend (login frequency down week-over-week for 3+ weeks)

---

Intervention workflow (minimal):
- 14-day no-login: automated email with "How's it going?" + a tip for the most common unactivated feature
- 30-day no-login: CSM manual outreach (or automated if no CSM coverage)

---

Data requirements:
- Login events with account ID and timestamp: available
- Feature-level action events: not yet available — add instrumentation before building a meaningful health score
- Segment mapping (account size, plan tier): needed to contextualize what "normal" looks like
