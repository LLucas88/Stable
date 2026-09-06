## Input
We're building an online tutoring marketplace. Q2 OKRs: (1) increase tutor repeat booking rate from 34% to 50%, (2) reduce first-session no-show rate from 18% to 10%.

Backlog of initiatives we're considering:

1. Instant rebooking — let students rebook same tutor immediately after a session ends
2. Session reminders — push/email reminders 24h and 1h before session
3. Tutor profile reviews — let students leave ratings after sessions
4. Match quality improvements — better tutor-student matching algorithm
5. Payment flexibility — installment options for bundle packages
6. Mobile app redesign — the mobile experience is poor overall
7. Tutor onboarding improvements — new tutors take too long to get first booking
8. Cancellation policy enforcement — automatic fee for late student cancellations

Team capacity: 2 engineers, 1 designer. One 6-week cycle.

## Expected output
Prioritized initiative list:

**Now (this cycle)**

1. Session reminders (SMS + push, 24h and 1h before session)
   - Goal mapping: directly reduces no-show rate (OKR 2)
   - Rationale: low complexity, no design dependency, high confidence on impact, can ship in ~2 weeks
   - Estimated effort: small (1 engineer, ~2 weeks)

2. Instant rebooking
   - Goal mapping: directly increases repeat booking rate (OKR 1)
   - Rationale: captures intent at highest-motivation moment (end of session), relatively contained UX change
   - Estimated effort: medium (1 engineer + designer, ~3-4 weeks)
   - Dependency: payment flow must support session credit or pre-auth

**Next (following cycle)**

3. Cancellation policy enforcement
   - Goal mapping: reduces no-show rate (OKR 2), also has revenue impact
   - Rationale: strong signal but requires legal/ops alignment and clear communication to students — more prep time needed
   - Dependency: cancellation policy must be defined and communicated before enforcement

4. Tutor profile reviews
   - Goal mapping: indirect — trust signal that may improve repeat booking over time
   - Rationale: medium effort, medium confidence on short-term KR impact; important for long-term marketplace health

**Later (not this quarter)**

5. Match quality improvements
   - Goal mapping: could affect both KRs but indirectly; long-build, uncertain impact
6. Mobile app redesign
   - Real problem but scope too large for this cycle; not directly connected to either OKR
7. Payment flexibility
   - Valuable but not connected to either Q2 OKR
8. Tutor onboarding improvements
   - Owned by a different team goal; out of scope for Q2

Trade-off decisions (what is deprioritized and why):
- Mobile redesign: real problem, wrong quarter. Would consume all engineering capacity with no clear KR impact.
- Match quality: high uncertainty on impact timeline; can't validate impact within 6 weeks.

Dependencies and sequencing:
- Reminders can start immediately (no dependency)
- Instant rebooking requires payment team to confirm pre-auth approach before design starts
- Cancellation enforcement needs ops sign-off on policy before development

Assumptions:
- 18% no-show rate is measured from confirmed bookings, not inquiries
- "Repeat booking" counts any rebooking with the same tutor within 60 days
