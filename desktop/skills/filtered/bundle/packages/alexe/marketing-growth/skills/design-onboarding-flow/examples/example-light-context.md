## Input
We have a project management tool for small teams. New users sign up but most don't stick around. Onboarding is about 5 steps. We think it might be too long or confusing. Activation is roughly when a user creates their first project.

## Expected output
Activation event definition:
Creating the first project — reasonable proxy for "user has started working in the tool." However, consider whether "first project with at least one task added" is a more meaningful signal, since an empty project may not deliver value. Confirm which version better predicts Day-7 retention.

Critical path to activation:
Based on the stated activation event, the minimum path is:
1. Account creation
2. Create first project

Everything between those two steps is either necessary setup or friction. For a team tool, the question is whether inviting a teammate should be required before activation (higher bar but stronger team-use signal) or deferred.

Steps likely to defer post-activation:
- Profile photo / personal settings
- Notification preferences
- Integration setup (Slack, GitHub, etc.)
- Team billing setup (if not immediately required)

Onboarding flow structure (draft — requires confirmation of current 5 steps):
1. Account creation — keep minimal
2. "Create your first project" — surface immediately after signup, with a simple template picker to reduce blank-state friction
3. Add one task to the project — single prompt: "Add your first to-do." Low effort, reinforces the habit loop.
4. Invite a teammate (optional but promoted) — shown after first task, framed as "Work together on [project name]"

Missing information to refine this:
- What are the current 5 onboarding steps?
- Where specifically are users dropping off? (which step?)
- Is there any user research on what new users are confused about?
- Is the tool primarily for solo use or team use? (affects whether team invitation should be in the critical path)

Follow-up touchpoint plan:
- Day 1 (if no project created): email "Start with a template — your first project in under 2 minutes"
- Day 3 (if project created but no teammates): prompt to invite a team member

Success criteria for the new onboarding:
Should be defined once the activation event is confirmed and current drop-off data is available. Suggested target: activation rate from signup improves by at least 10 percentage points.

Confidence level:
Context-informed
