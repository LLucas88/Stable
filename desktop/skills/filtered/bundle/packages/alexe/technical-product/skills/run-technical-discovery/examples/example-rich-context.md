## Input
We're planning to add AI-generated lesson recommendations to our EdTech platform. The AI would analyze a student's performance history and suggest the next lesson from a catalog of 3,000+ lessons. This is a new capability for us — we've never built anything ML-based. We want to run technical discovery before committing to a timeline.

Key technical questions engineering raised:
1. Can we build this in-house or do we need a third-party ML service?
2. What data do we have that's actually useful for recommendations, and is it clean enough?
3. What latency can we realistically achieve for recommendation generation? (Product wants <500ms)
4. What does the cold start problem look like for new students with no history?

Engineering capacity for discovery: 2 engineers available. No ML specialist on the team.

Current system: Python backend, PostgreSQL, student performance data collected since 2019 (4 years).

Desired time box: 2 sprints (4 weeks).

## Expected output
Technical questions to resolve:

Q1: Build in-house vs. third-party ML service
This determines the entire architecture and cost model. Key unknowns: what third-party recommendation services exist and at what cost/quality? What would in-house require (data pipeline, model training, infrastructure)? Time box: 1 week, one engineer.

Q2: Data quality assessment
A recommendation system is only as good as its training data. Key unknowns: how consistent is the performance data schema across 4 years? Are there gaps (e.g., students who switched lesson tracks)? What features are available (time per lesson, score, completion rate, lesson type)? Time box: 1 week, one engineer, output: data quality report with usable vs. unusable fields.

Q3: Latency feasibility
<500ms is a tight constraint for ML inference. Key unknowns: what does inference latency look like for third-party services? If building in-house, can we pre-compute recommendations asynchronously (so the recommendation is ready before the student finishes the current lesson)? Time box: 1 week, depends on Q1 answer.

Q4: Cold start problem
New students have no history. Key unknowns: can we use onboarding data (stated goals, level test results) to seed initial recommendations? What do students do without a recommendation (browse catalog, give up)? Time box: 2 days, product + engineering joint session.

Discovery time box: 4 weeks (2 sprints)

Week 1 (parallel tracks):
- Engineer A: third-party ML service evaluation (3 candidates, API test, cost estimate)
- Engineer B: data quality audit (schema analysis, completeness check, usable feature list)

Week 2:
- Engineer A: latency test for top 2 third-party services + async pre-computation feasibility
- Engineer B: cold start options research; PM: user behavior analysis (what do new students do without recommendations?)

Week 3: synthesis — joint session: build vs. buy recommendation draft, latency options, cold start approach
Week 4: discovery readout, decision document, scope for delivery planning

Definition of done:
1. A clear build vs. buy recommendation with cost estimates
2. A confirmed usable data schema for the recommendation model
3. A realistic latency estimate (with the approach that achieves it)
4. A cold start mitigation approach
5. An architecture sketch that engineering is confident enough in to estimate delivery

Without these five outputs, discovery is not complete and delivery planning cannot begin.

Spike tasks or experiments per question:

Q1: Build vs. buy
- Spike: API test with 2 third-party recommendation services (AWS Personalize, a specialist service). Feed 1,000 sample student records; measure recommendation quality subjectively. Record pricing at estimated scale.
- If third-party: spike ends here; move to integration design
- If build in-house: second spike — can a simple collaborative filtering model be trained on our data in a week? (Feasibility test, not production code)

Q2: Data quality
- Spike: SQL analysis of the student_performance table — completeness by year, schema changes, null rates on key fields
- Output: a simple table of usable features with coverage %. If coverage is below 50% for any key field, flag as a risk.

Q3: Latency
- Spike: time a third-party recommendation API call end-to-end from our backend
- Spike: prototype async pre-computation — compute recommendation in the background when the student starts a lesson, store it; retrieve it when needed. Measure whether this is architecturally feasible with the current backend.

Q4: Cold start
- Research + product input: what data do we collect at onboarding? Can it seed a default recommendation track? PM to propose 2-3 approaches for engineering to evaluate feasibility.

Documentation and sharing plan:
- Each spike produces a 1-page write-up: what was tested, what was found, recommendation
- Stored in Notion under "AI Lesson Recommendations / Technical Discovery"
- Shared with PM within 24 hours of completion (async)

Discovery readout format:
60-minute session at end of week 4:
- 15 min: data quality findings (what we can work with)
- 15 min: build vs. buy recommendation with cost and tradeoff analysis
- 15 min: latency approach and cold start solution
- 15 min: architecture sketch + confidence level for delivery estimate

Output of readout: a decision on build vs. buy, and a green/yellow/red status for each technical question. Red means: not resolved, delivery cannot begin.

Decision points that discovery will unlock:
- Whether to use a third-party ML service or build in-house (affects cost model, team skills needed, timeline)
- Whether to recommend features to all students or only those with 30+ days of history (cold start threshold)
- Whether the <500ms latency target is achievable and with what approach
