## Input
We're a language learning app. Feature: "Streak repair" (if a user misses a day and breaks their streak, they can spend in-app coins to restore it). This has shipped on iOS and we're now defining requirements for Android.

User segment: paid subscribers who have streaks of 7+ days. Based on iOS data, about 40% of users who break a 7+ day streak churn within 14 days. We believe giving them a recovery option reduces that churn.

Success metric: D14 churn rate for users who break a 7+ day streak (currently ~40% on Android; iOS baseline after streak repair was ~28%).

Design files exist. Engineering estimate: 3 days for the implementation, 1 day for testing.

Known edge cases from iOS:
- Users can try to repair a streak they didn't actually break (attempted fraud via date manipulation)
- Users with 0 coins try to access the repair UI and see a confusing empty state
- The repair window closes after 24 hours; some users miss it and complain

## Expected output
Problem statement and goal:
When paying users break a streak of 7+ days, 40% churn within 14 days on Android (vs. ~28% on iOS after streak repair launched). This feature gives users a recovery option to reduce churn in that high-risk moment.

Goal: reduce D14 churn for Android users who break a 7+ day streak from ~40% to ~30%.

---

User stories with acceptance criteria:

**Story 1: Streak repair prompt**
As a paid subscriber who just broke a streak of 7+ days, I want to see a streak repair option immediately after the break, so I can restore my progress without feeling like I've lost everything.

Acceptance criteria:
- Given a paid subscriber breaks a streak of 7+ days, when they open the app within 24 hours, then a streak repair modal is shown before the home screen
- The modal shows: current broken streak length, coins required (fixed: 10 coins), coins balance, repair CTA, dismiss option
- The modal does not appear if the user has already repaired or dismissed it
- The modal does not appear after the 24-hour repair window has passed

**Story 2: Streak repair purchase**
As a paid subscriber viewing the streak repair modal, I want to spend coins to restore my streak, so that my progress is recovered.

Acceptance criteria:
- Given a user taps "Repair streak", when coins balance is sufficient (≥10), the streak is restored immediately and the modal closes
- The coins balance is decremented by 10 in real time
- A success confirmation screen shows the restored streak number
- Given a user taps "Repair streak", when coins balance is insufficient (<10), the CTA is replaced with "Get coins" linking to the coins store

**Story 3: Zero-coins empty state**
As a paid subscriber with 0 coins attempting to repair a streak, I want to see a clear path to getting coins, so I'm not stuck in a dead end.

Acceptance criteria:
- Given coins balance = 0, the repair modal shows the coins balance as "0" and the CTA reads "Get coins (10 needed)"
- Tapping "Get coins" navigates to the coins purchase screen
- After purchasing coins, back navigation returns the user to the repair modal (not the home screen)

---

Out of scope:
- Free users (no streak repair for non-subscribers in this version)
- Streaks shorter than 7 days (not eligible for repair)
- Multiple streak repairs per calendar week (cap: 1 repair per 7 days; separate story if needed)
- Retroactive repairs beyond 24 hours

Open questions:
- Should streak repair be available when the user is offline? (iOS does not allow offline repair; align Android to same behavior)
- What happens when a user's subscription lapses after a repair is purchased but before the streak resumes? (Edge case; needs product decision)

Dependencies:
- Coins service API must support balance check and deduction in a single transaction (prevent double-spend race condition)
- Analytics team: confirm event names for "repair initiated", "repair completed", "repair dismissed"

Edge cases and error states:
- Device clock manipulation: streak repair eligibility is server-side, based on server timestamp, not device time
- Network error during repair: show error state with retry option; do not deduct coins until server confirms success
- User dismisses and then reopens app within 24h: modal does not re-show after explicit dismiss
