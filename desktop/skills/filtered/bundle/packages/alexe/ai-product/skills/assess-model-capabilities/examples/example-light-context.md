## Input
We want to add AI to our customer support flow — something that can answer common questions automatically. We're thinking GPT-4 but not sure. What should we consider?

## Expected output
Task definition (as understood):
Automatically answer common customer support questions. "Common" suggests a defined set of questions that repeat frequently.

Before assessing which model to use, the task needs more definition:
- What type of questions? (Product how-tos? Account issues? Billing questions?) — each has different failure risk
- What happens when the AI is wrong? (User frustrated and re-contacts support? Or something higher-stakes like incorrect billing advice?)
- Does the AI need to access account data, or is it answering general questions from documentation?

These change the model choice significantly.

---

Model fit assessment (conditional on task):

**If the task is: answer FAQ-style product questions from a knowledge base**
- GPT-4 and alternatives like Claude or Gemini are all generally well-suited
- Difference between models is small for straightforward retrieval-augmented tasks
- Key capability needed: following instructions, staying grounded in provided docs, not fabricating answers
- All frontier models perform adequately here

**If the task is: access account data and take actions (cancel order, update settings)**
- Much higher stakes — model errors have real customer impact
- Requires human-in-the-loop for anything with irreversible consequences
- Model choice matters less than workflow design here (use design-human-in-loop-workflow)

---

Known failure modes for AI support (general):
- Hallucination: confidently wrong answers about product behavior the model wasn't trained on
- Out-of-scope queries: AI handles a question outside its scope rather than escalating to a human
- Tone mismatches: AI responses that feel robotic or dismissive in contexts where empathy is needed (complaints, billing issues)

---

Recommended approach:
Start with any well-supported frontier model for FAQ-style questions. GPT-4o, Claude 3.5, Gemini 1.5 are all viable starting points. Model selection matters less than:
1. Clear scope definition: what questions does the AI handle vs. escalate?
2. Escalation design: when does the AI hand off to a human?
3. Knowledge base quality: the AI is only as good as the docs you give it

Required validation before production:
- Build a test set from real historical support tickets (50 questions minimum)
- Measure: answer accuracy, escalation rate for unanswerable questions, false confidence (wrong answers delivered confidently)

Risks:
- The biggest risk is not model capability — it's scope creep. Define what the AI will and won't handle before launch, and enforce it strictly.
