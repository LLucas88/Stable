## Input
Engineering wants to spend a sprint on technical debt. It's related to our database layer. They say it will speed up development. How do I evaluate this?

## Expected output
Debt characterization (provisional):
"Database layer" is broad — this could mean: slow queries affecting user-facing performance, schema design that makes new features expensive to build, outdated ORM or database version, or data model complexity that creates bugs. The type of debt changes the evaluation.

What "will speed up development" means in practice:
Engineering's claim needs to be specific before it can be evaluated. Ask: what features or changes are currently slower because of this debt? By how much? This converts a qualitative claim into a trade-off calculation.

Current cost of debt (provisional):
Cannot assess. Need: which specific features are slower, by how much, and whether there are any reliability or user-facing implications (slow queries that affect load times, for example).

Investment estimate:
One sprint is the stated investment — but for what outcome? "Addressing technical debt" in a sprint can mean anything from fixing one query to a database migration. The scope must be defined before evaluating the trade-off.

Payback analysis:
Cannot calculate without knowing:
- Current velocity impact (how much time are features taking because of this debt?)
- Expected velocity improvement after the investment
- Whether any roadmap items depend on this area

Risk of deferral:
Not assessable without more detail. Key question: is this debt compounding (getting worse as more features are added) or stable (annoying but not growing)?

Recommendation:
Cannot recommend without the above. The right next step is to ask engineering for three specific things:
1. Name 2-3 features from the last quarter that were slower because of this debt, and by how much
2. Describe what breaks or gets harder if we defer for one more quarter
3. Confirm what the sprint delivers as a concrete output (what will be different after the sprint?)

Confidence level:
Provisional
