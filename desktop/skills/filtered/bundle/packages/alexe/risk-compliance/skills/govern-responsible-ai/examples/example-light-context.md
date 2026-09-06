## Input
We're a small startup (15 people) building an AI writing assistant. We want to make sure we're doing AI responsibly but don't know where to start. We have one AI feature live — a text autocomplete. Planning to add a tone analyzer and a content rewriter.

## Expected output
AI governance principles (minimal viable for a 15-person startup):

1. Transparency: users must know when AI is generating content.
2. Accountability: the PM or founder most responsible for AI features owns them.
3. Safety: no AI output should be harmful, deceptive, or violate user trust.
4. Privacy: user content submitted to the AI must be handled and stored appropriately.

Requirements per principle (lightweight, appropriate for stage):

Transparency: all AI-generated text must be labeled as AI-suggested. The autocomplete feature should show a clear visual indicator that distinguishes AI suggestions from typed text.

Accountability: named owner for each AI feature. At 15 people, this is likely the PM or a founding engineer. Incidents must be reviewed by the owner within 72 hours.

Safety: for the tone analyzer and rewriter, test adversarial inputs before launch — what happens if users ask the AI to rewrite something in a harmful or deceptive way? Define what the system should do and implement it.

Privacy: define what happens to user content submitted to the AI. Is it stored? Used for model training? Under what circumstances? Users should be able to find this in the privacy policy.

Accountability structure:
At 15 people, a formal Responsible AI committee is not realistic. The accountable person is whoever is building the feature. Define escalation to the CEO for any incident with user-facing impact.

Governance maturity level:
Minimal — appropriate for early stage. The goal is to establish basic documentation, labeling, and accountability before the company grows past the point where informal governance works.

Priority actions before the next AI feature ships:
1. Add AI labeling to the existing autocomplete feature if not already present
2. Write a one-page AI feature checklist that covers: safety testing, transparency labeling, privacy handling, and owner assignment — use it for every new AI feature
3. Define and publish what happens to user content in the product privacy policy

Missing information that would improve the governance plan:
- What is the target user (consumer, business, minors involved?)
- What regulations apply (EU/US/other — this affects what "appropriate governance" means)

Confidence level:
Context-informed
