## Input
We're an EdTech platform — live tutoring sessions between students and tutors. We want to survey students after each session to understand whether they'd come back. We have Typeform. Sessions happen on our platform, so we can trigger in-app or email post-session.

Our main decision: we're trying to figure out whether session quality varies by tutor, so we can identify who needs coaching or should be off-platformed. We have 340 active tutors. Currently no systematic feedback beyond a simple 5-star rating (40% of students leave a rating, but the distribution is very skewed toward 5s — not useful).

We're worried about rating inflation if students think their review will hurt the tutor personally.

## Expected output
Primary survey question:
Would you book another session with this tutor?

Survey type and rationale:
Post-session CSAT with a behavioral intention question as the primary signal, plus qualitative follow-up. Pure satisfaction ratings (stars) are gameable and socially loaded. Behavioral intent (would you rebook?) is more predictive and harder to inflate through social pressure.

Question set (5 questions):

1. Would you book another session with this tutor?
   - Yes, definitely / Yes, probably / Probably not / Definitely not
   - (Required — this is the primary signal)

2. What worked best in this session?
   - Open text (optional — but appears before the negative question to reduce anchoring)

3. Was there anything the tutor could have done better?
   - Open text (optional — frame as improvement, not complaint)

4. How well did this session match what you expected?
   - Much better than expected / About what I expected / Somewhat below expectations / Much worse than expected
   - (Required — measures expectation gap, which is a distinct dimension from session quality)

5. Would you recommend this platform to a friend?
   - Scale 0–10
   - (NPS — included to track platform-level satisfaction separately from tutor-level)

---

Question quality review:

| Question | Bias Check |
|---------|-----------|
| Q1 (rebook intent) | Not biased — behavioral framing avoids social inflation; no leading language |
| Q2 (what worked) | Not biased — open positive question; placing it before Q3 reduces negativity anchoring |
| Q3 (what could be better) | Slightly softened ("could have done better" vs. "what went wrong") — this is intentional to reduce social pressure; tradeoff is worth it |
| Q4 (expectation match) | Not biased — comparative anchor is student's own prior expectation |
| Q5 (NPS) | Standard NPS wording — not biased |

Addressing the social pressure concern: the survey does not show the tutor's name in the survey header. Add a note: "Your response is used to improve the platform and is shared with tutors only in aggregated form." This is honest and reduces the perception that a single review will directly affect a specific tutor's income.

---

Distribution plan and trigger logic:
- Trigger: 15 minutes after session ends (not immediately — student needs time to reflect)
- Channel: in-app notification (primary) + email (fallback if no in-app click within 2 hours)
- Frequency limit: maximum 1 survey per student per 7 days (prevents survey fatigue across multiple sessions)
- Opt-out: provide opt-out from post-session surveys separately from platform emails

---

Expected response rate and sample size:
- Current star rating completion: ~40%. A post-session survey with 5 questions will likely see 25–35% completion.
- At current session volume: estimate based on your sessions per week. With 25% completion, you need at least 20 completed responses per tutor per month to make tutor-level comparisons reliable.
- If sessions per tutor per month is below ~80, monthly tutor-level data will be noisy — consider rolling 90-day averages.

---

Analysis plan:
- Primary metric: rebook rate per tutor (% responding "Yes, definitely" or "Yes, probably" to Q1)
- Segment by: tutor, session type, student tenure (first-time vs. returning), subject
- Qualitative synthesis: monthly review of Q2 and Q3 open text, coded by theme
- Alert: any tutor with rebook rate below 60% in last 30 days (minimum 10 responses) flagged for coach review
