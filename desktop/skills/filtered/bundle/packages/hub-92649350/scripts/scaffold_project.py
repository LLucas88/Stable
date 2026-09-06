#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a clean semantic motion explainer project.")
    parser.add_argument("--out", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--script-file", required=True)
    parser.add_argument("--duration", type=float, default=45.0)
    args = parser.parse_args()

    out = Path(args.out).resolve()
    script_path = Path(args.script_file).resolve()
    script = script_path.read_text(encoding="utf-8-sig").strip()
    if not script:
        raise SystemExit("Script is empty")

    for directory in ["assets/audio", "assets/evidence", "renders", "qa", "release"]:
        (out / directory).mkdir(parents=True, exist_ok=True)

    write(out / "INPUT_SCRIPT.md", f"# {args.title}\n\n{script}\n")
    write(out / "VIDEO_SPEC.md", f"""# VIDEO SPEC｜{args.title}

- Purpose: [fill]
- Audience: [fill]
- Platform: vertical short-video platforms
- Canvas: 1080x1920, 30fps
- Target duration: {args.duration:.2f}s
- Final narration file: assets/audio/voice.mp3
- Core message: [fill]
- Script editing permission: locked
- Deliverables: MP4 + 3:4 cover + upload copy
""")
    write(out / "design.md", """# Design

- Background: #f8f4eb editorial grid
- Text: #171717
- Accents: #e94733 / #1b5cb8 / #efb83d
- Safe zone: left 72, right 180, top 160, bottom 300
- Main visual bottom: <=1450px
- Captions: single line, semantic split, bottom 300px
- Chinese glyphs: no stretch or squeeze
""")
    plan = {
        "title": args.title,
        "format": {"width": 1080, "height": 1920, "fps": 30, "durationSec": args.duration},
        "safeZone": {"left": 72, "right": 180, "top": 160, "bottom": 300, "visualBottomMax": 1450},
        "captionPolicy": {"singleLineOnly": True, "semanticSplitOnly": True, "bottomPx": 300},
        "assets": {"voice": "assets/audio/voice.mp3", "wordTimestamps": "assets/audio/word-timestamps.json"},
        "scenes": []
    }
    write(out / "shot-plan.json", json.dumps(plan, ensure_ascii=False, indent=2) + "\n")
    write(out / "ACCEPTANCE.md", """# Acceptance

- [ ] Final script and final audio match.
- [ ] Word timing is derived from final audio.
- [ ] Captions are semantic, single-line, and audio-faithful.
- [ ] No title, body, illustration, or caption overlap.
- [ ] Important elements stay inside safe zones.
- [ ] Meaningful visual change occurs about every two seconds.
- [ ] Contact sheet has been visually reviewed.
- [ ] Final MP4 is 1080x1920, 30fps, with audio.
- [ ] Release folder contains only MP4, 3:4 cover, and upload copy.
""")
    write(out / "hyperframes.json", json.dumps({"version": 1, "name": out.name, "authoringSkill": "semantic-motion-explainer"}, ensure_ascii=False) + "\n")
    package_name = "".join(c.lower() if c.isalnum() else "-" for c in out.name).strip("-") or "semantic-motion-video"
    write(out / "package.json", json.dumps({"name": package_name, "private": True, "scripts": {"check": "hyperframes check", "render": "hyperframes render --output renders/final.mp4"}}, ensure_ascii=False, indent=2) + "\n")
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
