## Input
We need to choose a model for our AI-powered compliance document analyzer. The feature: legal/compliance teams at financial services companies upload internal policy documents and regulatory circulars. The AI extracts key obligations, flags potential compliance gaps, and generates a structured summary.

Candidate models:
- GPT-4o
- Claude 3.5 Sonnet
- A fine-tuned BERT-based model we've been evaluating

Requirements:
- Accuracy: financial compliance errors have real legal consequences. Output quality is critical. A missed obligation is worse than flagging a false positive.
- Context window: policy documents can be 50–200 pages. Must handle long documents reliably.
- Latency: analysis can run asynchronously. No real-time requirement. <120 seconds is acceptable.
- Cost: current volume is 200 analyses/month; scaling to 2,000/month in 12 months. Budget is $0.50 per analysis max.
- Data privacy: customer documents contain confidential business information. Cannot be used for model training. Some customers are EU-regulated (GDPR implications).
- Format requirement: structured output (JSON with obligation list, risk flags, priority score).

Initial testing quality: we ran 30 test documents through all three models manually scored by our compliance consultant.
- GPT-4o: 91% obligation recall, 8% false positives
- Claude 3.5 Sonnet: 94% obligation recall, 5% false positives
- Fine-tuned BERT: 83% recall, 11% false positives (poor on novel regulatory circulars it wasn't trained on)

## Expected output
Use case requirements:

Functional:
- Extract compliance obligations from long-form financial regulatory documents (50–200 pages)
- Flag potential compliance gaps (requires context about the company's current policies)
- Generate structured summary (JSON output)
- Handle novel regulatory language not seen in training data

Non-functional:
- Latency: <120 seconds (async acceptable)
- Cost: <$0.50/analysis at 2,000 analyses/month = <$1,000/month total
- Privacy: no training use; GDPR compliant processing required
- Context window: must handle 200-page documents without chunking artifacts that degrade accuracy

---

Candidate models evaluation:

| Criterion | GPT-4o | Claude 3.5 Sonnet | Fine-tuned BERT |
|----------|--------|-----------------|----------------|
| Obligation recall (test) | 91% | 94% | 83% |
| False positive rate (test) | 8% | 5% | 11% |
| Context window | 128k tokens (~100k words) | 200k tokens (~150k words) | 512 tokens (requires chunking) |
| Long document handling | Good: handles 200 pages with mild quality degradation on very long docs | Best: 200k window handles most documents in full | Poor: heavy chunking required, cross-section obligations frequently missed |
| Structured output (JSON) | Native function calling | Native tool use | Requires post-processing layer |
| Cost estimate at 2,000/month (200-page avg) | ~$0.30–0.45/analysis | ~$0.25–0.40/analysis | Hosting + inference: ~$0.10–0.15/analysis but requires ongoing maintenance |
| GDPR compliance | Azure OpenAI deployment (data processing agreement available) | Anthropic data processing agreement available for enterprise | Self-hosted: full data control |
| Training data use | Excluded from training (API terms) | Excluded from training | Self-hosted, zero exposure |

---

Key trade-offs identified:

1. Quality vs. cost: Claude 3.5 Sonnet has the best quality metrics and costs comparably to GPT-4o. Fine-tuned BERT is cheaper but underperforms significantly on novel regulatory language. That is a critical failure mode for compliance use cases.

2. Context window vs. complexity: Claude's 200k window handles the full document more reliably. GPT-4o handles most documents but may require chunking for the 150–200 page cases, introducing risk of cross-section obligation misses.

3. Privacy control vs. model quality: Fine-tuned BERT offers the best data isolation (self-hosted) but requires ongoing ML engineering maintenance and delivers worse quality. This trade-off is not worth it for a compliance use case where quality failure is high-stakes.

4. Vendor risk: Both GPT-4o and Claude Sonnet introduce API dependency. Abstract behind a provider interface so migration is possible if pricing or quality changes.

---

Recommendation: Claude 3.5 Sonnet

Rationale:
- Best quality metrics in testing (94% recall, 5% FPR). In compliance, a missed obligation is more costly than a false positive; recall is the primary optimization target
- 200k context window handles the full document range without chunking
- Cost is within budget at current and projected volume
- GDPR compliance achievable via data processing agreement (required for EU customers)
- Structured output via tool use is native and reliable

What the chosen option sacrifices:
- Full data custody that self-hosted BERT would provide (mitigated by DPA with Anthropic)
- Independence from a single vendor (mitigated by building an abstraction layer)

Re-evaluation triggers:
- If recall drops below 90% on any regulatory update in the first 6 months (indicates model degradation or new regulatory language outside current capability)
- If cost exceeds $0.60/analysis at target volume (indicates prompt optimization is needed or a cheaper tier model should be re-evaluated)
- If a significant EU regulatory requirement changes data residency requirements (triggers re-evaluation of self-hosted options)
- If a specialized financial compliance model (e.g., a domain-specific fine-tune) reaches comparable quality: evaluate annually
