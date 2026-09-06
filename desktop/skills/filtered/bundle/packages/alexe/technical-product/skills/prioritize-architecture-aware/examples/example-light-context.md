## Input
Engineering keeps asking to spend time on infrastructure. We have a lot of features to build and I'm not sure how to weigh this against feature work. We're a 4-person team.

## Expected output
Technical constraint summary (provisional):
Cannot summarize without knowing what infrastructure work is being requested and what it affects. "Infrastructure" is too broad — it could be anything from a database upgrade to a new deployment pipeline to a critical service migration.

Trade-off assessment (provisional):
The trade-off cannot be evaluated without:
- What specific infrastructure work is being requested
- What the current cost of not doing it is (velocity? reliability? risk?)
- What feature work would be deferred

Common patterns for infrastructure requests that have high product impact:
- "We can't build X feature until we upgrade Y" — this is a blocking dependency, not a trade-off
- "Y slows down every feature we build" — quantify the slowdown to compare it against the investment
- "Y will fail at current growth rate" — this is a risk, and risk has a business cost too

Recommended investment ratio:
Cannot recommend a ratio without knowing the specifics. A common starting point for teams with accumulated debt is 20% of capacity for technical investment, but this is a default, not a formula.

Missing information:
- What specific infrastructure work is requested?
- What is engineering's stated reason (it blocks a feature? it's causing incidents? it will fail at scale?)
- What is the effort estimate?
- What features are in the backlog alongside this request?

Suggested next step:
Ask engineering to answer three questions:
1. What specifically will we be unable to build, or build poorly, if we defer this?
2. What is the engineering effort to address it?
3. What would we need to cut from the feature backlog to fit it in?

Those three answers turn a vague request into an evaluable trade-off.

Confidence level:
Provisional
