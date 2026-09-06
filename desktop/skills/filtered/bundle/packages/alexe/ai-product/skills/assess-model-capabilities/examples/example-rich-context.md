## Input
We're building an AI-powered feature for our e-learning platform. The feature: a student uploads a PDF of a textbook chapter and gets back an AI-generated quiz (5–10 multiple choice questions) with answer explanations. Target users: self-study learners aged 18–35.

Requirements:
- Questions must be factually grounded in the uploaded text only (no hallucinated "general knowledge" questions)
- Must handle PDFs with diagrams and tables (students upload science and math chapters)
- Question quality: each question should test understanding, not just recall
- Latency budget: quiz generation should take under 30 seconds
- Language support: English only for now
- Privacy: student uploads may contain personal highlights/annotations — data cannot be stored or trained on
- Cost constraint: under $0.05 per quiz generation

Candidate models we're evaluating: GPT-4o, Claude 3.5 Haiku, Gemini 1.5 Flash

## Expected output
Task definition:
Given a PDF of a textbook chapter (text + diagrams + tables), generate 5–10 multiple choice questions that:
1. Are grounded exclusively in the uploaded content
2. Test comprehension, not just factual recall
3. Include answer explanations
4. Complete within 30 seconds
5. Cost under $0.05 per generation

---

Model fit assessment:

| Criterion | GPT-4o | Claude 3.5 Haiku | Gemini 1.5 Flash |
|---------|--------|-----------------|-----------------|
| PDF/visual input | Well-suited (strong vision) | Partial (vision available, weaker on complex diagrams) | Well-suited (strong multimodal) |
| Grounded generation (no hallucination) | Partial — known to add plausible-sounding external knowledge | Well-suited — better at following "only use this text" constraints | Partial — generally good at grounding with explicit instruction |
| Question quality (comprehension vs. recall) | Well-suited | Well-suited | Well-suited |
| Latency <30s | Well-suited (~5–10s for this task) | Well-suited (~3–5s) | Well-suited (~4–7s) |
| Cost <$0.05/quiz | Partial — GPT-4o at ~$0.03–0.08 depending on PDF length | Well-suited — significantly cheaper | Well-suited — competitive pricing |
| Data privacy (no training use) | Well-suited (API data excluded from training with standard terms) | Well-suited | Well-suited |

Overall fit assessment:
- GPT-4o: partial fit — latency and vision are good but cost is borderline and hallucination grounding is weaker
- Claude 3.5 Haiku: partial fit — excellent on cost, grounding, latency; diagram handling is the main risk
- Gemini 1.5 Flash: well-suited — strong multimodal, good grounding, cost-effective, but less battle-tested for this use case

---

Known failure modes and edge cases:

1. Diagram-heavy PDFs: all models struggle with extracting meaning from complex diagrams (graphs, biology diagrams, circuit schematics). Questions about diagram content may be inaccurate.
2. Grounding drift: all models can subtly introduce "general knowledge" even when instructed to stay grounded. Must be tested on real student PDFs, not benchmark tests.
3. Question diversity: models often generate structurally similar questions (all definitions, all fill-in-the-blank style). Prompt engineering is needed to force question type variety.
4. Math equations in PDFs: LaTeX and mathematical notation extraction is unreliable across all models. Math-heavy chapters will have degraded performance.
5. Long PDFs: chapters >15 pages may exceed optimal context window usage for Haiku, affecting question quality for content late in the document.

---

Trade-off comparison:

| Dimension | Winner | Notes |
|----------|--------|-------|
| Accuracy / hallucination grounding | Haiku | Claude models have better instruction-following for constrained generation |
| Visual understanding (diagrams) | Gemini 1.5 Flash > GPT-4o > Haiku | Gemini's multimodal training is broader |
| Latency | Haiku (fastest) | All three meet the <30s requirement |
| Cost | Haiku and Flash both under $0.03 for typical chapter | GPT-4o risks exceeding budget on longer chapters |
| Privacy / data use | All equivalent | All three exclude API data from training under standard API terms |

---

Recommended approach:
Start with Gemini 1.5 Flash for initial prototype.

Rationale: best multimodal coverage for diagram-heavy content (the hardest requirement), competitive cost, and strong grounding. Test on real student PDFs across 3 subject areas (biology, history, math). Use Claude 3.5 Haiku as the comparison arm, specifically for text-only chapters where diagram handling doesn't matter.

Build/buy/fine-tune:
No fine-tuning needed for v1. Use prompt engineering to enforce grounding ("Generate questions using only information from the following text. Do not add general knowledge."). Fine-tuning is a Q3 consideration if testing shows systematic question quality issues.

---

Required validation before production:
- Build a test set of 20 PDFs across 4 subject areas (5 each: biology, history, math, literature)
- For each PDF: manually evaluate grounding (no hallucination) and question quality (comprehension vs. recall)
- Measure: grounding rate, question diversity score, latency distribution, cost per generation
- Minimum bar for launch: >90% grounding accuracy, <5% hallucinated questions, all under 30s

---

Risks:
- Diagram handling is the biggest unresolved question — if 30%+ of student uploads are diagram-heavy, this could significantly degrade perceived quality at launch
- Cost scales with PDF length — a 30-page chapter could push GPT-4o over the budget limit; monitor by chapter length at launch
- Student expectations may be high after seeing demo-quality outputs — real PDFs with formatting issues, scan artifacts, or unusual layouts will produce worse results
