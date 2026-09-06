## Input
We want to audit our AI recommendation feature. It's been live for 3 months. It recommends articles to users based on their reading history. We don't have formal AI governance standards yet.

## Expected output
Audit scope:
Article recommendation feature, 3 months live. Audit period: 3 months of operation.

Standards applied:
No formal company standards defined yet — audit will use general responsible AI standards as the framework: fairness, transparency, accountability, safety, privacy.

Note: without formal governance standards, this audit can identify gaps but cannot produce a definitive "compliant / non-compliant" verdict. It will produce a gap assessment and recommendations.

Findings by dimension:

Fairness:
UNKNOWN — cannot assess without disaggregated data. Key questions: does the recommendation algorithm produce systematically different content distribution for any user group? Is the content ecosystem diverse enough that the algorithm isn't over-amplifying a narrow set of publishers? These require data that hasn't been gathered.

Transparency:
PARTIAL GAP — it is unclear whether users know that recommendations are algorithmically generated vs. editorially curated. If the distinction isn't communicated, users may have a false impression about recommendation objectivity.

Accountability:
GAP — no governance standards means no named owner for fairness, safety, or quality. Who reviews the recommendation algorithm's behavior? This is unclear.

Safety:
LOW RISK — for an article recommendation feature, the primary safety concern is whether harmful or extreme content could be surfaced. Confirm whether a content allowlist or blocklist is implemented to prevent harmful publishers from being recommended.

Privacy:
UNKNOWN — reading history is behavioral data. How long is it retained? Is it used only for recommendations or also for other purposes? These need documentation.

Gap severity:
- Fairness (unknown): must be assessed before the feature scales
- Transparency: minor-medium depending on user expectations
- Accountability: medium — no governance framework means no formal oversight
- Privacy: minor until retention and use policies are confirmed

Remediation recommendations:
1. Define governance principles before the next audit (so the next audit can produce a real verdict)
2. Add a label indicating content is algorithmically recommended
3. Assign a named owner for recommendation quality and any user complaints
4. Document what reading history data is retained and for how long

Overall audit verdict:
Cannot produce a formal verdict without governance standards. The feature appears low-risk based on the available information, but the lack of governance documentation means this is informal judgment, not a compliance assessment.

Confidence level:
Context-informed
