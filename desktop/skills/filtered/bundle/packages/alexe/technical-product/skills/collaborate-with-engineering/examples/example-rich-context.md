## Input
I'm PM for a 3-engineer squad building core platform features for a B2B analytics SaaS. The collaboration problems I've identified:

1. Engineers are not involved in discovery at all. I interview customers, write a spec, and hand it to them. The last two features were technically correct but built in a way that created maintenance nightmares the engineers warned me about — but only during implementation, too late to change.
2. Estimation is a one-way demand: I give the squad a scope, they give me a time, I push back, they sigh and reduce it. Estimates are consistently wrong by 50-100%.
3. Engineers don't understand why we're building what we're building. One engineer told me they've never talked to a customer.
4. Mid-sprint scope changes: I've added "small" requests 4 times in the last quarter that engineering says are the main reason for missed commitments.

Team methodology: 2-week sprints, no formal discovery process.

## Expected output
Collaboration health assessment:
Current state is weak across all phases. The team has a delivery-only model: PM discovers → PM specs → engineering builds. This creates the exact failure modes described: engineers warn too late, estimates are unreliable, context is missing, and scope changes are unresisted because the PM holds all decision power.

Failure modes identified:
- Discovery isolation: engineers have zero customer exposure; their technical warnings come during implementation when they're least actionable
- Estimation as negotiation: estimates are treated as bids to be compressed, not signals about reality; 50-100% miss rate is the result
- Missing context: engineers who don't understand the why build compliant but brittle solutions; they optimize for what they can see, not what the PM hasn't said
- Unresisted scope changes: "small" changes are added without a trade-off being made; the scope that falls off is invisible

Involvement design per phase:

Discovery:
- One engineer joins customer interviews on a rotating basis (every 2nd interview, minimum once per quarter per engineer)
- After each research round, PM does a 30-minute "what we learned" session with the full squad before writing the spec
- Engineers flag technical implications during this session — before the spec is written, not during implementation

Scoping:
- Spec draft is shared with engineers before it's final. Engineers have 48 hours to add a "technical implications" section
- PM reads those implications before locking scope. Any implication that changes the spec requires a 15-minute sync — not an async resolution

Design:
- Engineers attend design reviews for features that involve data model changes or new integrations
- If an engineer flags a design decision as "structurally problematic," the PM cannot override without documenting the rationale explicitly (creates accountability)

Delivery:
- Scope changes during a sprint require a written trade-off: what comes out to make room for what goes in. PM writes this, not engineering. If PM cannot name what comes out, the scope change waits for next sprint.

PM-engineering decision interface:
- Scope and priority: PM decides; engineers consulted before commitment
- Architecture and implementation approach: engineering decides; PM informed and can ask questions
- Technical debt trade-offs: joint decision with explicit documentation; PM provides business context, engineering provides technical assessment
- Mid-sprint scope addition: requires PM to name what is removed; no silent additions

Estimation process:
- Estimation happens during scoping, not at sprint planning. Engineers see the spec draft and estimate before it's locked.
- Estimates are ranges, not points. PM commits to a sprint scope based on the range, accepting the risk of the upper end.
- If the mid-point estimate exceeds the sprint capacity, the scope is cut before sprint start — not negotiated down.
- Estimation retrospective: after each sprint, PM and engineering lead compare estimate vs. actuals in the retrospective. No blame; just learning.

Trade-off decision process:
When engineering raises a technical concern about a product decision:
1. PM asks: "If we do it this way, what breaks or gets harder in 3 months?"
2. Engineering provides a specific answer (not "it'll be messy")
3. PM decides: accept the trade-off with documented rationale, or adjust the scope to avoid it
4. Decision is recorded in the spec — no undocumented trade-offs

Engineering-to-product feedback loop:
- Weekly: engineering lead has 10 minutes at the end of sprint planning to raise product concerns ("things I think are wrong or risky about what we're building")
- This is not optional. If there are no concerns, that's said explicitly — it creates a habit of checking.
- Monthly: PM asks the engineering lead for the most technically painful decision they've made this quarter and why. Used to inform future scoping.
