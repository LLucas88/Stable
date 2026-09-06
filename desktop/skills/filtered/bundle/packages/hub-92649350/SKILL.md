---
name: hub-92649350-semantic-motion-explainer
description: Turn a finalized Chinese narration or article excerpt into a 9:16 faceless editorial motion-graphics video with semantic one-line captions, narration-driven timing, conservative cross-platform safe zones, an independently designed 3:4 cover, and a verified three-file release package. Use for Chinese knowledge, opinion, tutorial, or AI explainer videos; do not use for talking-head recuts or footage-first edits.
metadata:
  source-name: semantic-motion-explainer
  bundle: ops-expanded-2026-09-06
  upstream-slug: semantic-motion-explainer
  upstream-version: 1.0.0
  upstream-displayName: 语义动效短视频生成
  upstream-summary: 将定稿中文口播制作为带语义字幕的 9:16 竖屏动效短视频，输出视频、封面与发布文案三件套
  upstream-tags: '["视频创作", "竖屏短视频", "语义字幕", "口播视频"]'
  upstream-metadata: '{}'
license: MIT
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Semantic Motion Explainer

Create a publishable video, not a slideshow or a project shell. Preserve the user's finalized wording and factual claims. The final narration is the timing source of truth.

## Required workflow

1. Confirm the final script. If the user says it is final, do not rewrite it.
2. Generate or import the final narration before designing scenes.
3. Derive word-level timing from that exact audio, then split captions by Chinese meaning. Never time captions from an earlier script.
4. Create `VIDEO_SPEC.md`, `design.md`, `shot-plan.json`, and `ACCEPTANCE.md` before rendering. Read [workflow](references/workflow.md) and [contracts](references/contracts.md).
5. Build a 1080×1920, 30fps composition. When HyperFrames is available, use it for the editable composition, inspection, capture, and render loop.
6. Design scenes as visual explanations of the narration. Each scene follows **setup → change → reveal**. About every two seconds, introduce a meaningful action or new information; this does not require changing shots every two seconds.
7. Add one caption at a time in the dedicated caption band. Captions must match the audio and remain on one line.
8. Render, inspect representative frames and a contact sheet, verify audio/video properties, and fix observable problems.
9. Design a separate 3:4 cover. Do not crop a video frame into a cover.
10. Deliver only `MP4 + 3:4 cover + upload copy` in the release folder. Keep the editable project separately.

## Non-negotiable visual rules

Read [design system](references/design-system.md) before authoring.

- Canvas: 1080×1920, 9:16, 30fps.
- Conservative safe zone: left 72px, right 180px, top 160px, bottom 300px.
- Main visual bottom edge: approximately 1450px or above.
- Caption baseline zone: 300px from the bottom, isolated from the main visual.
- Chinese text must never be horizontally stretched, squeezed, or distorted.
- Main titles need natural tracking and comfortable line height. If a title collides with another element, use a deliberate two-line title instead of squeezing it.
- Captions are semantic, single-line, and audio-faithful. Split an overlong sentence into consecutive time cues; never auto-wrap it.
- Do not alternate light and dark backgrounds without a narrative reason.
- Do not use unrelated logos, screenshots, player controls, watermarks, or generic images as evidence.
- Avoid plastic glow, decorative bouncing, card piles, and motion that does not explain the narration.

## Evidence and scene choice

- Use real product screens or user-provided evidence when the narration makes a concrete claim.
- Use deterministic HTML/CSS/SVG motion for abstract relationships, processes, comparisons, counters, timelines, and state changes.
- Never hide missing evidence behind a visually similar image.
- A scene may remain on screen for several seconds if its internal state continues to change meaningfully.

## Verification

Completion requires all of the following:

- The final audio, word timing, captions, and rendered video use the same script version.
- Representative frames show no title/body/caption overlap.
- Important text and CTA elements stay inside the safe zone.
- No caption wraps to a second line.
- A contact sheet has been visually reviewed.
- The final MP4 has audio and the expected 1080×1920 dimensions.
- The release directory contains only the final MP4, one 3:4 cover, and upload copy.

Use `scripts/scaffold_project.py` to create a clean project contract and `scripts/audit_video_package.py` for deterministic package checks. A successful command or empty project is not completion.
