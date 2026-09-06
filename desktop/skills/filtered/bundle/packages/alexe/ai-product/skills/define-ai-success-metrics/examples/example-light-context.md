## Input
We're adding an AI chatbot to our app. We want to track if it's working. What metrics should we use?

## Expected output
AI chatbot success metrics depend on what the chatbot is supposed to do. A chatbot for customer support has different success metrics than a chatbot for product discovery or onboarding guidance.

That said, here is a general framework applicable to most conversational AI features:

---

Model quality metrics:

| Metric | Definition | Note |
|--------|-----------|------|
| Successful resolution rate | % of conversations that reach the user's goal without escalation to human | Requires defining "resolved" — often measured by whether user asks the same question again |
| Escalation rate | % of conversations handed off to a human | Lower is better (up to a point — some escalation is appropriate) |
| Abandonment rate | % of users who start a chat and leave without getting an answer | High abandonment = bot isn't meeting the question |

---

User experience metrics:

| Metric | Definition |
|--------|-----------|
| Return usage | % of users who use the chatbot more than once | If single-use, it may not be trusted |
| User satisfaction (post-chat) | CSAT question after conversation closes: "Did you get what you needed?" (Yes/No) | Fastest way to collect quality signal |
| Response time | Time from user message to bot response | Should be under 3 seconds for perceived responsiveness |

---

Business impact metrics:
- Support ticket volume: if the chatbot is for support, does ticket volume decrease after launch?
- Task completion rate (if chatbot guides a workflow): do users complete the workflow the chatbot is guiding?

---

Safety and risk metrics:
- Harmful or inaccurate responses: does the bot ever give wrong information? How do you catch it? (Manual review sample, user-reported flags)
- Out-of-scope handling: when a user asks something the bot can't answer, does it gracefully escalate or does it hallucinate an answer?

---

Primary metric (to define based on your use case):
What is the chatbot trying to help users do? That determines the primary metric. Without knowing the chatbot's purpose, the primary metric cannot be named.

Missing context needed to finalize:
- What is the chatbot's primary purpose? (Support deflection, onboarding guidance, product discovery, other)
- Is there a human fallback? (This changes escalation metric importance)
- What does "failure" look like for users of this chatbot?
