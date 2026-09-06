## Input
We're a mobile app for personal finance — budgeting, expense tracking, subscription monitoring. 180k MAU, freemium with a $7.99/month premium tier. I'm doing a synthesis before Q3 roadmap planning.

Feedback sources:
- App Store reviews (last 90 days): 312 reviews, 3.7 average rating
- Google Play reviews (last 90 days): 228 reviews, 3.5 average
- In-app feedback widget (triggered after app open, weekly rotation): 847 responses over 90 days
- Support tickets (Intercom): 1,140 tickets over 90 days, 80% resolve as how-to questions
- NPS survey responses (in-app, last quarter): 410 responses, NPS = 22

I've read a sample of each source (about 50 items each). Most prominent patterns I've noticed: recurring complaints about bank connection reliability, a lot of requests for a specific budgeting feature (envelope budgeting), and confusion around the subscription monitoring screen.

Synthesis goal: identify the top product improvements to bring into Q3 roadmap consideration.

## Expected output
Feedback source inventory:
- App Store reviews: 312 (90 days)
- Google Play reviews: 228 (90 days)
- In-app widget: 847 (90 days)
- Support tickets: 1,140 (90 days); 80% how-to = ~228 non-routine tickets
- NPS verbatims: 410 (last quarter)

Total meaningful feedback items: ~1,900+ with roughly 450 non-routine

---

Theme set (6 themes):

**Theme 1: Bank connection reliability**
Volume: estimated 25–30% of app store reviews and in-app widget responses mention this. Likely the single highest-volume issue.
Description: Users experience banks disconnecting unexpectedly, requiring re-authentication every few days. Premium and free users both affected.
Representative signals: "Bank keeps disconnecting every weekend," "Paid for premium and my Chase account hasn't synced in a week," "Would be 5 stars if the bank connection wasn't so unreliable"
Segment breakdown: affects users with connections to specific banks (Chase and Bank of America appear most frequently); newer users more likely to churn before resolving
Customer emotion: High frustration — users who hit this problem repeatedly are vocal and likely to churn or leave negative reviews
Implicit need: reliability is table stakes; this isn't a feature request, it's a product quality failure
Recommended action: Treat as a quality incident, not a roadmap item. Investigate bank-specific failure rates in connection API; establish an SLA for re-connection reliability. This belongs in engineering priority, not product planning.

**Theme 2: Envelope budgeting**
Volume: mentioned in approximately 18% of in-app widget responses and 12% of NPS detractor verbatims; 200+ support tickets asking if it's available
Description: Users want to allocate budget to categories ("envelopes") at the start of the month rather than tracking after spending. Current budgeting is spending-based, not allocation-based.
Representative signals: "Would switch from YNAB if you had envelope budgeting," "I want to set aside $300 for groceries at the start of the month, not find out I went over," "Miss my old app's envelope system"
Segment breakdown: mentioned significantly more by users who imported data from YNAB or EveryDollar (feature parity expectation)
Implicit need: proactive budget management, not just retrospective tracking — different mental model from current product
Recommended action: High roadmap priority for Q3 consideration. Validate with 4–5 user interviews to understand whether they want true zero-sum envelope budgeting or just a category spending cap. These are different builds.

**Theme 3: Subscription monitoring confusion**
Volume: ~15% of how-to support tickets relate to the subscriptions screen; also appears in ~8% of App Store reviews as a usability complaint
Description: Users can't find specific subscriptions, don't understand why some are detected and others aren't, and don't know how to mark something as cancelled.
Representative signals: "Shows subscriptions I cancelled 6 months ago," "Why can't I see my Disney+ subscription here?," "The subscriptions screen is hard to understand"
Implicit need: users need clear visual feedback on what is and isn't tracked, and a way to manage the list themselves
Recommended action: UX fix, not a new feature. Add to Q3 as a small-scope improvement. Likely 1 week of design + engineering.

**Theme 4: iOS widget and notifications**
Volume: ~12% of all feedback mentions wanting a home screen widget or better spending alerts
Description: Users want to see their budget status at a glance without opening the app; current push notifications are too infrequent or generic.
Representative signals: "A widget showing my budget would make me use this every day," "Notify me when I'm near my food budget limit, not after I've exceeded it"
Segment breakdown: iOS users more likely to mention widget; power users mention alert customization
Recommended action: Medium roadmap priority. iOS widget is a Q4 candidate (high effort, strong retention signal). Alert customization is faster and should be Q3 consideration.

**Theme 5: Data export**
Volume: ~8% of support tickets; lower volume but high user frustration when it comes up
Description: Users want to export their transaction history and budget data to CSV or spreadsheet. Power users, accountants, and tax season users specifically.
Representative signals: "I can't get my data out of the app," "Tax season is coming and there's no export"
Segment breakdown: primarily premium users, higher tenure
Recommended action: Low engineering effort, high satisfaction impact for power users. Quick win candidate for Q3.

**Theme 6: Performance on older Android devices**
Volume: Google Play reviews skew toward performance complaints; ~20% of 1- and 2-star Google Play reviews mention slowness or crashes
Description: App is slow to load and crashes on older Android models (pre-2020 devices).
Representative signals: "Crashes on my Galaxy A12," "Loading takes forever every time"
Segment breakdown: Google Play, budget Android devices; more likely lower-income users who are the target segment
Recommended action: Engineering performance audit needed. If the segment skews toward budget Android users, this is a retention problem in the core demographic.

---

Top themes by volume:
1. Bank connection reliability (25–30%)
2. Envelope budgeting (18%)
3. Subscription screen confusion (15%)
4. Widget and notifications (12%)

High-emotion themes (below volume threshold but significant):
- Data export: frustration level is disproportionately high relative to volume — these users feel locked in
- Android performance: 1-star reviews on Google Play are reputationally damaging even at low volume

Implicit needs summary:
- Reliability is not a feature: bank connectivity is the foundation everything else is built on. A user can forgive missing features; they cannot forgive a broken core function.
- Proactive vs. reactive budgeting: a significant portion of the user base wants a different mental model for budgeting, not just better tracking of the existing model.
- Ownership of their data: export is a trust signal, not just a feature request. Users who can't get their data out feel trapped.

Recommended actions per theme:
1. Bank reliability: engineering priority this sprint, not roadmap
2. Envelope budgeting: user interview validation → Q3 roadmap candidate
3. Subscription screen: UX fix, Q3 quick win
4. Widget/alerts: alert customization Q3, widget Q4
5. Data export: Q3 quick win (estimate < 1 week)
6. Android performance: engineering audit before roadmap decision
