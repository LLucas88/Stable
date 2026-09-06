## Input
We have an AI feature in production: an automated lesson feedback system for our language learning app. After a student completes an exercise, the AI provides personalized written feedback (2–4 sentences) on what they did well and what to work on next.

Model: Claude 3.5 Haiku via API. Live for 6 weeks, ~45,000 feedback messages generated. Users rate feedback as helpful/not helpful after each message (optional tap). Current helpful rate: 71%.

Quality concerns: we've seen a few cases in user feedback where the AI gave generic feedback ("good job, keep practicing!") that didn't relate to the specific exercise. Also a case where the AI gave negative feedback to a student who answered correctly.

User-facing quality implications: students rely on this feedback to understand what to study next. Generic or wrong feedback erodes trust in the product and wastes the student's time.

## Expected output
Quality dimensions and definitions:

| Dimension | Definition | Why it matters |
|----------|-----------|----------------|
| Relevance | Feedback references the specific exercise, student answer, and skill being tested | Generic feedback is useless; students know when it's not about their actual response |
| Accuracy | Feedback correctly identifies whether the student's answer was right or wrong | Wrong accuracy assessment is the worst failure mode — damages trust immediately |
| Specificity | Feedback explains what specifically was wrong or right, not just "good job" | Specific feedback has pedagogical value; vague feedback does not |
| Tone appropriateness | Feedback is encouraging without being falsely positive; honest without being harsh | Language learning is emotionally sensitive; tone affects motivation |
| Length appropriateness | 2–4 sentences — not too brief to be useful, not so long users skip it | Students are mobile; long feedback gets ignored |

---

Quality thresholds:

| Dimension | Acceptable | Needs review | Unacceptable |
|----------|-----------|-------------|-------------|
| Relevance | References specific exercise | Partially relevant | Generic, could apply to any student |
| Accuracy | Correct assessment | Ambiguous | Factually wrong (correct answer marked wrong) |
| Specificity | Concrete detail present | Vague but not wrong | No specific content |
| Tone | Balanced | Overly formal or casual | Demotivating, harsh, or falsely positive |
| Length | 2–4 sentences | 1 sentence or 5–6 sentences | Under 1 or over 7 sentences |

---

Evaluation methodology:

**Human evaluation (primary)**
- Weekly: randomly sample 50 AI feedback messages (stratified: 25 from helpful-rated, 25 from not-helpful-rated)
- Two reviewers independently score each message on all 5 dimensions (1–3 scale: acceptable/needs review/unacceptable)
- Calculate inter-rater agreement; if below 80%, review rubric alignment
- Time investment: ~2 hours/week (one QA reviewer, one PM or content specialist)

**Automated signals (secondary)**
- User helpful/not helpful rate per week (current: 71%)
- Response length distribution (flag messages < 40 chars or > 300 chars)
- Keyword detection for known generic phrases ("keep practicing!", "great work!") — these pattern matches are not definitive but trigger human review
- Accuracy check automation: if exercise type has a ground-truth correct answer and AI feedback says "incorrect" when answer was correct, flag immediately (requires exercise metadata)

**Golden set evaluation (quarterly)**
- Maintain 200 reference cases with expert-labeled expected feedback quality
- Run monthly: compare current model outputs against golden set using automated rubric
- Goal: detect quality degradation after model updates or prompt changes

---

Monitoring plan:

| Signal | Frequency | Threshold for alert | Tooling |
|--------|----------|--------------------|----|
| Helpful rate | Daily | Drop below 65% | Dashboard (Mixpanel) |
| Generic phrase detection | Real-time | Any single message flagged | Logging + Slack alert |
| Accuracy error (wrong/right) | Real-time | Any single case | Immediate Slack alert to PM |
| Length anomalies | Daily | >2% of messages outside 40–300 char range | Automated report |
| Human eval score | Weekly | Any dimension averaging "needs review" across sample | Weekly QA review |

---

Alerting and escalation design:
- Accuracy error (AI marks correct answer as incorrect): immediate Slack alert → PM reviews within 2 hours → if confirmed, pause AI feedback for that exercise type, revert to static feedback until fixed
- Helpful rate drops below 65% for 3 consecutive days: escalate to product review + prompt engineering session
- Human eval finds >20% of sample scoring "unacceptable" on any dimension: immediate prompt review + model team notification

---

Iteration loop: from finding to fix:

| Finding | First response | Timeline |
|---------|--------------|---------|
| Generic phrases detected | Prompt update: add specific instruction to never use these phrases | Within 1 week |
| Accuracy errors in specific exercise types | Add exercise-type-specific prompt context; if persistent, add HITL for that type | Within 2 days |
| Tone complaints from users | Sample 20 messages from that day; review tone rubric; adjust if pattern confirmed | Within 1 week |
| Quality degradation after model update | Compare against golden set; if >10% degradation, rollback to previous model version | Within 24 hours |
- All prompt changes are versioned and tracked; no changes made without before/after comparison on 50-message sample

---

Open questions and risks:
- The helpful/not helpful signal has a 71% current helpful rate, but it's optional — response rate is unknown. If students who had bad feedback are less likely to tap "not helpful" (because they're already disengaged), the metric understates the problem.
- The accuracy error check requires exercise metadata to be passed to the AI prompt. If metadata is missing for some exercise types, accuracy checking will have blind spots.
- Quality monitoring is currently PM-led. If team grows, a dedicated QA role or data labeling partner will be needed to maintain weekly human evaluation at scale.
