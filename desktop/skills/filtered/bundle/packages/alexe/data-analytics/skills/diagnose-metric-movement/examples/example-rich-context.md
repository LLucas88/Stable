## Input
Our 7-day retention dropped from 34% to 26% between May 12 and May 19. Product is an EdTech platform for adult learners. Retention is defined as completing at least one lesson in a 7-day window after signup. We shipped two things on May 13: a new lesson recommendation algorithm and a new email sequence for new users. Segment breakdown shows the drop is concentrated in mobile users (33% → 21%) while desktop is nearly unchanged (35% → 34%). We saw a similar drop in lesson start rate on mobile during the same period (from 68% to 54% of Day-1 users). No external events identified. Traffic sources and volume unchanged.

## Expected output
Metric change summary:
7-day retention dropped from 34% to 26% (a 23.5% relative decline). Mobile: 33% → 21% (36% relative decline). Desktop: 35% → 34% (unchanged). Drop began on or just after May 13. Duration: 7 days as of observation.

Data quality check results:
- Volume is stable and traffic sources unchanged: rules out a traffic mix shift
- Segment breakdown (mobile vs. desktop) is clean: mobile shows the drop, desktop doesn't
- Lesson start rate drop on mobile (68% → 54%) confirms the retention drop reflects a real behavior change, not a tracking issue

Instrumentation issues found:
None identified. Desktop tracking unchanged while mobile changed suggests instrumentation is working correctly — this is a platform-specific product issue, not a data pipeline problem.

Timeline of product changes in the window:
- May 13: new lesson recommendation algorithm shipped (both mobile and desktop)
- May 13: new email sequence for new users shipped

External confound assessment:
No external events identified. Traffic and volume stable. Seasonality unlikely given 7-day window and no prior-year pattern noted.

Segment breakdown analysis:
The mobile isolation is the clearest signal. Both product changes shipped on May 13, but the drop is mobile-specific. Desktop uses the same email sequence and the same recommendation algorithm — if either of those caused the problem, desktop would be affected too. The mobile-specific nature points to a mobile implementation issue rather than the algorithm or email logic itself.

Ranked candidate causes:
1. Mobile implementation of the recommendation algorithm (highest likelihood) — mobile retention and lesson start rate both dropped; desktop unaffected despite same algorithm change. A mobile-specific rendering or performance regression is the most likely explanation.
2. New email sequence interacting badly with mobile email clients — less likely because email sequence is delivery-side, not app-side; however, worth checking if email-driven mobile re-entry rate dropped
3. Algorithm producing worse recommendations for the mobile content catalog — possible if mobile content library differs from desktop

Most probable cause with evidence:
The lesson recommendation algorithm has a mobile-specific implementation issue. The simultaneous drop in both lesson start rate and 7-day retention on mobile, with no desktop effect despite identical algorithm deployment, points to a mobile rendering or interaction bug introduced by the May 13 mobile build.

Recommended next step to confirm:
1. QA the lesson recommendation UI on iOS and Android — specifically test: do recommendations load? Are they tappable? Do they link to valid lesson content?
2. Pull lesson recommendation impressions vs. clicks on mobile vs. desktop for May 13–19 — if mobile CTR on recommendations dropped, that's direct evidence
3. Check the May 13 mobile build version notes for any UI changes to the lesson feed
