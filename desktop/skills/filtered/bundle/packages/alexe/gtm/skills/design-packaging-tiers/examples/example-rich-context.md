## Input
We're redesigning packaging tiers for our language learning app. It's a B2C freemium model on iOS and Android.

Current state: one paid plan at $9.99/month with everything included. Free tier is unlimited but with ads. The problem: no clear upgrade reason for free users who tolerate ads, and no premium tier for power users.

Product capabilities available for tiering:
- Ad-free experience
- Offline mode
- Unlimited lessons (free users are capped at 5/day)
- AI pronunciation feedback (currently only on paid)
- Progress analytics and streak tracking
- Custom vocabulary lists and spaced repetition
- Live tutor sessions (add-on, not currently in any plan)

Customer segments:
- Casual learner: uses the app a few times a week, tolerates ads, doesn't pay. Largest segment by count.
- Committed learner: practices daily, wants offline and streak features, currently our main paid segment.
- Serious learner: wants AI pronunciation feedback, custom vocab, and tutor access. Small but high-value segment.

Business model: freemium, self-serve, subscription.

## Expected output
Value metric:
Learning depth and intensity. As users go deeper (more daily lessons, offline, pronunciation feedback, live practice), they pay more. This maps to learner commitment, which correlates with retention.

Tier structure:

Free:
- Target: casual learner, new users exploring the app
- Included: 5 lessons/day, all language tracks, ads, basic progress tracking
- Upgrade trigger: hitting the 5-lesson cap, or wanting offline mode when traveling

Plus ($7.99/month):
- Target: committed learner practicing daily
- Included: unlimited lessons, ad-free, offline mode, streak tracking, basic pronunciation feedback
- Upgrade trigger from Plus: wanting AI coaching on pronunciation or custom vocabulary tools

Pro ($14.99/month):
- Target: serious learner preparing for a test, travel, or using the app as primary study method
- Included: everything in Plus, advanced AI pronunciation feedback, custom vocabulary lists, spaced repetition, progress analytics export
- Note: live tutor sessions sold as add-on ($15/session) rather than bundled, to keep Pro price accessible

Upgrade triggers per tier:
- Free to Plus: 5-lesson cap hit, ad annoyance, planning a trip (offline mode)
- Plus to Pro: pronunciation plateau, wants structured vocab building, intensive study goal

Features in free vs. paid with rationale:
- 5-lesson cap in free: creates a natural daily upgrade trigger for any user who gets hooked
- Ads in free: visible cost that makes ad-free feel valuable, not just a feature difference
- Offline only in Plus and above: high-value feature with clear use case (travel, no wifi)
- AI pronunciation in Pro (basic in Plus): graduated access — Plus users get a taste, Pro unlocks depth
- Live tutors as add-on: avoids inflating Pro price; tutors are a separate purchase decision

Conversion path design:
Free user hits lesson cap and sees "You've completed your daily sessions — unlock unlimited with Plus." Plus user gets a pronunciation score and sees "Improve accuracy with AI coaching — available in Pro."

Tier cannibalization risks:
- If free tier is too generous (5 lessons/day is already substantial for casual users), conversion to Plus is low
- Consider testing 3 lessons/day cap with ability to earn an extra session through a daily challenge — retains engagement without full free access
- Plus and Pro must feel distinct; if Plus already includes basic pronunciation, make the Pro version meaningfully better (not just incremental)

Validation steps before launch:
- Survey current paid users: what made them upgrade? Was it the cap or a specific feature?
- A/B test lesson cap at 3 vs. 5 vs. 7 — measure conversion rate
- Prototype the Plus/Pro distinction to 10 current paid users before committing to the split
