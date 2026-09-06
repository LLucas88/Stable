## Input
We want to send a survey to our users to understand what they think about the product. We want to know if they're happy and if there's anything we should improve.

## Expected output
Primary survey question:
Not defined — "happy" and "should improve" are two different questions that need to be treated separately.

Before designing the survey, one decision is needed: what decision will this survey inform?

Options:
- If the goal is measuring satisfaction baseline: use NPS or CSAT as the primary question
- If the goal is finding improvement areas: use a targeted problem discovery question
- If both: they need to be separated into different surveys or very carefully scoped

---

Draft question set (CSAT + improvement direction):

1. How satisfied are you with [Product Name] overall?
   - Very satisfied / Satisfied / Neutral / Dissatisfied / Very dissatisfied
   - (Required — CSAT baseline)

2. What do you primarily use [Product Name] for?
   - Multiple choice with your main use cases (to segment responses)
   - (Required for segmentation — skip if you don't plan to analyze by use case)

3. What is working well for you?
   - Open text (optional)

4. What is one thing you wish [Product Name] did better?
   - Open text (optional)

5. How likely are you to recommend [Product Name] to someone like you?
   - Scale 0–10
   - (NPS — optional; pairs with CSAT to give a second satisfaction signal)

---

Question quality review:
- Questions 1 and 5 are standard and unbiased
- "What do you think?" and "What should we improve?" are too vague for a survey — replaced with specific framings above
- Keep the survey to 3–5 questions maximum. More than that will drop completion rates significantly.

---

Distribution plan (draft — needs confirmation):
- Email to all active users, or in-app to users after a key action? (This affects response quality significantly)
- Frequency: once per quarter is standard for satisfaction surveys

---

Missing information before finalizing:
- Who specifically should be surveyed? All users, paid users only, recently churned?
- What will change based on the results? Without a defined decision, the data will sit unused.
- What tooling do you have? (Affects question types and distribution options)
