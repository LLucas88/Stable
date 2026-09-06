## Input
We run Clover, a telehealth app for scheduling and attending video consultations. We've redesigned the appointment booking and pre-visit intake flow and have a clickable prototype in Figma. We want to test it before development.

The flow: find a doctor → select time slot → fill pre-visit intake form (symptoms, medications, insurance) → confirm appointment → receive confirmation with video call link.

Prototype covers 8 screens. The intake form has 3 steps (symptoms, medications, insurance upload).

Target users: patients aged 30–60 who have used telehealth at least once before.

Hypotheses about friction:
- The intake form is too long and users will abandon before confirming
- Users might not understand that they need to complete intake before the appointment (not during)
- Insurance upload (photo of card) might confuse users who haven't done it digitally before

We can recruit 6 participants through our existing patient panel. Sessions will be moderated, remote, via Zoom. We have 1 week to run all sessions.

## Expected output
Test tasks and success criteria:

Task 1: Book an appointment with a general practitioner
- Scenario: "You've been having headaches for a few days and want to see a doctor online. Find a GP and book a time that works for you."
- Success criteria: Participant selects a doctor and time slot without assistance. Completed within 3 minutes.

Task 2: Complete the pre-visit intake form
- Scenario: "Before your appointment, you need to fill out some health information. Complete the intake form."
- Success criteria: Participant completes all 3 steps (symptoms, medications, insurance) without assistance. Completed within 5 minutes.

Task 3: Upload insurance card
- Scenario: "The form asks you to upload a photo of your insurance card. Show me how you'd do that."
- Success criteria: Participant locates the upload function and understands the expected action. (Since this is a prototype, observe whether the interaction is discoverable, not actual upload.)

Task 4: Find your appointment confirmation
- Scenario: "You've booked your appointment. Find the details — when is it, and how will you join the video call?"
- Success criteria: Participant can locate the date/time and video call link on the confirmation screen.

Task 5: Reschedule your appointment
- Scenario: "Something came up. Find where to change your appointment time."
- Success criteria: Participant locates the reschedule option within 1 minute.

Testing method and participant criteria:
- Method: Moderated, remote (Zoom screen share with prototype)
- Participants: 6 patients, aged 30–60, used telehealth at least once
- Screening: exclude Clover employees, healthcare professionals, and anyone who worked on the redesign
- Schedule: 2 sessions per day over 3 days
- Session duration: 45 minutes (5 min intro, 30 min tasks, 10 min debrief)

Test script outline:
1. Introduction (5 min): Explain the session — we're testing the design, not you. Think aloud. No right or wrong answers. Recording consent.
2. Warm-up (3 min): Tell me about the last time you booked a doctor's appointment online. What was that like?
3. Task 1: Book appointment (7 min)
4. Task 2: Complete intake form (10 min)
5. Task 3: Upload insurance card (5 min)
6. Task 4: Find confirmation details (3 min)
7. Task 5: Reschedule (5 min)
8. Debrief (7 min): What stood out? What was confusing? What would you change? Would you use this? How does it compare to other telehealth apps you've used?

Observation template:
For each task, note:
- Completed without help? (yes/no)
- Time to complete
- Errors or wrong paths
- Verbal reactions and quotes
- Emotional signals (hesitation, frustration, confidence)
- Where they looked first (especially for tasks 3 and 5)

Post-test analysis approach:
- Findings organized by severity:
  - Critical: blocks task completion (participant cannot proceed)
  - Major: causes significant confusion or errors (participant recovers but with difficulty)
  - Minor: noticeable friction but doesn't affect completion
- Map findings to specific screens and UI elements
- Compare against the 3 friction hypotheses (intake length, timing confusion, insurance upload)

Recommended fixes format:
For each finding: problem statement, affected screen(s), evidence (participant count + quotes), severity, recommended fix
