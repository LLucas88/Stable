---
name: alexe-assess-product-market-fit
description: Evaluate how well a product or feature addresses real market needs and identify gaps or risks in product-market fit. Use this skill when a team needs to understand whether their product resonates with the target market.
metadata:
  source-name: assess-product-market-fit
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Assess Product-Market Fit

## Purpose
Evaluate current product-market fit signals, identify gaps, and provide a structured view of where fit is strong, weak, or unknown.

## Skill type
Conceptual skill with diagnostic output

## Use this skill when
- A team is unsure whether they have found product-market fit
- A new product or feature is being evaluated before scaling
- There are mixed signals from retention, growth, or user feedback
- Leadership wants a structured fit assessment before major investment

## Do not use this skill when
- The team needs vision or mission work (use define-product-vision)
- The team needs competitive differentiation (use frame-competitive-differentiation)
- The goal is roadmap prioritization, not fit assessment

## Required inputs
- Product description or area
- Target segment
- Available signals (retention data, NPS, qualitative feedback, growth metrics — even rough)

## Optional inputs
- Churn rates or reasons
- User interview summaries
- Comparison to competitors
- Business model context

## Upstream context
Works best when:
- Product vision is already defined
- Target segment is identified
- Some behavioral or attitudinal data exists

## If upstream context is missing
If no signals are available, do not fabricate a fit assessment.
Produce a framework for what signals should be collected first.

## Downstream handoff
Output can feed:
- build-portfolio-roadmap-strategy (adjust investment based on fit)
- frame-competitive-differentiation (strengthen fit through positioning)

## Instructions
1. Identify available fit signals (retention, engagement, qualitative feedback, NPS/CSAT, growth pattern).
2. Classify each signal as strong / weak / missing.
3. Assess overall fit level: pre-fit / early signals / strong signals / confirmed fit.
4. Identify the biggest gaps or risks to fit.
5. Recommend next steps to validate or strengthen fit.

## Output
Provide:
- Fit assessment level: pre-fit / early signals / strong signals / confirmed fit
- Key signals supporting the assessment
- Gaps and risks
- Recommended next steps
- Confidence level in the assessment

## Risks / caveats
- Do not declare product-market fit from a single metric
- Retention and qualitative resonance are stronger signals than vanity growth metrics
- Be explicit when data is too thin to support a conclusion
