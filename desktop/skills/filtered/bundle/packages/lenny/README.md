# Lenny's Product Skills for Claude Code — 2.0

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Skills](https://img.shields.io/badge/skills-76-blue)](https://github.com/RefoundAI/lenny-skills/tree/v2/skills)

**76 product management and engineering skills**, distilled from the full archive of [Lenny's Podcast](https://www.lennyspodcast.com/) and [Lenny's Newsletter](https://www.lennysnewsletter.com/): 597 episodes and posts, 4,019 sourced insights, every quote verified verbatim against its source.

Curated by [Refound AI](https://refoundai.com). Browse the full database with guides, quotes, and templates at [refoundai.com/lenny-skills](https://refoundai.com/lenny-skills/).

## What's new in 2.0

- **Organized as a product operating model** — skills are grouped into the process areas a product org actually runs: strategy, planning, discovery, building, launch, growth, team, and operating cadence, plus vertical playbooks and a career track.
- **Newsletter content included** — 1.0 was podcast-only; 2.0 adds frameworks and templates from 349 newsletter posts, including the 'How X builds product' series.
- **Templates & frameworks per skill** — each skill ships with the named frameworks, checklists, and templates guests actually use, in `references/artifacts.md`.
- **Verified quotes** — every quote is checked verbatim against the source transcript or post. No paraphrase drift.

## What are Skills?

Skills are markdown files that give AI agents specialized knowledge and workflows. Add them to your project and Claude Code (or any agent that reads `SKILL.md` files) applies the right frameworks when you work on a matching task.

## Installation

Copy any skill folder into your project's `.claude/skills/` directory:

```bash
git clone https://github.com/RefoundAI/lenny-skills.git
cp -R lenny-skills/skills/writing-prds .claude/skills/
```

Or grab individual skills with download links at [refoundai.com/lenny-skills](https://refoundai.com/lenny-skills/).

## The Skills

### Strategy & Positioning

| Skill | What it helps you do | Sources |
|---|---|---|
| [Defining Product Strategy](skills/defining-product-strategy/) | Transform vision into a concrete plan of action by making hard choices that drive customer behavior. | 47 |
| [Product Vision Creation](skills/product-vision/) | Design an aspirational future state that inspires teams and guides strategic decision-making. | 22 |
| [Strategic Product Positioning](skills/positioning/) | Define the context that makes your product's unique value obvious and undeniable | 28 |
| [Pricing Strategy & Optimization](skills/pricing-strategy/) | Design and iterate on pricing models that capture the true value of your product. | 21 |
| [North Star Metrics](skills/north-star-metrics/) | Align your team and strategy around a single, quantifiable measure of customer value and business success. | 15 |
| [Measuring Product-Market Fit](skills/measuring-pmf/) | Transition from pushing your product to feeling the market pull it out of you. | 21 |
| [Competitive Strategy](skills/competitive-strategy/) | Build durable moats and outmaneuver rivals by identifying structural power and customer-centric differentiation. | 24 |
| [Recovering From Failure](skills/recovering-from-failure/) | Turn product setbacks and stalled growth into strategic breakthroughs and pivots. | 20 |

### Planning & Prioritization

| Skill | What it helps you do | Sources |
|---|---|---|
| [Roadmap Prioritization](skills/roadmap-prioritization/) | Transform a chaotic backlog into a high-ROI strategic plan based on evidence and appetite. | 43 |
| [Goal Setting and OKRs](skills/goal-setting-okrs/) | Drive organizational focus by translating long-term strategy into ambitious measurable outcomes. | 19 |
| [Planning Cadence Optimization](skills/planning-cadence/) | Align long-term strategy with short-term execution through structured, tiered planning rituals. | 13 |
| [High Stakes Decision Making](skills/high-stakes-decisions/) | Navigate irreversible choices and extreme uncertainty with speed and structural clarity. | 30 |
| [Evaluating Trade-Offs](skills/evaluating-trade-offs/) | Master the art of weighing competing options to maximize long-term impact and team velocity. | 14 |

### Discovery & Research

| Skill | What it helps you do | Sources |
|---|---|---|
| [Mastering Customer Interviews](skills/customer-interviews/) | Uncover deep user pain and behavioral triggers to build products people actually need. | 11 |
| [Continuous Product Discovery](skills/continuous-discovery/) | Turn customer feedback from a periodic chore into a high-frequency engine for product decisions. | 23 |
| [Idea Validation](skills/idea-validation/) | Stop building things people don't want by moving from opinion to evidence-based development. | 34 |
| [Product Experimentation Excellence](skills/product-experiments/) | Drive measurable growth and mitigate risk through rigorous A/B testing and data-driven learning. | 9 |
| [Defining Your ICP](skills/defining-icp/) | Narrow your focus to win a market beachhead and build undeniable momentum. | 15 |
| [Analyzing User Feedback](skills/analyzing-user-feedback/) | Transform raw signals into actionable insights by scaling empathy and synthesis. | 19 |
| [Product Taste and Intuition](skills/product-taste/) | Develop a reliable internal compass to recognize and build world-class products. | 36 |

### Building & Shipping

| Skill | What it helps you do | Sources |
|---|---|---|
| [Writing Product Requirement Documents](skills/writing-prds/) | Define clear problems and bounded solutions to maximize team velocity and creative output. | 14 |
| [Shipping Velocity](skills/shipping-velocity/) | Accelerate execution by removing organizational friction and establishing a high-intensity shipping culture. | 19 |
| [AI-Assisted Prototyping](skills/ai-assisted-prototyping/) | Transform abstract product concepts into functional, interactive software using natural language and AI tools. | 15 |
| [Building With AI Agents](skills/building-with-ai-agents/) | Transition from writing lines of code to directing a parallel team of autonomous agents. | 15 |
| [Product Stack Strategy](skills/product-tool-stack/) | Build a high-performance product toolkit by balancing established standards with AI-native speed. | 6 |
| [Engineering Health and Productivity](skills/engineering-health/) | Maintain high shipping velocity by balancing technical excellence with strategic developer investments. | 18 |

### Launch & Go-to-Market

| Skill | What it helps you do | Sources |
|---|---|---|
| [Product Launch Planning](skills/launch-planning/) | Build momentum and drive adoption by turning product updates into remarkable market events. | 18 |
| [PLG Sales Integration](skills/plg-sales-integration/) | Bridge the gap between self-serve adoption and enterprise deal-making to maximize revenue. | 13 |
| [Mastering Enterprise Sales Motion](skills/enterprise-sales-motion/) | Transition from founder-led sales to a repeatable, scalable enterprise engine. | 16 |
| [Acquiring First B2B Customers](skills/first-b2b-customers/) | Transition from zero to your first ten paying customers through manual hustle and high-trust relationships. | 7 |
| [Marketing Org and Stack](skills/marketing-org-and-stack/) | Architect high-performing marketing organizations by aligning specialized talent with scalable data infrastructure. | 11 |
| [Mastering PR and Press](skills/pr-and-press/) | Turn media coverage into a strategic engine for credibility, growth, and brand authority. | 9 |
| [Naming and Branding](skills/naming-and-branding/) | Build a distinctive identity that acts as a permanent competitive weapon and emotional anchor. | 11 |

### Growth & Retention

| Skill | What it helps you do | Sources |
|---|---|---|
| [Building a Sustainable Growth Model](skills/growth-model/) | Move beyond linear funnels to build compounding loops that drive scalable, long-term product growth. | 30 |
| [Acquisition Channel Strategy](skills/acquisition-channels/) | Identify, test, and scale the distribution engines that drive sustainable growth. | 25 |
| [User Onboarding and Activation](skills/user-onboarding-activation/) | Bridge the gap between initial signup and realized value to maximize long-term retention. | 25 |
| [Retention and Engagement Mastery](skills/retention-engagement/) | Build sustainable growth by embedding products into workflows and creating compounding user value. | 17 |
| [Referrals and Word-of-Mouth](skills/referrals-word-of-mouth/) | Turn user satisfaction into a high-leverage growth engine through organic advocacy and structured referral loops. | 13 |
| [SEO Growth Strategy](skills/seo-strategy/) | Turn organic search into a scalable acquisition engine using programmatic data and systematic experimentation. | 9 |
| [Growth Experimentation Velocity](skills/growth-experimentation/) | Build a high-output engine to compound small wins into massive growth. | 10 |
| [International Market Expansion](skills/international-expansion/) | Scale your product globally by balancing local empathy with operational playbooks. | 8 |

### Team & Organization

| Skill | What it helps you do | Sources |
|---|---|---|
| [Hiring World-Class Product Talent](skills/hiring-product-talent/) | Build a high-leverage product organization by sourcing, evaluating, and closing the top 1% of talent. | 30 |
| [Interviewing and Evaluating Candidates](skills/interviewing-evaluating-candidates/) | Move beyond resumes to assess high-fidelity signals like agency, first-principles thinking, and actual craft. | 48 |
| [Organizational Design for Product and Engineering](skills/org-design/) | Structure your teams to maximize autonomy, speed, and strategic alignment. | 60 |
| [Building a Growth Team](skills/building-growth-team/) | Assemble and structure a high-impact team to scale distribution and optimize the user journey. | 14 |
| [Founding Executive Team Building](skills/founding-exec-team/) | Design and scale the core leadership layer that drives company growth from zero to one. | 15 |
| [Coaching and Talent Development](skills/coaching-development/) | Build a high-performing team by shifting from a problem-solver to a growth-accelerator. | 34 |
| [Building High-Performing Team Culture](skills/team-culture/) | Establish a culture of ownership, transparency, and intensity to drive long-term product success. | 53 |
| [Giving Effective Feedback](skills/giving-feedback/) | Transform difficult conversations into catalysts for growth and high performance. | 30 |
| [Fixing Underperforming Teams](skills/fixing-underperforming-teams/) | Diagnose the root cause of dysfunction and take decisive action to restore high performance. | 12 |
| [Leading Organizational Change](skills/leading-org-change/) | Transform culture, structure, and operations without breaking the business. | 58 |

### Operating Cadence & Communication

| Skill | What it helps you do | Sources |
|---|---|---|
| [Effective Product Reviews](skills/product-reviews/) | Run rigorous alignment sessions that raise the quality bar and accelerate decision-making. | 12 |
| [Executive Communication](skills/executive-communication/) | Master the art of framing, transparency, and decision-ready communication to build trust with leadership. | 9 |
| [Managing Up for Leaders](skills/managing-up/) | Transform your relationship with leadership from a reporting line into a high-trust strategic partnership. | 21 |
| [Running Effective Meetings](skills/running-meetings/) | Transform calendars from soul-crushing time-sinks into high-velocity alignment machines. | 12 |
| [Written Communication for Leaders](skills/written-communication/) | Scale your influence and drive alignment through structured, clear, and persuasive writing. | 12 |
| [Stakeholder Alignment](skills/stakeholder-alignment/) | Drive cross-functional momentum by mapping incentives and co-creating solutions | 57 |

### Playbook: Marketplaces

| Skill | What it helps you do | Sources |
|---|---|---|
| [Marketplace Fundamentals](skills/marketplace-fundamentals/) | Build, bootstrap, and scale a self-sustaining ecosystem of buyers and sellers. | 7 |
| [Supply Demand Balance](skills/supply-demand-balance/) | Master marketplace liquidity by identifying bottlenecks and strategically scaling the harder side of the market. | 6 |
| [Marketplace Liquidity and Take Rates](skills/marketplace-liquidity-take-rates/) | Optimize the balance between transaction reliability and monetization to build a defensible ecosystem. | 6 |

### Playbook: Building AI Products

| Skill | What it helps you do | Sources |
|---|---|---|
| [AI Product Strategy](skills/ai-product-strategy/) | Prioritize high-impact workflows and navigate non-deterministic development to build defensible AI products. | 34 |
| [AI Evaluation Strategy](skills/ai-evals/) | Move beyond vibe checks to systematic, empirical measurement of AI product quality and reliability. | 11 |
| [Designing AI-Native User Experiences](skills/ai-native-ux/) | Transition from static interfaces to fluid, intent-driven interactions that leverage model intelligence. | 14 |

### Playbook: Zero to One

| Skill | What it helps you do | Sources |
|---|---|---|
| [Evaluating Startup Ideas](skills/evaluating-startup-ideas/) | Systematically validate problem-solution fit, market timing, and business viability before you build. | 28 |
| [Startup Fundraising and Exits](skills/fundraising/) | Master the art of raising capital, managing investor relations, and navigating strategic acquisitions. | 16 |
| [Founder-Led Sales](skills/founder-sales/) | Master the art of personally selling your product to build trust and find product-market fit. | 6 |

### Playbook: Enterprise & PLG

| Skill | What it helps you do | Sources |
|---|---|---|
| [PLG Fundamentals](skills/plg-fundamentals/) | Transform your product into the primary engine for distribution, activation, and expansion. | 9 |

### Career

| Skill | What it helps you do | Sources |
|---|---|---|
| [Breaking Into Product Management](skills/breaking-into-product/) | Strategically navigate the competitive path to your first product management role. | 11 |
| [PM Career Growth](skills/pm-career-growth/) | Transition from task-executor to high-impact product leader by mastering influence, ownership, and strategic foresight. | 99 |
| [Navigating Career Transitions](skills/career-transitions/) | Move beyond the default path by optimizing for high-growth environments and internal energy. | 56 |
| [Building a Promotion Case](skills/building-a-promotion-case/) | Turn your professional impact into a compelling, data-backed argument for your next career move. | 6 |
| [Negotiating Tech Compensation](skills/negotiating-compensation/) | Master the art of benchmarking, intelligence gathering, and collaborative negotiation to maximize your total rewards. | 1 |
| [Personal Brand Network](skills/personal-brand-network/) | Transform your professional expertise into a magnetic network and a high-affinity audience. | 21 |
| [Mastery of Public Speaking](skills/public-speaking/) | Transform your technical expertise into compelling narratives that command authority and drive action. | 12 |
| [Time and Energy Management](skills/time-energy-management/) | Protect your focus and fuel your performance by treating time and energy as strategic assets. | 46 |
| [Founder Psychology and Resilience](skills/founder-psychology/) | Mastering the internal landscape to sustain high performance and navigate the emotional roller coaster of leadership. | 38 |

## Attribution

All insights, quotes, frameworks, and templates originate from Lenny Rachitsky's podcast and newsletter and remain his and his guests' intellectual property. Every skill links back to the source episodes and posts. If you find these useful, [subscribe to Lenny's Newsletter](https://www.lennysnewsletter.com/subscribe).

## Contributing

Found a way to improve a skill? Open a PR. Please keep quotes verbatim and sourced.

## License

MIT for the skill file structure and organization. Underlying content belongs to Lenny Rachitsky and podcast guests; used with attribution, free, and ungated.
