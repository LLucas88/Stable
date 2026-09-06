## Input
We're building a feature for our fitness app that uses AI to analyze users' workout patterns and flag when they appear to be "overtraining." The alert goes to the user and optionally to a coach or parent if the user is under 18. The feature uses heart rate data from connected wearables, workout frequency, and rest day patterns. Business goal: increase engagement and differentiate from competitors. User groups include adults (18+), teenagers (13-17), and competitive athletes. We've had internal debate about whether this crosses into medical advice territory.

## Expected output
Affected user group map (including vulnerable groups):
- Adults (18+): primary segment, generally able to make autonomous health decisions
- Teenagers (13-17): minor users, more vulnerable; parental/coach notification raises consent and autonomy questions
- Competitive athletes: may be predisposed to dismiss overtraining alerts due to performance pressure; may interpret false positives or false negatives as product failures
- Users with eating disorders or exercise addiction: alerts may interact badly with existing psychological patterns; this group is at-risk and not explicitly identified in the current design

Potential harm identification by type and severity:

| Harm type | Description | Likelihood | Severity |
|---|---|---|---|
| Medical misinterpretation | User interprets AI alert as clinical diagnosis; takes action (rest, doctor visit) based on non-clinical signal | Medium | Medium to high (health decision driven by potentially inaccurate model) |
| False positive harm | User receives alert incorrectly; may reduce training before an important competition | Medium | Medium for average user, high for competitive athlete |
| False negative harm | User with genuine overtraining receives no alert; condition worsens | Low-medium | Medium |
| Autonomy violation (minors) | Teen's workout data shared with parent without teen's meaningful consent | Medium | Medium (teen may avoid app or hide behavior to avoid parental oversight) |
| Amplified harm for at-risk users | User with exercise addiction uses the app to document "non-overtraining" behavior to justify continued overtraining | Low | High |
| Privacy harm | Health and biometric data shared with third parties (coaches, parents) without clear user understanding | Medium | Medium |

Ethical evaluation across frameworks:

Utility (greatest good for greatest number):
For most users, an overtraining alert is genuinely helpful. The majority benefit outweighs the minority harmed by false positives if the model is accurate. However: if the model is not validated and false positive/negative rates are high, the utility calculation reverses.

Rights (user autonomy and consent):
Adults have a right to make decisions about their own health. The alert respects this if it is advisory, not prescriptive. The minor-to-parent data sharing raises consent concerns: whose data is it, and who consented to sharing it?

Fairness (who bears the cost vs. who benefits):
Competitive athletes and at-risk users bear disproportionate risk from false positives and system interactions. They are not the majority of users but could be harmed more significantly.

Care (who is most vulnerable):
Teenagers and users with exercise addiction or eating disorders are most vulnerable. The feature design doesn't appear to have a specific plan for these groups.

Benefit and burden distribution:
Benefits: most casual fitness users get useful health guidance.
Burdens: competitive athletes, at-risk users, and teens face higher-risk interactions with the feature that aren't adequately designed for.

Recommended adjustments to reduce harm:
1. Add explicit medical disclaimer: "This feature is not a medical diagnosis. Consult a healthcare professional for health decisions." Make it visible, not buried.
2. Redesign minor user notifications: require explicit opt-in consent from the teen themselves (not just parents) for parental sharing. Consider making coach/parent visibility toggleable by the teen.
3. Validate model accuracy before launch: publish internal false positive/negative rates. If validation isn't complete, launch as a "beta" feature with clear uncertainty framing.
4. Add at-risk user screening prompt: include an optional self-identification mechanism for users who may have disordered exercise patterns and provide specialized messaging or human escalation for these users.
5. Remove "business goal: increase engagement" from the feature's internal framing: a feature that surfaces health alerts should be designed around user wellbeing first. Engagement metrics on a health alert feature can create perverse incentives.

Escalation triggers (when this needs leadership or legal input):
- Before launch: legal should confirm whether the feature constitutes "medical device" functionality under FDA (US) or MDR (EU) regulations — AI-based health analysis may trigger these frameworks
- Minor data sharing: legal should review data processing consent for under-18 users under GDPR (if EU users are included) and COPPA (if US under-13 users are included)
- Any athlete partnership or sponsored content connection: creates additional conflicts between commercial and user health interests
