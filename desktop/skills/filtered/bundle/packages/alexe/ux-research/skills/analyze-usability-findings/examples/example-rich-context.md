## Input
We ran 6 moderated usability testing sessions for Parka, our mobile app for finding and booking coworking spaces. We tested the end-to-end booking flow: search → filter → view space details → book → confirm.

Participants: freelancers and remote workers in London, ages 25–40, all had used at least one coworking space before.

Session observations:

Session 1 (P1, freelance designer): Found search straightforward. Got confused on the filter screen — tried to tap "Amenities" but it wasn't obvious it was expandable. Booked successfully but said "I wasn't sure if I actually confirmed until I got the email." Task time: 4m 20s.

Session 2 (P2, remote engineer): Searched by location fine. On space details page, scrolled past the price without noticing it. Asked "where's the price?" before scrolling back up. Completed booking. Said the confirmation screen "doesn't feel like anything happened." Task time: 3m 50s.

Session 3 (P3, freelance writer): Got stuck on filters — tried to select "quiet space" under amenities but the checkbox didn't respond on first tap (had to tap twice). Abandoned filter and used search instead. Completed booking but missed the cancellation policy. Task time: 5m 10s.

Session 4 (P4, startup founder): Completed the flow quickly. Only issue: expected to see reviews on the space details page, couldn't find them (they're behind a separate tab). Task time: 2m 40s.

Session 5 (P5, freelance marketer): Filter screen — same expandable section confusion as P1. On booking confirmation, asked "can I add this to my calendar?" No calendar integration exists. Completed booking. Task time: 3m 30s.

Session 6 (P6, remote PM): Searched and filtered without issues. On space details, said the photos were helpful but "I can't tell how big the desk actually is." Booking went smoothly. Confirmation page — "I'd want to see the address here so I can save it." Task time: 3m 10s.

Completion rate: 6/6 completed booking (100%).
Average task time: 3m 47s.

## Expected output
Finding set:

Theme 1: Filter interaction issues
- Finding: The amenities filter section is not clearly interactive. 3 of 6 participants (P1, P3, P5) had trouble discovering that the section was expandable or tapping checkboxes reliably.
- Evidence: P1 — "it wasn't obvious it was expandable." P3 — checkbox required double-tap. P5 — same expandable confusion as P1.
- Severity: Major (causes confusion, delays task completion)
- Affected participants: P1, P3, P5

Theme 2: Weak booking confirmation
- Finding: The booking confirmation screen does not clearly signal that the booking is complete. 2 of 6 participants (P1, P2) expressed uncertainty about whether their booking went through.
- Evidence: P1 — "I wasn't sure if I actually confirmed until I got the email." P2 — "doesn't feel like anything happened."
- Severity: Major (undermines trust in a critical moment)
- Affected participants: P1, P2

Theme 3: Price visibility on space details
- Finding: Price placement on the space details page is easy to miss. 1 participant scrolled past it entirely.
- Evidence: P2 — scrolled past price, asked "where's the price?" before scrolling back.
- Severity: Minor (one participant, recovered quickly)
- Affected participants: P2

Theme 4: Missing contextual information
- Finding: Participants expected information that wasn't present or was hard to find: reviews (P4), desk size context (P6), address on confirmation (P6), calendar integration (P5).
- Evidence: P4 expected reviews on details page (hidden behind tab). P6 — "I can't tell how big the desk actually is." P6 — wanted address on confirmation. P5 — asked about calendar integration.
- Severity: Minor (did not block task, but surfaced unmet expectations)
- Affected participants: P4, P5, P6

Design recommendations:
1. Redesign the amenities filter to use visibly tappable controls (e.g., pill-style toggles or clearly styled checkboxes). Fix tap target size for checkboxes. (Addresses Theme 1 — major)
2. Redesign the booking confirmation screen: add a clear success state (checkmark animation, bold "Booking confirmed" heading), show the space address, and offer "Add to calendar." (Addresses Theme 2 — major)
3. Make price more prominent on the space details page — consider a sticky footer with price and "Book" CTA. (Addresses Theme 3 — minor)
4. Surface reviews directly on the space details page instead of behind a separate tab. (Addresses Theme 4 — minor)

Priority-ordered action list:
1. Fix filter interaction (major, affects 50% of participants)
2. Redesign confirmation screen (major, affects 33% of participants)
3. Improve price visibility (minor, quick win)
4. Surface reviews on details page (minor, moderate effort)

Quick wins:
- Fix checkbox tap targets on filter screen
- Add "Booking confirmed" heading and address to confirmation screen

Open questions for next round:
- Does the filter issue reproduce on different device sizes?
- Would a sticky price/CTA footer on the details page create new problems on smaller screens?
- How do users discover cancellation policy — P3 missed it entirely
