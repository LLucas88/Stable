## Input
We're planning Q3. Here's the situation:

Feature backlog (approximate engineering estimate attached):
1. AI-powered search — 8 weeks, high business priority (CEO-sponsored)
2. Mobile app redesign — 6 weeks, high user request volume
3. Multi-currency support — 5 weeks, needed for EU expansion
4. Bulk export feature — 2 weeks, CS escalation from 3 enterprise customers

Technical debt and constraints from engineering:
- A. Search infrastructure is not suitable for AI/vector search — would need a new search layer (Elasticsearch or similar). Engineering estimates 3-4 weeks to build the infrastructure before AI search can be implemented. Without this, AI search is not feasible.
- B. The current mobile codebase is React Native 0.66 (from 2021). The team estimates the redesign will be 40% slower than normal because of framework age. Upgrading React Native first would take 2 weeks but make the redesign more predictable.
- C. Currency handling in the database uses a float type that causes rounding errors at scale. Multi-currency will work but will have rounding issues that will require fixes after launch — estimated 1-2 weeks of bug fixing post-launch. A schema migration to fix this properly would take 3 weeks and is a prerequisite for clean multi-currency.
- D. Bulk export is simple — no architectural constraints.

Engineering capacity: 3 engineers for Q3 (10 weeks available).

Business goals: EU expansion is Q4 target; AI search is a competitive differentiator.

## Expected output
Technical constraint summary in product terms:

Feature A (AI search): blocked by infrastructure. Cannot start implementation until 3-4 weeks of search infrastructure work is complete. This is not optional — trying to build AI search on the current system will fail technically. The infrastructure investment must precede the feature.

Feature B (mobile redesign): slowed by React Native version. Will take ~40% longer than estimated in a normal codebase. React Native upgrade (2 weeks) unlocks predictable velocity for the redesign. Without the upgrade, the 6-week estimate is unreliable — could extend to 8-9 weeks.

Feature C (multi-currency): schema debt creates post-launch bug risk. Can ship without the migration, but will require 1-2 weeks of rework after launch. The rework window falls in Q4, which conflicts with EU expansion timing if the bugs affect production data.

Feature D (bulk export): no constraints. Straightforward.

Trade-off assessment: features vs. technical investment:

Scenario 1 (ship features without tech investment):
- AI search: cannot ship at all without search infrastructure — not a valid scenario
- Mobile redesign: slower and less predictable (potentially 8-9 weeks)
- Multi-currency: ships but requires 1-2 weeks of bug fixing in Q4 during EU expansion ramp
- Total: AI search blocked, mobile overruns likely, multi-currency rework hits Q4

Scenario 2 (invest first, then ship):
- Week 1-3: search infrastructure (3 weeks, 1 engineer)
- Week 1-2: React Native upgrade (2 weeks, 1 engineer) — parallel to infrastructure
- Week 1-3: database schema migration (3 weeks, 1 engineer) — parallel to above
- Week 4-10: all three engineers on features (7 weeks available)
- Achievable in Q3: search infrastructure done, React Native upgraded, schema migrated, multi-currency shipped, bulk export shipped, AI search ~50% complete
- Mobile redesign begins in Q3 on upgraded foundation; likely completes in early Q4

Recommended investment ratio and rationale:
Weeks 1-3: all three engineers on prerequisite technical work in parallel. This unblocks all three main features simultaneously. No feature starts before the prerequisite for that feature is complete.

Weeks 4-10: feature delivery (AI search, multi-currency, bulk export). Mobile redesign begins at week 4 on the upgraded React Native foundation.

Rationale: the alternative (skipping the technical investment) doesn't actually save time — AI search is blocked entirely, mobile overruns in Q3 and likely Q4, and multi-currency rework lands in Q4 during EU expansion. The investment in weeks 1-3 is paid back within Q3.

Sequencing recommendation:
- Parallel tracks (weeks 1-3): search infrastructure, React Native upgrade, schema migration
- Week 4 start: AI search (engineering begins on ready infrastructure), multi-currency (on clean schema), bulk export (no dependencies)
- Week 4 start: mobile redesign begins on upgraded framework
- Q3 commitments: multi-currency shipped, bulk export shipped, search infrastructure done, AI search in progress

Dependencies between technical and feature work:
- AI search cannot start before search infrastructure is complete
- Mobile redesign velocity is unpredictable without React Native upgrade
- Multi-currency post-launch bug risk is accepted if schema migration is deferred (recommended: do not defer given Q4 EU expansion)
- Bulk export has no dependencies — can start immediately if there's capacity

Assumptions from engineering to validate:
- The 3-4 week search infrastructure estimate assumes one specific approach (confirm which)
- React Native upgrade estimate (2 weeks) assumes no major breaking changes — ask engineering to verify
- Schema migration is non-breaking (confirm: does it require data migration or just type change?)
