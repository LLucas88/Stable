## Input
We're launching an international expansion of our EdTech platform — adding Turkish and Brazilian Portuguese language support and local payment methods in Turkey and Brazil. Timeline: 3 months. Key dependencies: localization vendor, local payment processor integration, GDPR-equivalent compliance in Turkey (KVKK) and Brazil (LGPD). Our current team has no experience in these markets. Marketing launch is tied to local school term starts in September.

## Expected output
Risk inventory by category:

Technical risks:
- Payment processor integration complexity (Turkish and Brazilian processors may have different API standards and sandbox environments)
- Localization quality (machine + human translation may miss cultural nuances in educational content)
- Infrastructure latency in both regions if servers are EU/US-based

Market risks:
- Demand assumption: assumption that Turkish and Brazilian users will adopt at similar rates to existing markets — unvalidated
- Competitive landscape: local EdTech competitors may have entrenched positions in both markets
- September launch timing: if the school term start is the hard deadline, any delay means missing the adoption window

Execution risks:
- Vendor dependency: localization vendor delivery timelines may slip
- No local market expertise on the team: decisions about UX, pricing, and go-to-market are being made without local knowledge
- Compliance unknowns: KVKK and LGPD requirements may require product or data architecture changes that aren't scoped

Organizational risks:
- Team bandwidth: 3-month timeline for two simultaneous market launches with a team that has no prior international expansion experience is aggressive
- Knowledge concentration: if the PM managing this initiative leaves, there's no backup

Risk register:

| Risk | Likelihood | Impact | Severity | Trigger | Owner | Mitigation | Contingency |
|---|---|---|---|---|---|---|---|
| Payment processor integration exceeds 3-month timeline | High | High | Critical | Engineering signals delay in week 4 | Engineering lead | Run technical spike in week 1; lock contract with processor by week 2 | Phase launch: launch Turkish + Brazil content without local payment (card only) if processor integration isn't complete; add local payment in v2 |
| Localization quality too low for educational content | Medium | High | High | User testing feedback in week 8 | PM | Allocate native-speaker review budget; define quality bar before vendor contract | Delay content launch for the affected language until quality meets bar |
| KVKK/LGPD compliance changes require product changes | Medium | High | High | Legal review week 2 identifies new requirements | Legal + PM | Legal review must complete by end of week 2; compliance requirements feed into sprint 1 scope | Delay market launch if compliance cannot be met by September |
| September launch misses school term due to any slip | High | High | Critical | Any major dependency misses week 8 checkpoint | PM | Weekly checkpoint reviews; launch checklist with hard go/no-go date | Launch to pilot cohort only (waitlist-based) rather than full public launch |
| No local market insight leads to wrong pricing | Medium | Medium | Medium | Conversion data in first 2 weeks post-launch is below 50% of target | PM | Local market pricing research in first 2 weeks; pricing validation with 10 prospective users per market before launch | Adjust pricing in week 4 post-launch based on data |
| Localization vendor slips | Medium | High | High | Milestone missed in week 5 | PM | Contractual milestone payment tied to delivery; weekly check-ins | Reduce scope to core content only if vendor slips |

Priority risk list:
1. Payment integration complexity (Critical — blocks full launch)
2. September timing dependency (Critical — business cost of missing window)
3. KVKK/LGPD compliance (High — legal obligation)
4. Localization quality (High — product quality and trust)
5. No local market expertise (Medium — affects all market-facing decisions)

Monitoring plan:
- Week 1: payment processor technical spike; legal review kickoff
- Week 2: legal review complete; processor integration contract signed
- Week 4: localization first draft review; payment integration milestone 1
- Week 8: user testing on localized content; compliance checklist verified
- Week 10: go/no-go decision based on compliance, integration, and localization quality

Escalation triggers:
- If payment integration is not contracted by week 2: escalate to leadership with contingency plan
- If legal review identifies unresolved LGPD/KVKK blockers by week 3: escalate with decision options
- If any risk reaches Critical status by week 8: consider staged launch (one market, not both)
