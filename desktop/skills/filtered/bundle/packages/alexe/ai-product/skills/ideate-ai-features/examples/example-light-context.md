## Input
We have a productivity app where people manage their to-do lists and projects. We want to add some AI features. Any ideas?

## Expected output
Problem framing for AI intervention:
"Productivity app with to-do lists and projects" is broad. AI feature value depends on which specific user problem you're trying to solve. Common problems in this category:
- Users have too many tasks and struggle to prioritize
- Users forget to do things (engagement drops off)
- Users don't know which task to start next
- Adding and organizing tasks takes too much friction

These have different AI interventions.

---

Idea list (general, pending user research validation):

**Idea 1: AI task prioritization suggestion**
User value: App suggests which task the user should work on next based on deadlines, importance signals, and patterns in the user's work history
AI mechanism: Prioritization ranking model based on metadata (due dates, tags, project) + user behavior signals (what they complete vs. skip)
Feasibility signal: Medium — requires good task metadata; if tasks lack due dates or context, the AI has nothing to work with

**Idea 2: Natural language task entry**
User value: User types "Call Sarah tomorrow about the proposal" and the AI creates a task with the right due date, contact tag, and project assignment — no manual form filling
AI mechanism: NLP parsing of natural language inputs
Feasibility signal: High — well-solved problem; many implementations exist; low novelty but genuinely reduces friction

**Idea 3: AI weekly review generator**
User value: End of the week, the app shows a summary of what was completed, what got pushed, and suggests priorities for next week — without the user having to do manual review
AI mechanism: Summarize completed/incomplete tasks, detect patterns (recurring pushes = sign of wrong priority), suggest reprioritization
Feasibility signal: Medium — requires sufficient task completion history; not useful for new users

**Idea 4: Break-down suggestions for large tasks**
User value: When a user creates a large, vague task ("finish the project"), the AI suggests breaking it into sub-tasks
AI mechanism: Task decomposition based on task title and project context
Feasibility signal: High for simple decompositions; degraded quality for domain-specific complex work the AI doesn't know about

---

Top 2 recommended ideas for validation:
1. Natural language task entry — lowest risk, immediate friction reduction, well-proven pattern
2. AI task prioritization — higher impact if working well; requires validation that your users' task metadata is sufficient for the AI to reason about

---

Missing context before deeper evaluation:
- What is the primary user pain point? (Is users' main complaint "too many tasks", "forgetting things", or "hard to add tasks"?)
- What does task metadata look like? Due dates, project tags, and priority fields determine what AI features are actually possible.
- What is the user engagement pattern? (Daily users have more behavioral data for personalization than weekly users)

Open questions:
- Have users asked for AI features specifically, or is this a product team initiative?
- What is the technical stack? Does the backend support the real-time inference needed for natural language entry?
