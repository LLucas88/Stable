## Input
We need to prioritize these 4 features: dark mode, better notifications, API access for enterprise, and a mobile app. We want to use RICE but don't have exact data.

## Expected output
Framework selected: ICE instead of RICE

Rationale: RICE requires Reach (number of users impacted per period) and Confidence estimates. Without data, RICE scores become fabricated numbers that create false precision. ICE is a lighter version that can be applied more honestly with the information available. Scoring should be done qualitatively with explicit reasoning.

Scoring assumptions (1–10 scale):
- Impact: estimated value to users and business if shipped
- Confidence: how confident we are it would work / how well-understood the need is
- Ease: how fast/cheap to ship (relative to team capacity)

Preliminary scores (requires your estimates to finalize):

| Feature | Impact | Confidence | Ease | Notes |
|---------|--------|-----------|------|-------|
| Dark mode | 3 | 8 | 7 | Quality-of-life, high confidence users want it, rarely business-critical |
| Better notifications | 5 | 5 | 6 | Broad impact potential but "better" is undefined — what specifically? |
| API access (enterprise) | 7 | 6 | 3 | High business value if enterprise is a growth segment; complex to build |
| Mobile app | 8 | 4 | 2 | High potential if mobile is key channel; very expensive, high risk |

Provisional rank: API access, Mobile app, Better notifications, Dark mode

What must be confirmed before trusting these scores:
- Is enterprise a strategic growth segment? If not, API access drops.
- What does "better notifications" mean specifically? Scope changes the ease score dramatically.
- How much of your current traffic/usage is on mobile? If 10%, mobile may not belong in this cycle at all.
- What is the team's capacity? A mobile app may require a completely separate workstream.

Assumptions behind scores:
- Dark mode is relatively low engineering effort (standard theming implementation)
- API access estimate assumes a basic REST API, not a full developer platform
- Mobile app score assumes building from scratch, not a wrapper around an existing web app
