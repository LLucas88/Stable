# Project contracts

## VIDEO_SPEC.md minimum fields

```markdown
# VIDEO SPEC
- Purpose:
- Audience:
- Platform:
- Canvas: 1080x1920, 30fps
- Target duration:
- Final narration file:
- Core message:
- Script editing permission: locked / light cleanup / editable
- Deliverables: MP4 + 3:4 cover + upload copy
```

## shot-plan.json shape

```json
{
  "format": {"width": 1080, "height": 1920, "fps": 30, "durationSec": 0},
  "safeZone": {"left": 72, "right": 180, "top": 160, "bottom": 300, "visualBottomMax": 1450},
  "captionPolicy": {"singleLineOnly": true, "semanticSplitOnly": true, "bottomPx": 300},
  "scenes": [{"id": 1, "start": 0, "end": 0, "purpose": "", "visual": "", "motionEvents": [], "evidence": [], "qa": ""}]
}
```

## ACCEPTANCE.md minimum checks

```markdown
- [ ] Final script and final audio match.
- [ ] Word timing is derived from final audio.
- [ ] Captions are semantic, single-line, and audio-faithful.
- [ ] No title, body, illustration, or caption overlap.
- [ ] Important elements stay inside safe zones.
- [ ] Meaningful visual change occurs about every two seconds.
- [ ] Concrete claims use real evidence when available.
- [ ] No unrelated logos, watermarks, player controls, black bars, or stretched glyphs.
- [ ] Contact sheet has been visually reviewed.
- [ ] Final MP4 is 1080x1920, 30fps, with audio.
- [ ] Release folder contains only MP4, 3:4 cover, and upload copy.
```
