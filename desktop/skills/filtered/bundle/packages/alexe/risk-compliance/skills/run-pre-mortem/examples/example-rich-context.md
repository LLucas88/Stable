## Input
We're about to commit to a 4-month initiative: rebuilding our marketplace search from keyword matching to semantic/AI-powered search. Team: 3 backend engineers, 1 ML engineer, 1 PM. Key dependencies: third-party vector search provider (Pinecone), ML model fine-tuning on our product catalog (50k items). Current search handles 60% of purchases. Launch target: end of Q3. We've never shipped an ML-intensive feature before. The ML engineer is new to the team (2 months). We've had no major incidents with search in 2 years.

## Expected output
Pre-mortem framing statement:
It is December 2026. The AI search rebuild failed. It launched 8 weeks late, and after launch, search-driven purchases dropped 18%. Three major enterprise clients complained about irrelevant results. The ML engineer left the company. We are now reverting to the old system.
What went wrong?

Failure mode list by category:

Technical failures:
1. ML model quality: the fine-tuned model produces irrelevant results for niche product categories. The catalog (50k items) has inconsistent product descriptions that the model couldn't generalize from.
2. Infrastructure dependency failure: Pinecone outage or latency spike degrades search performance in production; fallback to old system wasn't implemented or wasn't tested.
3. Integration complexity underestimated: backend integration with the vector search layer took 2x the estimated time due to unforeseen schema issues with the product catalog.
4. Model retraining gap: the model was trained on a catalog snapshot and not retrained after catalog updates, causing degrading quality after launch.

Execution failures:
5. Scope creep: additional features were added to the search UI mid-project ("filters," "search suggestions"), extending the timeline past Q3.
6. ML engineer onboarding friction: a 2-month-tenured ML engineer working on a business-critical system without established mentorship or code review processes introduces quality risk. Knowledge dependency on a single person is high.
7. No A/B testing infrastructure for search: without a way to compare old vs. new search quality systematically, quality regression wasn't caught until post-launch.

Organizational failures:
8. No staged rollout: the new search replaced old search for all users simultaneously. No gradual rollout meant a single regression affected 100% of search traffic.
9. Insufficient QA for niche queries: testing focused on popular queries (top 100 searches). Long-tail and specialist queries (which account for a large share of niche marketplace searches) weren't tested adequately.

External/market failures:
10. Pinecone pricing change: the third-party vector search provider changed pricing at scale, making the operating cost significantly higher than modeled.

Assessment per failure mode:

| Failure mode | Likelihood | Severity | In team's control? |
|---|---|---|---|
| ML model quality on niche catalog | High | High | Partial: can improve training data |
| Pinecone outage without fallback | Medium | High | Yes: build fallback to old search |
| Integration complexity | High | Medium | Yes: spike work upfront |
| ML engineer single point of failure | High | High | Yes: pair programming, documentation |
| No A/B testing for search quality | High | High | Yes: must build before launch |
| No staged rollout | High | High | Yes: must build rollout control |
| Scope creep | Medium | Medium | Yes: strong scope lock |

Top 3-5 failure modes (highest concern):
1. No A/B testing infrastructure: shipping a search replacement without quality comparison metrics is the most controllable and highest-severity gap. Without it, quality regression can't be caught early.
2. ML engineer as single point of failure: 4-month initiative with one ML engineer who has been on the team for 2 months. Knowledge concentration creates execution, quality, and retention risk.
3. No staged rollout / fallback: 60% of purchases flow through search. A regression that affects all users immediately creates unacceptable business impact.
4. ML model quality on niche catalog: the catalog description quality is a real data problem. Validation should happen before model training, not after.
5. Third-party infrastructure dependency with no fallback: Pinecone failure without a fallback to old search creates a total search outage scenario.

Mitigations for top failure modes:
1. A/B testing: before launch, build a search quality evaluation framework (offline evaluation on held-out queries + online A/B test comparing old vs. new on 5% of traffic before full rollout)
2. ML engineer risk: establish weekly paired code review with a senior backend engineer; require architecture documentation by end of month 1; make at least one other engineer capable of making model updates
3. Staged rollout: implement a feature flag for new search. Start at 5% of traffic, expand if quality metrics hold for 1 week, then 25%, then full rollout. Keep old search active and working until 100% rollout is complete.
4. Catalog quality: run a catalog description quality audit in month 1 before model fine-tuning begins. Identify and fix the worst description gaps before training.
5. Pinecone dependency: implement a fallback layer so that Pinecone latency >500ms or error rate >1% triggers automatic reversion to old keyword search.

Plan adjustments surfaced by the pre-mortem:
- Add 2 weeks to timeline for catalog quality audit and A/B testing infrastructure setup
- Add fallback layer to technical design before development starts
- Scope lock: no new features added to the search UI during this initiative
- Weekly quality check meetings starting from month 2 (ML engineer + PM reviewing test query results)

Early warning signals to watch for:
- Offline evaluation quality drops below baseline for 3+ product categories
- ML engineer velocity is lower than expected in weeks 3-4 (may signal knowledge gap or architecture issues)
- Pinecone latency in staging exceeds 200ms at 70th percentile
- Catalog audit reveals >30% of products have poor descriptions (signals training data problem before investment is made)
