## Input
We're a mid-size EdTech company (200 employees) building AI features for students aged 14-22. Current AI features: essay feedback tool, study plan generator, and a learning pace predictor that informs how content is surfaced to students. We're planning to add an AI tutor that will conduct free-form tutoring sessions. We operate in the EU and US. We have a privacy team but no dedicated AI ethics or responsible AI function. Our AI maturity is low — we've shipped 3 AI features in the past 18 months, with one incident (the learning pace predictor flagged incorrect learning difficulty levels for a cohort of students with accessibility needs).

## Expected output
AI governance principles (tailored to context):

1. Fairness: AI features must not produce systematically different outcomes for students based on demographics, disability status, or socioeconomic background.
2. Transparency: students and educators must be clearly informed when AI is generating content or making decisions that affect their learning experience.
3. Accountability: every AI feature has a named PM owner and a safety escalation path. Governance failures cannot be diffused across a team without individual accountability.
4. Safety: AI tutoring interactions must not produce content that is harmful, discriminatory, or inappropriate for a 14-22 age range.
5. Privacy: student data, especially for minors, must be protected to the highest standard. AI training on student data requires explicit consent.

Requirements per principle:

Fairness:
- Require disaggregated performance testing before launch: test outcomes across student demographics, disability status, and academic background. The learning pace predictor incident demonstrated that aggregate metrics hide subgroup problems.
- Document which populations were included in model training data
- Add fairness review to AI feature launch checklist

Transparency:
- Every AI-generated output must be labeled ("AI generated" or "Powered by AI") — students must know when they're receiving AI feedback vs. human feedback
- The learning pace predictor must disclose to students that their content is being personalized based on AI
- For the AI tutor: inform students at session start that they are interacting with AI, not a human tutor

Accountability:
- Assign a named PM as responsible for each AI feature (fairness, safety, and quality)
- Incidents involving AI features must be logged and reviewed within 5 business days by the PM owner and privacy team
- Establish a Responsible AI review process: all new AI features must complete a pre-launch governance checklist before go-live

Safety:
- AI tutor content filter: all AI tutor outputs must pass a content filter before being shown to students (no harmful, inappropriate, or discriminatory content)
- Define escalation protocol for AI tutor: if a student discloses distress, self-harm, or abuse during an AI tutor session, the system must escalate to a human and not attempt to address it with AI responses
- Age-appropriate content: the AI tutor must be tested specifically for interactions with 14-17 year olds; different safety thresholds may apply

Privacy:
- Do not train AI models on identifiable student data without explicit opt-in consent from the student (or parent for minors)
- Comply with FERPA (US) and GDPR special requirements for minors (EU)
- Privacy team must review AI training data sources before model training begins

Accountability structure:
- PM owner: accountable for AI feature quality, fairness, and safety (day-to-day)
- Privacy team: accountable for data compliance and training data review
- CPO: escalation point for governance failures with product impact
- No dedicated Responsible AI function currently — privacy team serves as de facto RAI function until headcount grows

Transparency mechanisms:
- AI labeling on all AI-generated content (implemented as a UI standard, not per-feature)
- Session start notification for AI tutor ("This session is with an AI tutor")
- Privacy policy updated to describe AI use and student data handling

Fairness criteria and assessment approach:
- Disaggregated testing required pre-launch: minimum test groups: students with and without accessibility needs; students across academic performance quartiles
- Learning pace predictor remediation (from incident): re-audit the predictor model for the accessibility student cohort; document findings and corrections before any new features that use the same predictor are launched

Audit and review process:
- Pre-launch checklist: fairness testing, safety testing, privacy review, transparency labeling — must be completed for all new AI features
- Quarterly AI feature review: PM owners review each live AI feature for quality drift, incident patterns, and user feedback
- Post-incident review: within 5 business days of any AI-related incident, PM owner + privacy team conduct root cause analysis

Escalation paths:
- Student harm (AI tutor): immediate escalation to human support + CPO within 1 hour
- Fairness or safety gap identified: PM owner escalates to CPO; feature paused if severity is High or Critical
- Privacy breach involving AI: privacy team leads response; AI feature involved is suspended pending investigation

Governance maturity level:
Basic. The company has AI features in production and a prior incident, but lacks a dedicated RAI function, formal governance checklist, or systematic fairness testing. The framework above moves from no formal governance to a documented, owned process.

Priority actions before the AI tutor launches:
1. Implement the pre-launch governance checklist (cannot launch a free-form AI tutor without it)
2. Remediate the learning pace predictor fairness issue before it's integrated into any other AI feature
3. Define the AI tutor safety escalation protocol (distress disclosure, harmful content) with the safety and legal teams
