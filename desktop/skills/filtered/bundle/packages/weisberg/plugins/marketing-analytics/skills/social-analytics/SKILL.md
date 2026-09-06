---
name: weisberg-social-analytics
description: Use when the user mentions social media analytics, social performance, Facebook insights, Instagram analytics, LinkedIn analytics, TikTok analytics, YouTube analytics, X analytics, Twitter analytics, social engagement, social reach, share of voice, social sentiment, brand mentions, social content performance, viral content, social ROI, social listening, or social benchmarking. Also trigger on 'how are we doing on social' or 'what's performing on LinkedIn.' For a full cross-channel competitor benchmark (keywords, ads, pricing, traffic) use competitive-intel; for paid-ad platform metrics like CPA/ROAS use paid-media; this skill owns owned/earned social performance and sentiment. If social platform data is not yet in the workspace, run data-extraction first.
metadata:
  source-name: social-analytics
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Social Media Analytics

Cross-platform social performance normalization, content and cadence analysis,
transformer-based sentiment with crisis detection, and share-of-voice
benchmarking.

## Contract

**Role:** Advisory analyst. Reports social performance and sentiment; does not
post or boost content. Normalization, sentiment, and SOV run in deterministic
Python scripts.

**Mode:**
- `quick` — normalize + cross-platform engagement summary.
- `standard` (default) — add content/cadence analysis and sentiment.
- `deep` — add share-of-voice benchmarking and influencer/earned-media value.

**When to use:** platform performance, engagement/reach, social sentiment and
crisis signals, brand mention share of voice, content-type benchmarking.

**When NOT to use:** full competitor benchmark across channels → `competitive-intel`;
paid-ad platform metrics (CPA, ROAS, creative fatigue) → paid-media; open-text
survey feedback → `voc-analytics`. See `../../references/skill-index.md`.

**Evidence required (inputs):**
- `workspace/raw/social_performance_{platform}.csv` — platform post performance
  (required). If absent, STOP and run **data-extraction** first.
- `workspace/raw/social_mentions.csv` — brand mentions from social listening
  (optional; enables sentiment/SOV).
- `workspace/raw/competitor_social.csv` — competitor metrics (optional;
  benchmarking).

**Depends on:** data-extraction. **Feeds into:** competitive-intel (SOV),
attribution-analysis (paid social as a channel), reporting, seo-content. Builder
detail in `references/authoring-notes.md`.

**Hard STOP (crisis signal):** if negative-sentiment volume exceeds the configured
threshold (default 3× SD above the rolling mean), STOP the routine reporting flow
and lead with a crisis alert — spike magnitude, start time, sample mentions,
affected platforms, and recommended immediate actions. A brand crisis outranks the
standard dashboard.

Parse `$ARGUMENTS` for inline paths, platforms, or crisis threshold overrides.

## Workflow

1. **Validate & normalize.** Load platform files; run `scripts/normalize_social.py`
   to map platform-native fields to the unified schema (impressions, reach,
   engagements, likes, comments, shares, clicks, video_views, followers),
   engagement_rate = engagements / reach. See `references/social_api_mapping.md`.

2. **View gate (AskUserQuestion).** When both organic and paid metrics are present,
   ask before aggregating:
   - **Question:** "Which view of social performance do you want?"
   - **Options:** (a) *Organic only* — earned reach/engagement from non-boosted
     posts; (b) *Paid only* — boosted/promoted metrics; (c) *Blended* — combined
     with organic/paid drill-down. Default blended when unspecified.
   attribution-analysis consumes only the paid component.

3. **Content & cadence.** Run `scripts/social_content_analysis.py`: content-type
   benchmarking, topic/theme classification, optimal posting cadence, and
   best-time-to-post heatmaps.

4. **Sentiment.** Run `scripts/sentiment_analysis.py` (transformer model): classify
   mentions positive/neutral/negative with intensity; detect rising themes; run the
   Hard STOP crisis check. See `references/sentiment_methodology.md`.

5. **Share of voice** (deep mode). Run `scripts/social_share_of_voice.py`:
   brand_mentions / total_category_mentions with consistent windows/queries;
   breakdown by platform, sentiment, content type; competitor engagement/follower
   benchmarking.

6. **Influencer/earned media** (deep mode). Partner-attributed reach/engagement,
   earned media value at equivalent paid CPM, audience overlap.

7. **Report.** Write outputs and the HTML dashboard.

## Output Format

Artifacts:

| File | Contents |
|------|----------|
| `workspace/analysis/social_performance.json` | Cross-platform engagement metrics + content analysis |
| `workspace/analysis/social_sentiment.json` | Sentiment scores, topic themes, crisis signals |
| `workspace/analysis/social_benchmarks.json` | Competitive share of voice and benchmarking |
| `workspace/reports/social_dashboard.html` | Cross-platform social dashboard |

Report states: view (organic/paid/blended), sentiment model used, and SOV window.
When the crisis STOP fires, the alert leads the readout.

**Financial services mode:** flag posts missing FINRA Rule 2210 disclosures;
testimonials/endorsements must follow SEC Marketing Rule disclosure; employee posts
about fund performance need pre-approval and archival; crisis detection includes
regulatory-inquiry and litigation-risk signals. Customer-facing social copy routes
through **compliance-review**.

**Completion status:**
- `DONE` — normalized performance, sentiment, and requested benchmarks written.
- `DONE_WITH_CONCERNS` — e.g., missing mention data (no sentiment/SOV), reach
  unavailable (impressions fallback used).
- `BLOCKED` — no platform data; state the fix.
- `NEEDS_CONTEXT` — organic/paid/blended view unresolved by the user.

## Anti-Patterns

- Burying a crisis-level negative-sentiment spike inside routine dashboard prose.
- Keyword-matching sentiment instead of the transformer model.
- Comparing engagement across platforms without normalizing to engagement / reach.
- Mixing organic and paid metrics into one number with no drill-down.
- Inconsistent SOV windows/queries across competitors.
- Float arithmetic on monetary values instead of `decimal.Decimal`.
