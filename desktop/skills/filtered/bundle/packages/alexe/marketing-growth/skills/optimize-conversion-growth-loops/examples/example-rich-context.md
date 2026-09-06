## Input
We have an online course platform. Users can browse free course previews, and the upgrade CTA appears at the end of the first module. Current free-to-paid conversion at that point: 7.2%. We know from Amplitude that 68% of users who reach the end of the first module complete it, but only 34% of registered users ever reach the first module (the rest never go past registration). The growth loop we want to strengthen: engaged learners complete courses → share certificates on LinkedIn → recruiters and employers see them → new job-seekers find the platform. We've seen some organic LinkedIn traffic, but it's inconsistent.

## Expected output
Conversion flow map:
Registration → (66% drop here) → First module accessed → Module completed (68%) → Upgrade CTA shown → Paid conversion (7.2%)

The critical drop-off isn't at the paywall — it's between registration and first module start. 66% of registered users never reach the module where conversion is being optimized.

Friction points and drop-off analysis:
1. Registration → first module start (34% reach it): this is the dominant funnel gap. 66% of registered users are not engaging with content at all. This suggests either: the registration-to-discovery path is too long, the homepage after registration doesn't direct users to start a course, or new users don't immediately understand what to do.
2. First module start → completion (68%): this is actually reasonable. Once users start, most finish. The course content is not the problem.
3. Paywall → conversion (7.2%): this is the stated optimization target but it's the wrong bottleneck to focus on first. If 66% of users never see the paywall, increasing paywall conversion matters less than getting more users to the paywall.

Growth loop description:
Certificate sharing loop: user completes course → earns certificate → shares on LinkedIn → LinkedIn connection sees "took a [skill] course on [platform]" → clicks → registers → potential new learner. This loop requires: (a) course completions to happen at scale, (b) certificates to be shareable and look worth sharing, (c) the LinkedIn click to land on a compelling page.

Optimization recommendations by priority:
1. Fix post-registration to first module start (immediate): add a directed CTA on the post-registration screen — "Start your first lesson now" with the single most popular course surfaced. Currently users likely land on a generic dashboard. Remove friction between registration and content.
2. Improve the registration → email activation path (if email confirmation gate exists): any email gate between registration and first access kills activation. Remove or defer it.
3. Optimize the upgrade CTA positioning within the module (medium priority): at 7.2%, there may be room to improve timing (offer upgrade at peak engagement moment within the module, not just at the end) and copy.
4. Certificate sharing mechanics (growth loop): make certificates share-worthy (professional design, prominent skill + platform name) and add a one-tap "Share to LinkedIn" button on completion. Currently certificates may exist but aren't being pushed as social objects.

Loop reinforcement mechanisms:
- Add a completion celebration screen with a social share CTA and preview of what the certificate looks like on LinkedIn
- LinkedIn share should deep-link to the specific course landing page, not the generic homepage
- Consider "top 10% of learners" certificate variant for high-scoring completions — makes sharing feel like status

Measurement plan for each recommendation:
- Post-registration → first module start: track time from registration to first module_started event; track rate of users hitting module_started within 24h
- Certificate sharing: track certificate_shared events and LinkedIn-attributed registrations
- Upgrade CTA timing: A/B test mid-module vs. end-of-module upgrade prompt using free-to-paid conversion as primary metric
