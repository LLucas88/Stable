# Production workflow

## 1. Lock the input

Save the approved narration as `INPUT_SCRIPT.md`. Record whether wording may be edited. If it is locked, only punctuation and caption segmentation may change.

## 2. Produce the final audio

Generate or import the final narration as `assets/audio/voice.mp3`. Do not design scene timing from estimated reading speed. Extract word-level timestamps from this file and save them as `assets/audio/word-timestamps.json`.

## 3. Build semantic captions

Create `assets/audio/subtitle-cues.json` from the final audio. Each cue should carry one spoken unit, usually 4–16 Chinese characters. A longer sentence becomes multiple sequential cues. Keep the original words and punctuation; do not rewrite for visual convenience.

## 4. Write the four contracts

- `VIDEO_SPEC.md`: purpose, audience, platform, duration, core message, input versions, deliverables.
- `design.md`: palette, typography, safe zones, caption appearance, reference and anti-reference rules.
- `shot-plan.json`: time-aligned scenes, visual task, motion events, evidence source, scene-level QA.
- `ACCEPTANCE.md`: content, audio, layout, rendering, and release checks.

Use `scripts/scaffold_project.py` to create these files, then replace placeholders with task-specific decisions.

## 5. Design semantic scenes

Do not map every sentence to a new shot. Group consecutive narration into 5–9 semantic scenes for a 30–60 second video. Within a scene, plan visible state changes approximately every two seconds.

Useful visual grammars:

- false progress → moving mechanism with a zero result;
- comparison → scale, split layout, or synchronized counters;
- process → nodes activate in sequence and emit a deliverable;
- uncertainty → result card reveals a question or missing evidence;
- iteration → V1 receives issue marks and becomes V2;
- conclusion → target, lock, stamp, or final output appears.

Prefer a single coherent visual metaphor over a pile of unrelated cards.

## 6. Author and render

When HyperFrames is available, create one editable composition and one final audio track. Keep animation seek-safe and timeline-driven. Run inspect/check, capture the opening, middle, boundaries, and ending, then render only after layout checks pass.

## 7. Visual QA

Generate a contact sheet with at least one frame per semantic scene and inspect it at phone scale. Check title spacing, safe zones, caption wrapping, unrelated logos, stalled scenes, inconsistent backgrounds, cheap effects, and missing evidence.

## 8. Cover and release

Design a separate 900×1200 or equivalent 3:4 cover. Test it at thumbnail size. The release folder contains exactly one final MP4, one cover image, and one Markdown upload copy.
