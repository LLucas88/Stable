## Input
Should I use GPT-4 or something cheaper like Haiku for my AI feature? It's a writing assistant inside our app.

## Expected output
The right model for a writing assistant depends on what "good enough" quality means for your use case. Without that defined, it's not possible to say whether GPT-4 is necessary or whether Claude 3.5 Haiku is sufficient.

Use case requirements (to confirm):
- What does the writing assistant do? (Suggest improvements? Generate content from scratch? Summarize? Rewrite?)
- What is the quality bar? (Consumer-facing where bad outputs damage brand? Internal tool where rough outputs are fine?)
- What are the constraints? (Latency requirement? Cost budget per user or per call?)

---

Provisional comparison (assuming general writing assistance):

| Criterion | GPT-4o | Claude 3.5 Haiku |
|----------|--------|-----------------|
| Output quality | High — strong reasoning and writing | Good — notably faster and cheaper, quality is lower for complex tasks |
| Latency | ~1–3s for typical requests | ~0.5–1.5s for typical requests |
| Cost | ~$0.005–0.015 per request (depends on length) | ~$0.0005–0.003 per request |
| Best fit | Complex writing tasks, high-quality generation, tasks requiring reasoning | Quick suggestions, autocomplete, low-stakes generation |

General guidance:
- If users rely on the AI output for important work and would notice lower quality: start with GPT-4o or Claude 3.5 Sonnet, then test if a cheaper model passes quality bar
- If the writing assistance is supplementary (suggestions users can ignore) and speed matters: Haiku or Flash tier is worth testing
- Cost only matters at scale — if you have 100 users, the difference is trivial; if you have 100,000 users generating 10 requests/day each, cost becomes significant

Most practical approach:
Test both models on 50 real examples of your users' inputs. Score quality manually (or have 3 team members rate). If Haiku passes your quality bar, use it. If not, use GPT-4o. Don't commit to a model based on benchmarks alone.

Missing context before a confident recommendation:
- What task does the assistant perform?
- What is your current or expected user volume?
- Is quality failure (bad output) a problem that damages trust, or one that users can easily correct?
