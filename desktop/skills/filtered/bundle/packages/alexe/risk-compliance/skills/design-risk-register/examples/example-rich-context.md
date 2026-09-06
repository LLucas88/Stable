## Input
We just completed a pre-mortem for our AI-powered content recommendation engine. The top risks identified: (1) recommendation quality degrades over time as user behavior shifts, (2) the system may amplify harmful or biased content, (3) single ML engineer dependency, (4) third-party model provider could change pricing or availability. The initiative spans 6 months, cross-functional team of 5, governance process requires monthly risk review at team level and quarterly at leadership level. The PM owns the register.

## Expected output
Risk register scope and taxonomy:

Scope: AI content recommendation engine initiative (6 months)
Risk taxonomy:
- Model quality: risks related to recommendation relevance and accuracy over time
- Safety and ethics: risks related to harmful or biased outputs
- Organizational: team and knowledge risks
- External dependency: third-party risks
- Legal/compliance: regulatory risks related to AI content recommendations

Risk entries:

| Risk ID | Risk | Category | Likelihood | Impact | Severity | Trigger | Owner | Mitigation | Contingency |
|---|---|---|---|---|---|---|---|---|---|
| R-01 | Recommendation quality degrades as user behavior shifts | Model quality | Medium | High | High | Quality score below baseline on weekly eval; user engagement rate drops >10% for 2+ weeks | ML Engineer | Monthly model retraining on fresh user data; offline evaluation pipeline automated | Fallback to editorial content curation; alert PM if degradation persists >3 weeks |
| R-02 | System amplifies harmful or biased content | Safety/ethics | Medium | High | Critical | Content safety incident reported by user or moderator; harmful content in top-10 recommendations | PM + Trust & Safety lead | Content filtering layer before recommendations served; weekly safety audits on sampled outputs | Disable recommendations for affected content categories; engage responsible AI review |
| R-03 | Single ML engineer: departure or incapacity creates knowledge gap | Organizational | Medium | High | High | ML engineer leaves or is unavailable for >5 days | PM | Documentation requirement: all model training and deployment steps documented by month 2; second engineer cross-trained on model update process | Engage external ML consultant for critical path items; extend timeline |
| R-04 | Third-party model provider changes pricing or availability | External dependency | Low | High | High | Provider announces pricing change or service disruption | Engineering lead | Multi-provider architecture (evaluate 2nd provider in month 1 as fallback option); contractual SLA | Switch to fallback provider; temporary reduction in recommendation sophistication acceptable |
| R-05 | Regulatory requirements for AI content recommendations emerge during initiative | Legal/compliance | Low | Medium | Medium | EU AI Act or similar regulation announced that applies to content recommendation systems | PM + Legal | Monitor AI regulation updates quarterly; legal review of EU AI Act applicability in month 1 | Adjust transparency and explainability features if regulation requires; plan 2-4 week adjustment buffer |

Update and review cadence:
- Weekly: ML engineer updates status on R-01 (quality monitoring) and flags any R-02 incidents
- Monthly: PM leads team-level risk review — all entries reviewed and updated; new risks added
- Quarterly: PM presents risk register to leadership — focus on Critical and High severity open risks

Escalation criteria and path:
- Critical severity: escalate to leadership immediately when trigger fires; do not wait for scheduled review
- High severity trigger fires: escalate to PM + team lead within 24 hours; team review within 48 hours
- New risk identified mid-initiative: PM assesses severity within 1 week; adds to register

Archive criteria:
- A risk is archived when: the trigger condition is no longer possible (e.g., feature shipped and relevant window passed), the mitigation has been fully implemented and the risk is reduced to low severity, or the initiative has concluded
- Archived risks are moved to a separate "closed" tab but not deleted

Risk register owner:
PM is the owner. The register is the PM's responsibility to maintain, circulate, and escalate from. It is not a shared-ownership document.
