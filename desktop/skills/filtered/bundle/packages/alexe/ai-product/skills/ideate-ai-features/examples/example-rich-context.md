## Input
We run an online tutoring marketplace. Tutors and students connect for live video sessions. Pain points we've confirmed from research:

Students:
- Finding the right tutor takes too long (25% of students who search don't book in the first session)
- Students don't know how to prepare for sessions; first sessions often start with re-explaining background
- Students forget key points from sessions and don't have structured notes to review

Tutors:
- Most tutors have no visibility into where students are struggling between sessions
- Writing session summaries manually after every session is 10–15 minutes of unpaid work

Product strategy direction: increase repeat booking rate (currently 34%, target 50%) and reduce time-to-first-booking.

Technical context: we have video session recordings (stored 30 days), session transcripts (generated from Whisper), and historical student performance data.

## Expected output
Problem framing for AI intervention:
Two distinct problem clusters:
1. Pre-session friction: students take too long to find and match with the right tutor; sessions start slow due to context-setting
2. Post-session friction: no structured knowledge retention for students; manual overhead for tutors

---

Idea list:

**Idea 1: AI session recap generator**
User value: After each session, students receive a 1-page summary — key concepts covered, things to practice, tutor's notes. Tutors don't write summaries manually.
AI mechanism: Transcript summarization (GPT-4o or Claude); extract action items, topic map, identified weak areas
Feasibility signal: High — transcripts already exist; summarization is well-suited for frontier models. Known risk: summary quality depends on transcript quality; noisy audio = degraded output.

**Idea 2: AI tutor matching assistant**
User value: Student answers 3 questions about their goal and current level; AI recommends the 3 tutors most likely to fit — reducing the search-to-book time
AI mechanism: Embedding-based similarity matching between student profile and tutor profiles/reviews; surface relevant tutor specializations
Feasibility signal: Medium — requires building student and tutor embedding profiles; not just keyword search. Good match quality requires validated embeddings on historical booking data.

**Idea 3: Pre-session preparation guide**
User value: 1 hour before a scheduled session, student receives an AI-generated "prep guide" — what to review, what questions to prepare, what the tutor is likely to focus on given the student's history
AI mechanism: Combine session transcript history + student performance data + tutor's typical approach (from past session notes) to generate personalized prep
Feasibility signal: Medium — more complex pipeline; requires good student performance data which may be sparse for new users.

**Idea 4: Real-time session coaching (for tutors)**
User value: During a session, the tutor sees a sidebar that suggests when to slow down ("Student has struggled with this concept in 3 prior sessions") or recommends an explanation approach
AI mechanism: Live analysis of session transcript with student history lookup
Feasibility signal: Low — real-time streaming inference is technically challenging; latency must be <2 seconds to be useful; adds complexity to already-complex video infrastructure.

**Idea 5: AI session starter**
User value: First session with a new tutor begins with an AI-generated context brief that the tutor sees: "This student's goal is X, they struggle with Y, they've had N sessions on Z topics." Eliminates 10 minutes of re-explaining background.
AI mechanism: Synthesize prior session summaries + student profile into a brief for the tutor, generated pre-session
Feasibility signal: High (if Idea 1 is built first — requires session summary data to exist)

---

Evaluation matrix:

| Idea | User value | Feasibility | Differentiation | Risk |
|------|-----------|------------|----------------|------|
| AI session recap | High | High | Medium | Low |
| AI tutor matching | High | Medium | High | Medium |
| Pre-session prep guide | Medium | Medium | Medium | Medium |
| Real-time session coaching | High | Low | Very high | High |
| AI session starter | High | High (dependent) | Medium | Low |

---

Top 3 recommended ideas with rationale:

1. AI session recap generator (Idea 1)
Highest feasibility, directly addresses the tutor overhead pain (freeing up 10–15 min/session), and creates student retention value. It also builds the data foundation (summaries) that Ideas 3 and 5 depend on. Start here.

2. AI session starter (Idea 5)
Dependent on Idea 1 shipping first. Once session summaries exist, this is a fast follow — low additional build, high tutor/student experience impact. Addresses the "first session context setup" problem confirmed in research.

3. AI tutor matching assistant (Idea 2)
Directly addresses the 25% search-no-book problem, which is a key acquisition leak. Higher build complexity but high strategic value — better matching likely improves repeat booking rates.

---

Validation steps before committing:
- Idea 1: build a prototype summary generator using 10 real session transcripts. Share with 5 students and 5 tutors. Is the summary useful or just a transcript paraphrase?
- Idea 2: validate whether students actually struggle with finding the right tutor due to search quality vs. supply gaps. If the issue is insufficient tutor supply in a niche, matching AI won't fix it.
- Idea 5: validate with 3 tutors whether a pre-session brief would change how they prepare or open a session.

Open questions:
- Do students consent to transcript processing and summary generation? (Privacy and terms of service check needed before any build)
- Is Whisper transcript quality good enough for meaningful summarization? (Sample 10 transcripts manually before building against them)
