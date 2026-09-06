## Input
We run a freelance marketplace focused on design work. We're considering an AI feature: "AI Brief Generator" — when a buyer wants to post a project, instead of filling a long brief form (currently 8 fields, takes 10–15 minutes), they answer 3 conversational questions via chat and the AI generates the brief for them.

Target users: first-time buyers on the platform (accounts with 0 completed projects). Currently, 34% of new buyers who start a brief don't complete it. Among those who complete a brief, conversion to a hired freelancer is 62%.

Existing user behavior: new buyers don't know what information freelancers need. They under-specify (too vague) or over-specify (walls of text). Either way, freelancers ask clarifying questions, slowing the process.

No user research yet on this idea. We've heard the problem anecdotally from 3 buyers and from CSMs.

## Expected output
User problem statement:
New buyers don't know how to write a design brief that gives freelancers enough to work with. The current 8-field form requires them to already know what a good brief contains. 34% abandon the form entirely, and those who complete it often produce briefs that generate clarifying questions and slow down the hiring process.

Current user behavior without AI:
- First-time buyers spend 10–15 minutes on a form they're unsure how to fill out
- Many leave fields incomplete or vague ("I need a logo — something modern")
- Freelancers respond to vague briefs with questions, adding 1–3 days before the project can start
- Some buyers never return after abandoning the brief form

AI-delivered outcome (user-centric):
A first-time buyer answers 3 simple questions ("What do you need designed?", "Who is it for?", "What style or references come to mind?") and receives a structured brief that freelancers can immediately act on — without needing to know what information freelancers need in advance.

Business value translation:
- Brief completion rate increases: fewer abandoned briefs → more projects posted → more supply-demand matches
- Downstream conversion: higher-quality briefs → fewer clarifying questions → faster project starts → higher NPS from both sides
- Primary metric to move: brief completion rate (from 66% to a target, to be set after validation)
- Secondary: time-to-first-proposal (currently unknown but measured)

Risk identification:
1. AI generates briefs that buyers accept but freelancers find worse, not better — AI may over-simplify or make assumptions that miss the buyer's actual intent. This is the highest risk and must be tested.
2. Buyers feel the AI doesn't "understand" their vision — if the generated brief feels generic, it may erode trust more than the current form
3. Over-reliance: buyers may stop thinking critically about their project needs if the AI does the work — reducing brief quality over time as the AI's outputs regress toward average

Success definition:
- Brief completion rate for new buyers: +10 percentage points in 60 days post-launch
- Freelancer satisfaction with AI-generated briefs: measured via post-brief rating (did this brief give you enough to start? Yes/No) — target >75% yes
- Time-to-first-proposal: no regression vs. current baseline (AI briefs should not slow freelancers down)

Build / don't build recommendation:
Proceed to prototype validation, not full build.

Rationale: the problem is confirmed (34% brief abandonment, anecdotal friction evidence). But the AI-generated brief quality is the critical unknown — if freelancers rate AI briefs as worse than human briefs, the whole value proposition collapses. Validate with a prototype test: generate AI briefs for 20 real projects and show them to 5–10 freelancers for quality ratings before committing to build.
