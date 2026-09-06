## Input
We're launching a new "Team Spaces" feature for our B2B project management SaaS. Target: teams of 5-50 people at SMB companies. Launch date is in 6 weeks. The feature lets teams create shared workspaces with role-based permissions, shared templates, and a team activity feed.

Current state:
- Feature is in closed beta with 12 customers, feedback is positive
- Positioning and messaging are drafted
- CS team needs enablement; they haven't seen the feature yet
- Sales has been pre-selling it to prospects, so 3 deals are contingent on this launch
- We have a Slack integration that needs to be updated to work with Team Spaces
- Legal needs to review updated terms (data sharing between team members)
- We plan a soft launch to existing customers first (week 5), then general availability (week 6)

Success metric: 40% of existing paying customers create a Team Space within 30 days of GA.

## Expected output
Launch readiness criteria by area:
- Product: Beta exit criteria met (no P0/P1 bugs, Slack integration updated and tested)
- Quality: QA sign-off on role permissions, data isolation tested across team boundaries
- Legal: Updated terms reviewed and approved, data sharing policy updated in privacy docs
- Marketing: Announcement email drafted, in-app tooltip and announcement modal ready
- CS: Team Spaces enablement session completed, FAQ document ready, escalation path defined
- Sales: Three contingent deals briefed on GA date and feature scope confirmed

Launch audience and rollout strategy:
Week 5 (soft launch): existing paying customers via in-app announcement and email. No press or social.
Week 6 (GA): all new signups, product hunt post, email to trial users, social announcement.

Channel plan:
- In-app: announcement modal on first login after launch week
- Email: segmented send. Paying customers (soft launch week), trial users (GA week)
- Blog: one post timed to GA, focused on the team productivity angle
- Sales: briefing deck update with Team Spaces use cases

Pre-launch checklist:
- [ ] Slack integration updated and deployed to production (owner: eng, deadline: week 4)
- [ ] Legal terms reviewed and published (owner: legal, deadline: week 4)
- [ ] CS enablement session held (owner: product, deadline: week 5)
- [ ] QA sign-off completed (owner: QA lead, deadline: week 5)
- [ ] In-app announcement modal QA'd across browsers (owner: design, deadline: week 5)
- [ ] Three contingent sales deals briefed (owner: sales lead, deadline: week 5)

Launch day checklist:
- [ ] Feature flag enabled for soft launch segment (week 5)
- [ ] In-app announcement deployed
- [ ] Email send confirmed (no test send delivered to real users)
- [ ] CS monitoring Intercom for Team Spaces questions
- [ ] Error rate baseline established in monitoring dashboard

Post-launch monitoring:
- D+1: check error rates, CS ticket volume, Slack integration errors
- D+7: soft launch adoption (target: 15% of paying customers have created a Space)
- D+30: GA adoption (target: 40% of paying customers have created a Space)

Rollback plan:
- If P0 bug found post-launch: disable Team Spaces feature flag, send in-app notification to affected users, resolve before re-enabling
- If legal review fails: delay GA until updated terms are published; soft launch still proceeds for existing customers under current terms if legal confirms acceptable

Stakeholder communication plan:
- Engineering lead: daily sync in final week before soft launch
- Sales (3 contingent deals): briefed at week 5 on GA date confirmation
- CS team: enablement complete by week 5, Slack channel for launch-day escalations
- CEO/leadership: week 4 status update, GA announcement on launch day

Confidence level:
Context-informed
