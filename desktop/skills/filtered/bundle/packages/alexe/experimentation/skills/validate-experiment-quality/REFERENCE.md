# Reference: Validate Experiment Quality

## Why this reference exists

This skill exists because a numerically attractive result can still be untrustworthy.

Experiment quality is not a side note.
It is part of whether the result deserves to influence a real decision.

This reference defines:
- what procedural evidence matters
- how to audit trustworthiness
- how to behave when evidence is incomplete
- which risks are fatal, manageable, or unresolved

---

## Core principle

Do not certify an experiment as trustworthy unless the procedure supports that confidence.

A result can look good and still be flawed because of:
- peeking
- flexible stopping
- allocation problems
- contamination
- external distortions
- metric mismatch
- post-hoc slicing

---

## Context model for this skill

This skill depends on procedural context, not just outcome context.

### Strong procedural context
The audit has enough evidence to evaluate reliability.

Examples:
- sample size was predefined
- stopping logic was predefined
- traffic split is known
- variant assignment behavior is known
- overlapping events are known

### Partial procedural context
Some evidence exists, but important unknowns remain.

In this case the skill should:
- audit the known areas
- make unknowns explicit
- avoid a false “all clear”

### Weak procedural context
Very little is known about how the experiment was run.

In this case the skill should:
- refuse strong certification
- provide only a limited-confidence audit
- state what evidence is missing

---

## Minimum evidence for a meaningful audit

Try to establish:
- whether sample size was predefined
- whether stopping logic was predefined
- whether interim results were monitored
- whether the test stopped early for performance reasons
- whether allocation stayed close to the intended split
- whether users could leak across variants
- whether external events overlapped the experiment
- whether planned and measured metrics matched
- whether slicing or multiple comparisons were done after the fact

If these are unknown, confidence must be reduced.

---

## Main failure modes

### 1. Peeking
The team repeatedly checks results during the test and reacts too early.

This becomes especially dangerous when:
- the test is stopped once significance appears
- the team makes decisions from temporary noise

The skill should explicitly flag this as a reliability risk.

### 2. Flexible stopping
The test does not follow a predefined stopping rule.

This weakens trust because the procedure becomes outcome-dependent.

### 3. Suspicious traffic imbalance
If the experiment was intended as 50/50 but actual allocation looks highly imbalanced without explanation, the setup may be broken.

### 4. Contamination
Users may see both variants, or spillover may distort isolation.

### 5. Metric mismatch
The team planned to measure one thing but evaluated something else after the fact.

### 6. Post-hoc slicing / multiple looks
The team may search across many segments or metrics after the test until something “works”.

This increases false-positive risk if not handled carefully.

### 7. External distortion
Campaigns, outages, launches, pricing changes, or seasonal shifts may overlap the test and bias interpretation.

---

## P-value trust rule

Classical p-value interpretation assumes the procedure is coherent.

If any of the following occurred:
- repeated peeking
- flexible stopping
- premature stopping based on interim performance
- uncontrolled multiple testing

then trust in classical p-value interpretation must be downgraded.

The skill should say that explicitly.

---

## Risk severity model

Useful categories:

### Fatal
These strongly undermine decision use.
Examples:
- stopping based on interim significance
- broken assignment logic
- severe contamination

### Manageable
These create caution but may not fully invalidate the result.
Examples:
- minor imbalance with plausible explanation
- small external noise with low expected impact

### Unresolved
Important evidence is missing, so the audit cannot be strong.
Examples:
- unknown stop rule
- unknown assignment quality
- unknown external overlap

---

## Output expectations

A meaningful output should include:
- quality verdict
- major risks
- reliability level
- fatal vs manageable issues
- recommendation
- missing procedural evidence

Possible recommendations:
- Trust
- Treat cautiously
- Rerun
- Redesign

---

## What not to do

Do not:
- reduce every bad test to “small sample size”
- certify trust when stop logic is unknown
- assume good p-value means good experiment quality
- hide missing procedural evidence
- treat absence of evidence as evidence of quality

---

## Behavioral rules under incomplete context

### If stop logic is unknown
Do not assign a high-confidence verdict.

### If allocation evidence is missing
Do not assume randomization worked.

### If the team says “we monitored results daily”
Ask whether action was taken from interim looks.
Monitoring alone is not identical to acting early, but acting early is a major risk.

### If the result looks strong but the procedure is unclear
Prefer caution over false confidence.

---

## Relationship to the overall workflow

This skill should usually follow result analysis or accompany it.

It does not replace metric interpretation.
It determines whether metric interpretation deserves decision weight.

That is the core role of this skill:
not to explain the uplift,
but to decide how much trust the uplift deserves.
