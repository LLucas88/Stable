## Input
We're launching a mobile push notification feature for our fitness app (iOS + Android). It's a general availability launch targeting all 180k active users. Launch is in 3 weeks.

Teams involved: product, iOS engineering, Android engineering, backend, design, content, CS, marketing, legal.

Context:
- Feature is in beta with 2k users. No P0 bugs. Two known minor issues tracked.
- Push permission prompts need to comply with iOS 17 requirements — legal hasn't reviewed yet.
- CS has no documentation on how to handle "I'm getting too many notifications" complaints.
- We don't have rollback logic — if we need to disable push, it's a hotfix deploy.
- Marketing wants to send an email announcement the same day as launch.
- Past launch post-mortem: we forgot to update the app store description last time.

## Expected output
Pre-launch checklist by function:

Product:
- [ ] Beta exit criteria confirmed — no P0/P1 bugs (owner: PM, deadline: week 1)
- [ ] Two known minor issues triaged and accepted or fixed (owner: PM + eng, deadline: week 2)
- [ ] App store description updated for both iOS and Android (owner: content, deadline: week 2)

Engineering (iOS + Android + backend):
- [ ] iOS 17 push permission prompt reviewed and tested (owner: iOS eng, deadline: week 1)
- [ ] Android push delivery rate validated on beta cohort (owner: Android eng, deadline: week 1)
- [ ] Feature flag ready for controlled rollout (owner: backend, deadline: week 1)
- [ ] Rollback plan documented — feature flag disable path confirmed (owner: eng lead, deadline: week 2)

Legal:
- [ ] iOS 17 notification permission flow reviewed for compliance (owner: legal, deadline: week 2)
- [ ] Privacy policy updated if push tracking data is collected (owner: legal, deadline: week 2)

CS:
- [ ] FAQ document for push notification complaints (owner: CS lead, deadline: week 2)
- [ ] Escalation path for opt-out issues or notification bugs (owner: CS + eng, deadline: week 2)

Marketing:
- [ ] Email announcement drafted and reviewed (owner: marketing, deadline: week 2)
- [ ] Send timing confirmed — not same hour as feature flag enable (owner: PM + marketing, deadline: week 3)

Go/no-go criteria:
- No P0 or P1 bugs in production
- Legal sign-off on iOS permission flow
- CS documentation complete
- Feature flag rollout path tested
- App store descriptions updated

Launch day checklist:
- [ ] Feature flag enabled at 10% rollout, monitor for 2 hours
- [ ] Error rate and push delivery rate checked before expanding rollout
- [ ] CS team on standby in Slack channel
- [ ] Marketing email scheduled (not same moment as rollout)
- [ ] App store updates submitted (takes up to 24h to propagate)

Post-launch monitoring:
- D+1: push delivery rate, opt-out rate, CS ticket volume
- D+7: push engagement rate per notification type, uninstall rate vs. baseline
- D+30: retention delta for users who opted in vs. opted out

Rollback plan:
- Disable push feature flag for new users (existing opt-ins continue receiving)
- If bug affects all users: hotfix deploy required — 4-6h estimated
- Communication: in-app message to affected users if delivery fails at scale

Communication plan:
- Engineering leads: daily sync in final week
- CS: enablement complete by week 2, Slack channel for launch day
- Marketing: send approval from PM before email goes out
- Legal: sign-off documented and stored
