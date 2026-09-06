## Input
We're a project management SaaS. Our revenue model: $15/seat/month for the Starter plan, $28/seat/month for Professional. NRR is 108%. Annual gross churn is 14%. Our Q3 product roadmap includes: (1) an AI task assistant feature (Professional-only), (2) a time-tracking module, (3) a guest collaborator feature allowing non-paying external users, and (4) a revamp of the onboarding flow. Commercial goal: grow NRR from 108% to 115% by year-end.

## Expected output
Initiative-to-revenue impact map:

| Initiative | Revenue impact type | Assessment |
|---|---|---|
| AI task assistant (Professional-only) | Direct — drives plan upgrades | Supports NRR goal via Starter → Professional upgrades |
| Time-tracking module | Direct if monetized, indirect if free | Depends on which plan it's included in (see flag below) |
| Guest collaborator feature | Indirect — potentially retention benefit; no direct revenue | Neutral to slightly positive for NRR if it increases team stickiness |
| Onboarding revamp | Indirect — activation → retention → churn reduction | Supports NRR via lower gross churn |

Commercial goal alignment assessment:
NRR growth from 108% to 115% requires reducing gross churn and/or increasing expansion revenue. The roadmap has one clear expansion driver (AI assistant) and two items that support retention (onboarding, guest collaborators). Time-tracking's revenue impact depends on plan placement — this is the most important open question.

Conflict flags:
1. Guest collaborator feature: allowing unlimited non-paying external collaborators could reduce the incentive for organizations to purchase additional seats for external stakeholders. If guests can access the full product without paying, seat expansion slows. This directly conflicts with the NRR goal if not carefully scoped. Recommended constraint: guests should have view-only or limited action permissions, preserving the incentive to add paid seats for active contributors.

2. Time-tracking module: if this is added to the Starter plan as a free feature, it removes one potential reason for Starter users to upgrade to Professional. If the goal is increasing Starter → Professional upgrades, time-tracking should be Professional-only or available as a paid add-on.

Commercial friction points from product gaps:
- 14% annual gross churn is the biggest drag on NRR. The onboarding revamp addresses one cause, but churn at this level often has multiple drivers (fit, adoption, competitor). The roadmap has no discovery work on churn root causes — this is a gap for the commercial team.
- No expansion motion visible beyond plan upgrades. Seat-based pricing requires seat growth to generate expansion — there's no usage-based component that could drive NRR independently.

Alignment recommendations:
1. Make the AI task assistant the Q3 expansion flagship: position it as the primary reason for Starter → Professional upgrades. Ensure it's prominently marketed within the product at renewal and to free trial users.
2. Gate time-tracking behind Professional (or add-on): protecting the upgrade motivation for this feature aligns with the NRR goal.
3. Scope guest collaborators with a seat conversion hook: allow 3-5 guests for free, then prompt seat conversion for frequent contributors. This turns the feature from neutral to an NRR driver.
4. Add churn root cause analysis to the roadmap: the onboarding revamp addresses activation-stage churn, but 14% annual gross churn likely has multiple sources. CS should provide data on churn reasons before the onboarding revamp is scoped.

Priority adjustments suggested:
The AI assistant and onboarding revamp are well-aligned with commercial goals. Guest collaborator needs scoping with a commercial constraint before shipping. Time-tracking placement decision should be made before development starts.
