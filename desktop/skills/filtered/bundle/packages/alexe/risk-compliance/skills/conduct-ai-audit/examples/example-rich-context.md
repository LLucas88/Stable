## Input
We need to audit our AI-powered job candidate ranking feature. It's been live for 8 months. The feature ranks job applicants using a model trained on historical hiring decisions. It's used by 45 HR clients who rely on it to filter applicants. There have been 2 user complaints about potentially biased rankings. We have governance principles defined (fairness, transparency, accountability, safety, privacy). Internal standard: the system must not produce systematically different ranking outcomes based on protected attributes. Audit period: 8 months of live operation.

## Expected output
Audit scope and standards applied:
Feature: AI job candidate ranking system (trained on historical hiring data)
Audit period: 8 months (live operation)
Standards applied: internal responsible AI principles (fairness, transparency, accountability, safety, privacy) + employment discrimination risk under applicable law (EEOC guidelines, EU employment law)

Evidence gathered:
- Model documentation reviewed: training data sources, feature list, model architecture, fairness testing at launch (if available)
- 8 months of production quality metrics (if logged)
- 2 user complaints about biased rankings — complaint details reviewed
- Sample of ranking outputs reviewed (requested from engineering for audit)
- Access control log for model updates (who has made changes to the model in the past 8 months)

Findings by dimension:

Fairness:
GAP — Critical. The model was trained on historical hiring decisions, which are known to encode historical bias (prior organizations hired fewer women or underrepresented minorities in some roles; the model may replicate this pattern). Pre-launch fairness testing documentation was not found. 2 user complaints about biased rankings have not been investigated or documented with outcomes. Disaggregated performance analysis (ranking outcomes by gender, race, age) has not been conducted for production data.

Transparency:
GAP — Major. HR clients using the tool do not receive information about how rankings are generated or what factors the model uses. Applicants whose applications are filtered by AI are not informed that AI was involved in the screening process. Under EU law (GDPR Art. 22), automated decision-making that significantly affects individuals may require disclosure and a right to explanation.

Accountability:
GAP — Minor. A named PM owns the feature. However, the 2 user complaints were not reviewed within the 72-hour SLA defined in the governance framework; one complaint has been open for 3 weeks without resolution documentation.

Safety:
PASS — The feature ranks candidates; it does not generate content or interact directly with applicants. No safety incidents identified beyond the fairness concern.

Privacy:
GAP — Major. The training data included historical candidate profiles. It is unclear whether candidates from that historical dataset consented to their data being used for model training. Under GDPR, consent for this use may be required. This requires legal review.

Gap severity classification:

| Gap | Dimension | Severity |
|---|---|---|
| No disaggregated fairness analysis for production data | Fairness | Critical |
| Bias from historical training data not assessed or mitigated | Fairness | Critical |
| No transparency to applicants about AI involvement | Transparency | Major |
| No transparency to HR clients about model factors | Transparency | Major |
| Historical training data consent unknown | Privacy | Major |
| User complaint SLA not met | Accountability | Minor |

Remediation recommendations with owners and timelines:

| Recommendation | Owner | Timeline |
|---|---|---|
| Commission disaggregated fairness analysis on 8 months of production data (gender, race, age ranking outcomes) | ML Engineer + PM | 4 weeks |
| Investigate and respond to both user complaints formally | PM | 1 week |
| Add applicant disclosure: "This application was reviewed with AI assistance" | Product + Engineering | 3 weeks |
| Provide HR clients with model factor documentation (transparency report) | PM | 6 weeks |
| Legal review of historical training data consent | Legal | 4 weeks |
| Define and implement post-update model monitoring (detect drift or fairness degradation) | ML Engineer | 8 weeks |

Overall audit verdict:
Conditionally compliant. The feature is live and operating, but has Critical fairness gaps that represent both ethical and legal risk (employment discrimination is a regulated area). The feature should not be expanded to new clients until the fairness analysis is complete and any identified bias is addressed.

Next audit schedule:
Re-audit in 6 months following remediation. Earlier re-audit if fairness analysis reveals significant bias patterns.
