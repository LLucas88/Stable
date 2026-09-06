# 🧠 AI Product Plugins

![Skills](https://img.shields.io/badge/skills-121-blue) ![Domains](https://img.shields.io/badge/domains-15-green) [![License](https://img.shields.io/badge/license-MIT-brightgreen)](LICENSE)

Status: stable. 121 skills authored Feb–Mar 2026.

Your AI agent can write code, summarize documents, and answer questions. But ask it to size an experiment, diagnose a metric drop, or build a launch plan — and it wings it. Generic answers, hallucinated numbers, skipped steps.

**This library fixes that.**

121 structured skills across 15 product domains. Each skill is a playbook that tells the agent exactly what to ask, how to reason through the problem, and what the output should look like. No prompt engineering on your side — just install a domain and go.

Think of it as **product management muscle memory for your AI agent.** The same frameworks, the same rigor, the same questions a great PM would ask — packaged as reusable skills.

---

## 🚀 Quick start

### Claude Cowork

1. Open **Customize** (bottom-left)
2. Go to **Browse plugins** → **Personal** → **+**
3. Select **Add marketplace from GitHub**
4. Enter: `alexe-ev/product-plugins`

All 15 plugins install automatically, providing both commands and skills.

### Claude Code (CLI)

```bash
# Step 1: Add the marketplace
/plugin marketplace add alexe-ev/product-plugins

# Step 2: Install individual plugins
/plugin install experimentation@product-plugins
/plugin install data-analytics@product-plugins
/plugin install product-strategy@product-plugins
/plugin install product-discovery@product-plugins
/plugin install product-planning@product-plugins
/plugin install gtm@product-plugins
/plugin install marketing-growth@product-plugins
/plugin install ai-product@product-plugins
/plugin install business-commercial@product-plugins
/plugin install customer-success@product-plugins
/plugin install product-ops@product-plugins
/plugin install leadership-communication@product-plugins
/plugin install technical-product@product-plugins
/plugin install risk-compliance@product-plugins
/plugin install ux-research@product-plugins
```

### Other AI Assistants (Skills Only)

The `skills/*/SKILL.md` files follow the universal skill format. Copy skill folders to the appropriate tool directory:

| Tool | Directory | Command |
|------|-----------|---------|
| Gemini CLI | `~/.gemini/skills/` | `for plugin in */; do cp -r "$plugin/skills/"* ~/.gemini/skills/ 2>/dev/null; done` |
| OpenCode | `.opencode/skills/` | `for plugin in */; do mkdir -p .opencode/skills/; cp -r "$plugin/skills/"* .opencode/skills/ 2>/dev/null; done` |
| Cursor | `.cursor/skills/` | Copy skill folders manually |
| Codex CLI | `.codex/skills/` | Copy skill folders manually |
| Kiro | `.kiro/skills/` | Copy skill folders manually |

### Use a skill

```
/experimentation:estimate-sample-size
```

The skill walks Claude through the right questions, methodology, and output format. If required inputs are missing, it stops and asks — no hallucinated numbers, no guesswork.

---

## 💡 What this looks like in practice

Running an A/B test and need to know if you have enough traffic:
```
/experimentation:estimate-sample-size
```

Metric dropped 12% last week and nobody knows why:
```
/data-analytics:diagnose-metric-movement
```

Investor deck needs a real business case, not vibes:
```
/business-commercial:build-business-case
```

Stakeholders are misaligned on the roadmap, again:
```
/product-planning:build-roadmap-prioritization
```

No googling, no guessing, no "let me think about that." Each skill walks Claude through the right questions, the right methodology, and the right output format — every time.

---

## 📦 15 domains, 121 skills

| | Domain | What it covers | Skills |
|-|--------|----------------|--------|
| 🧪 | [`experimentation`](experimentation/README.md) | Hypothesis design, sample sizing, experiment plans, result analysis, post-test decisions | 8 |
| 📊 | [`data-analytics`](data-analytics/README.md) | Metrics frameworks, funnel analysis, dashboards, signal detection, metric diagnosis | 8 |
| 🧭 | [`product-strategy`](product-strategy/README.md) | Vision, long-term direction, market fit, positioning, competitive strategy, portfolio | 9 |
| 🔍 | [`product-discovery`](product-discovery/README.md) | Problem framing, user interviews, JTBD, insight synthesis, opportunity identification | 8 |
| 📋 | [`product-planning`](product-planning/README.md) | OKRs, roadmapping, prioritization, PRDs, user stories, delivery planning | 8 |
| 🚀 | [`gtm`](gtm/README.md) | Launch planning, positioning, messaging, pricing, sales battlecards, enablement | 8 |
| 📈 | [`marketing-growth`](marketing-growth/README.md) | Growth models, acquisition funnels, lifecycle, onboarding, conversion, channel experiments | 8 |
| 🤖 | [`ai-product`](ai-product/README.md) | AI feature ideation, model tradeoffs, HITL workflows, quality monitoring, value framing | 8 |
| 💰 | [`business-commercial`](business-commercial/README.md) | Business cases, unit economics, LTV/CAC, forecasting, ROI, revenue strategy | 8 |
| 🤝 | [`customer-success`](customer-success/README.md) | Churn analysis, health scoring, VOC programs, feedback triage, retention playbooks | 8 |
| ⚙️ | [`product-ops`](product-ops/README.md) | Operating cadence, planning processes, tooling, cross-team alignment, wikis | 8 |
| 🎤 | [`leadership-communication`](leadership-communication/README.md) | Executive narratives, stakeholder mapping, decision frameworks, team rituals | 8 |
| 🔧 | [`technical-product`](technical-product/README.md) | Platform thinking, architecture-aware prioritization, engineering collaboration, NFRs | 8 |
| 🛡️ | [`risk-compliance`](risk-compliance/README.md) | Risk registers, privacy assessment, ethical frameworks, responsible AI governance | 8 |
| 🎨 | [`ux-research`](ux-research/README.md) | Research planning, usability testing, journey mapping, experience quality, design handoff | 8 |

Install any combination:

```bash
/plugin marketplace add alexe-ev/product-plugins
/plugin install experimentation@product-plugins
/plugin install data-analytics@product-plugins
/plugin install product-strategy@product-plugins
```

<details>
<summary><strong>Full skill list by domain</strong></summary>

### 🧪 [experimentation](experimentation/README.md)
| Skill | Description |
|-------|-------------|
| `formulate-experiment-hypothesis` | Turn a product idea into a testable hypothesis |
| `validate-hypothesis-quality` | Check if a hypothesis is specific, measurable, and testable |
| `define-success-metrics` | Define primary metric, secondary metrics, and guardrails |
| `estimate-sample-size` | Calculate required sample size and experiment duration |
| `design-experiment-plan` | Build a complete experiment plan from hypothesis to execution |
| `analyze-experiment-results` | Analyze control vs test results with statistical rigor |
| `validate-experiment-quality` | Audit whether an experiment was run correctly |
| `recommend-post-test-decision` | Recommend next steps based on experiment outcome |

### 📊 [data-analytics](data-analytics/README.md)
| Skill | Description |
|-------|-------------|
| `design-product-metrics` | Define a metrics framework with primary, secondary, and guardrail metrics |
| `analyze-funnel-retention-cohorts` | Analyze funnel drop-off, retention curves, and cohort behavior |
| `build-decision-dashboard` | Structure a dashboard that supports fast decision-making |
| `design-metric-alert-system` | Design alerting with thresholds, logic, and escalation paths |
| `detect-performance-signals` | Identify and interpret signals of product performance change |
| `diagnose-metric-movement` | Diagnose root cause of unexpected metric movements |
| `plan-event-instrumentation` | Plan event tracking and instrumentation for product analytics |
| `run-cohort-analysis` | Structure and interpret cohort analysis for retention and behavior |

### 🧭 [product-strategy](product-strategy/README.md)
| Skill | Description |
|-------|-------------|
| `define-product-vision` | Articulate a clear product vision |
| `craft-product-mission` | Define the product mission statement |
| `define-long-term-direction` | Translate vision into strategic priorities and trade-offs |
| `define-strategic-positioning` | Define how the product is positioned in the market |
| `assess-product-market-fit` | Evaluate product-market fit signals |
| `analyze-competitive-landscape` | Map competitive landscape and dynamics |
| `frame-competitive-differentiation` | Frame what differentiates the product from alternatives |
| `build-portfolio-roadmap-strategy` | Build a portfolio-level roadmap strategy |
| `prioritize-strategic-bets` | Prioritize strategic bets and investment areas |

### 🔍 [product-discovery](product-discovery/README.md)
| Skill | Description |
|-------|-------------|
| `identify-problem-opportunity` | Frame the real problem or opportunity before jumping to solutions |
| `scope-discovery-research` | Define scope, goals, and methods for discovery research |
| `run-user-interviews` | Plan, structure, and synthesize user interviews |
| `apply-jtbd-framework` | Apply Jobs-to-be-Done to understand what job users hire the product for |
| `synthesize-qualitative-research` | Synthesize interviews and qualitative data into actionable insights |
| `generate-insights` | Distill raw observations into meaningful product insights |
| `frame-insight-opportunity` | Turn insights into structured opportunity statements |
| `develop-persona-segment` | Build and validate user personas and segments |

### 📋 [product-planning](product-planning/README.md)
| Skill | Description |
|-------|-------------|
| `set-goals-okrs-kpis` | Define and structure goals using OKRs and KPIs |
| `align-goals-to-strategy` | Check alignment between team goals and company strategy |
| `build-roadmap-prioritization` | Build and prioritize a feature or initiative roadmap |
| `apply-prioritization-framework` | Apply RICE, MoSCoW, ICE, or opportunity scoring |
| `write-requirements-prd` | Write complete product requirements documents |
| `write-user-stories` | Write user stories with clear acceptance criteria |
| `plan-delivery-collaboration` | Structure delivery planning and cross-functional alignment |
| `run-retrospective` | Facilitate a retrospective to extract learning |

### 🚀 [gtm](gtm/README.md)
| Skill | Description |
|-------|-------------|
| `plan-product-launch` | Build a launch plan with timeline, channels, and coordination |
| `build-launch-readiness-checklist` | Cover all cross-functional dependencies before launch |
| `develop-positioning-messaging` | Develop positioning and messaging for target segments |
| `craft-value-proposition` | Craft a clear value proposition for a product or feature |
| `design-packaging-tiers` | Design packaging tiers aligned with value and willingness to pay |
| `support-pricing-packaging` | Analyze and recommend pricing structures |
| `create-sales-battlecard` | Create competitive battlecards for sales |
| `enable-sales-cs` | Structure sales and CS enablement materials |

### 📈 [marketing-growth](marketing-growth/README.md)
| Skill | Description |
|-------|-------------|
| `design-growth-model` | Build or assess a growth model (AARRR) |
| `map-acquisition-funnel` | Map acquisition funnel from awareness to activation |
| `identify-growth-loop` | Identify and map compounding growth loops |
| `optimize-conversion-growth-loops` | Identify conversion bottlenecks and reinforce growth loops |
| `design-onboarding-flow` | Design onboarding that gets users to activation fast |
| `plan-lifecycle-engagement` | Design lifecycle engagement including onboarding and re-engagement |
| `design-channel-experiment` | Design a structured experiment for a new growth channel |
| `strategize-channel-campaigns` | Develop channel strategy and campaign experimentation plan |

### 🤖 [ai-product](ai-product/README.md)
| Skill | Description |
|-------|-------------|
| `ideate-ai-features` | Generate AI feature ideas with value propositions and feasibility |
| `assess-model-capabilities` | Evaluate AI model capabilities and limitations for a product decision |
| `make-model-tradeoff-decision` | Structure trade-offs between AI models or approaches |
| `frame-ai-product-value` | Frame AI feature value in terms of user outcomes |
| `design-human-in-loop-workflow` | Balance AI automation with human oversight |
| `define-ai-success-metrics` | Define success metrics covering quality, UX, business, and safety |
| `evaluate-ai-quality-monitoring` | Set up AI quality monitoring and evaluation loops |
| `run-ai-prototype-evaluation` | Evaluate an AI prototype for quality and readiness |

### 💰 [business-commercial](business-commercial/README.md)
| Skill | Description |
|-------|-------------|
| `build-business-case` | Develop a structured business case with ROI and risks |
| `frame-roi-analysis` | Frame ROI analysis for a product initiative |
| `analyze-unit-economics` | Analyze CAC, LTV, payback period, and gross margin |
| `model-ltv-cac` | Model LTV and CAC for unit economics assessment |
| `evaluate-pricing-model` | Evaluate pricing model against behavior and goals |
| `align-revenue-strategy` | Align product decisions with revenue model and commercial goals |
| `run-forecasting-scenarios` | Build and compare forecasting scenarios |
| `run-sensitivity-analysis` | Identify which assumptions have the most impact |

### 🤝 [customer-success](customer-success/README.md)
| Skill | Description |
|-------|-------------|
| `analyze-churn-retention` | Analyze churn patterns and design retention interventions |
| `build-customer-health-score` | Build a health score model predicting churn and expansion |
| `monitor-adoption-health` | Define and monitor adoption health metrics |
| `run-voc-program` | Design a Voice of Customer program for systematic insights |
| `design-customer-feedback-survey` | Design surveys that generate reliable, actionable data |
| `synthesize-feedback-themes` | Synthesize feedback volumes into structured themes |
| `triage-feedback-loop` | Establish feedback intake and triage routing |
| `design-retention-playbook` | Design retention playbook for at-risk accounts |

### ⚙️ [product-ops](product-ops/README.md)
| Skill | Description |
|-------|-------------|
| `design-operating-cadence` | Design operating rhythm: meetings, reviews, reporting, planning |
| `design-planning-process` | Connect strategy to execution through repeatable planning |
| `align-cross-team-communication` | Design communication systems that keep teams aligned |
| `run-cross-functional-review` | Facilitate cross-functional product review for alignment |
| `audit-product-process` | Identify bottlenecks and improvement opportunities |
| `automate-workflow-governance` | Identify automation opportunities and governance standards |
| `manage-tooling-documentation` | Audit tooling stacks and documentation practices |
| `build-product-wiki` | Design and populate a product knowledge base |

### 🎤 [leadership-communication](leadership-communication/README.md)
| Skill | Description |
|-------|-------------|
| `build-executive-narrative` | Craft executive-level narratives about strategy and results |
| `write-product-strategy-doc` | Write a product strategy document that aligns teams |
| `communicate-decisions-tradeoffs` | Communicate decisions and trade-offs to build trust |
| `apply-decision-framework` | Apply DACI, SPADE, RAPID for clear decisions |
| `map-stakeholder-influence` | Map stakeholders and develop engagement strategies |
| `run-stakeholder-alignment` | Execute stakeholder alignment for decisions or initiatives |
| `build-operating-norms` | Establish team operating norms and working agreements |
| `design-team-rituals` | Design rituals and rhythms that build alignment |

### 🔧 [technical-product](technical-product/README.md)
| Skill | Description |
|-------|-------------|
| `run-technical-discovery` | Surface feasibility constraints and architectural options |
| `collaborate-with-engineering` | Structure product-engineering collaboration patterns |
| `define-non-functional-requirements` | Define performance, security, scalability, accessibility, compliance |
| `prioritize-architecture-aware` | Incorporate architectural constraints into prioritization |
| `manage-technical-debt-tradeoffs` | Structure trade-offs between tech debt and new value |
| `develop-platform-product-thinking` | Define developer experience, extensibility, ecosystem strategy |
| `design-developer-experience` | Design DX for platform, API, or SDK products |
| `assess-reliability-scalability` | Evaluate reliability and scalability for product decisions |

### 🛡️ [risk-compliance](risk-compliance/README.md)
| Skill | Description |
|-------|-------------|
| `run-pre-mortem` | Identify ways an initiative could fail before launch |
| `design-risk-register` | Design and populate a risk register for an initiative |
| `plan-risk-mitigation` | Develop mitigation plans with owners, triggers, contingencies |
| `assess-privacy-security-regulatory` | Identify privacy, security, and regulatory risks |
| `run-privacy-impact-assessment` | Run a PIA for features that handle personal data |
| `apply-ethical-decision-framework` | Apply ethical frameworks to evaluate product decisions |
| `conduct-ai-audit` | Audit AI systems against responsible AI standards |
| `govern-responsible-ai` | Establish governance for responsible AI development |

### 🎨 [ux-research](ux-research/README.md)
| Skill | Description |
|-------|-------------|
| `plan-ux-research` | Plan UX research initiatives |
| `design-research-study` | Design a structured research study |
| `run-usability-testing` | Plan and run usability testing sessions |
| `analyze-usability-findings` | Analyze and synthesize usability test findings |
| `map-user-journey` | Map the end-to-end user journey |
| `assess-experience-quality` | Assess overall experience quality |
| `manage-design-handoff` | Structure design-to-engineering handoff |
| `write-design-brief` | Write a clear design brief |

</details>

---

## 🏆 Does it actually work?

All 121 skills were evaluated across 3 independent rounds. Each round used different test cases and evaluation criteria written by a different LLM without access to skill instructions. Claude evaluated responses in all rounds — which matches real-world usage but means results carry some self-evaluation bias.

**Overall results across 3 rounds (poor-context inputs):**

| | Round 1 | Round 2 | Round 3 | Avg |
|--|---------|---------|---------|-----|
| Avg WITH skill | 95% | 94% | 99% | **96%** |
| Avg WITHOUT skill | 84% | 54% | 37% | **58%** |
| Avg delta | +11 pp | +40 pp | +62 pp | **+38 pp** |

The spread across rounds reflects how strictly each LLM wrote the criteria. The average delta of **+38 pp** is the most reliable single number.

**Where skills add the most value:**

Skills that enforce structured output, block on missing inputs, or guard against specific failure modes consistently outperform vanilla Claude. Strongest results in `risk-compliance`, `gtm` (launch plans, battlecards), `data-analytics`, and `product-ops`.

**Where skills add less:**

Domains where Claude's training already covers the framework well — `experimentation` hypothesis formulation, general `product-strategy` — show smaller gains. Vanilla Claude handles these reasonably without additional guidance.

**What skills prevent in practice:**

- **Hallucinated specifics.** Without a skill, the model invents numbers, thresholds, and recommendations on vague inputs. Skills stop and ask instead.
- **Skipped prerequisites.** Without a skill, the model proceeds with incomplete inputs. Skills surface what's missing before producing output.
- **Wrong output format.** Without a skill, responses are conversational. Skills enforce the structure a PM can actually hand off.


---

## 🏗️ Skill structure

Every skill is a standalone playbook:

```
experimentation/skills/estimate-sample-size/
├── SKILL.md        ← what to ask, how to reason, what to output
├── REFERENCE.md    ← formulas and methodology (calculation skills)
└── examples/       ← how the skill behaves with complete vs. incomplete inputs
```

Skills don't hallucinate methodology. If required inputs are missing, they stop and ask. If the math is uncertain, they say so.

---

## Where this sits

Part of [the layer underneath AI products](https://github.com/alexe-ev): the tools measure and route ([ai-economics](https://github.com/alexe-ev/ai-economics), [ai-ab-testing-tool](https://github.com/alexe-ev/ai-ab-testing-tool), [multi-model-router](https://github.com/alexe-ev/multi-model-router), [ml-impact-calculator](https://github.com/alexe-ev/ml-impact-calculator)); this repo packages the PM expertise itself so agents can execute it. Built by the maker of [Whisperly](https://whisperly.io).

## 🙌 Contributing

Contributions are welcome. Whether it's improving an existing skill, adding a new one, or benchmarking another domain — open a PR or issue.

When adding or editing a skill:

1. Follow the existing structure: `SKILL.md` + optional `REFERENCE.md` + `examples/`
2. Include at least one example with complete inputs and one with missing inputs
3. Skills should ask for missing information, not hallucinate it
4. Keep the scope tight — one skill, one job

