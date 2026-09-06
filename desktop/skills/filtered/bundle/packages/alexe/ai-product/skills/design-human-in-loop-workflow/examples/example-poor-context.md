## Input
How do I add human review to my AI feature?

## Expected output
Human-in-the-loop design requires knowing what the AI feature does and what the stakes are.

What is needed:
- AI feature description: what workflow does the AI operate in? What does it produce?
- Stakes level: what happens if the AI is wrong? (Minor inconvenience? Customer harm? Legal or financial risk?)
- User segment: who is affected by AI decisions?

Without knowing the stakes, it's impossible to say how much human oversight is needed.

Low-stakes AI features (content recommendations, writing suggestions) need minimal oversight.
High-stakes AI features (medical advice, financial decisions, content moderation) need robust human review.

Suggested next inputs:
- "The AI feature [description of what it does]"
- "If the AI makes a mistake, the consequence is [outcome]"
- "The volume is approximately [N decisions / actions per day]"
