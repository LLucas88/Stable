## Input
We've built a simple chatbot that answers questions from our help docs. We tested it internally and it seemed to work okay. Should we launch it?

## Expected output
"Seemed to work okay" in an internal test is not a sufficient basis for launching an AI feature to users.

Internal testing on a prototype typically has two blind spots:
1. Testers know the product — they ask questions in ways the AI handles well and avoid questions that expose weaknesses
2. Small samples miss the edge cases that real users will inevitably hit

Before launching, the following evaluation should be done:

---

Evaluation dimensions:

| Dimension | What to check |
|----------|--------------|
| Accuracy | Does the AI give correct answers? Does it ever confidently state something that's wrong? |
| Grounding | Are answers based on the help docs, or does the AI sometimes go beyond what's documented? |
| Failure handling | When a user asks something the docs don't cover, does the AI gracefully say "I don't know" or does it hallucinate? |
| Scope handling | What happens when users ask off-topic questions (competitor comparison, pricing not in docs, etc.)? |
| Tone | Are responses appropriately concise, or do they give paragraph-length answers to simple questions? |

---

Minimum test before launch:

1. Build a test set of 30 questions: 20 questions that should be answerable from the docs, 5 questions the docs don't cover, 5 adversarial or off-topic questions
2. Run the chatbot against all 30 questions
3. Score each answer: correct / incorrect / hallucinated / appropriate refusal
4. If accuracy is below 90% or hallucination occurs even once, don't launch

---

Success criteria to define before evaluating:
- What % of correct answers is "good enough" to launch?
- Is any hallucination acceptable, or is zero tolerance required?
- What should the chatbot do when it doesn't know the answer?

---

What "seemed to work okay" might be hiding:
- Questions asked by team members may not match the questions real users will ask
- Real user language is often vague, misspelled, or phrased unexpectedly
- The most common failure mode for help doc chatbots is confidently wrong answers on edge cases the team never thought to test

Recommendation: build the 30-question test set, run it, and set explicit pass/fail criteria before deciding to launch.
