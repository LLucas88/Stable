#!/usr/bin/env python3
import argparse
import json
import re
from pathlib import Path


REQUIRED = ["INPUT_SCRIPT.md", "VIDEO_SPEC.md", "design.md", "shot-plan.json", "ACCEPTANCE.md"]
SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_-]{12,}"),
    re.compile(r"(?i)(api[_-]?key|token|secret)\s*[:=]\s*[\"']?[A-Za-z0-9_+./=-]{16,}"),
    re.compile(r"(?i)[A-Z]:\\Users\\[^\\\s]+"),
]


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit a semantic motion explainer project package.")
    parser.add_argument("project")
    args = parser.parse_args()
    root = Path(args.project).resolve()
    errors = []

    for name in REQUIRED:
        if not (root / name).is_file():
            errors.append(f"missing: {name}")

    plan_path = root / "shot-plan.json"
    if plan_path.is_file():
        try:
            plan = json.loads(plan_path.read_text(encoding="utf-8-sig"))
            fmt = plan.get("format", {})
            zone = plan.get("safeZone", {})
            captions = plan.get("captionPolicy", {})
            if (fmt.get("width"), fmt.get("height"), fmt.get("fps")) != (1080, 1920, 30):
                errors.append("format must be 1080x1920 at 30fps")
            expected = {"left": 72, "right": 180, "top": 160, "bottom": 300, "visualBottomMax": 1450}
            for key, value in expected.items():
                if zone.get(key) != value:
                    errors.append(f"safeZone.{key} must be {value}")
            if captions.get("singleLineOnly") is not True:
                errors.append("captions must be single-line")
            if captions.get("semanticSplitOnly") is not True:
                errors.append("captions must use semantic splitting")
        except Exception as exc:
            errors.append(f"invalid shot-plan.json: {exc}")

    release = root / "release"
    if release.exists():
        files = [p for p in release.iterdir() if p.is_file()]
        if files:
            exts = [p.suffix.lower() for p in files]
            images = sum(exts.count(ext) for ext in [".png", ".jpg", ".jpeg"])
            if exts.count(".mp4") != 1 or images != 1 or exts.count(".md") != 1 or len(files) != 3:
                errors.append("release must contain exactly one MP4, one cover image, and one Markdown upload copy")

    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() in {".mp4", ".mp3", ".wav", ".png", ".jpg", ".jpeg", ".woff", ".woff2"}:
            continue
        try:
            text = path.read_text(encoding="utf-8-sig")
        except UnicodeDecodeError:
            continue
        for pattern in SECRET_PATTERNS:
            if pattern.search(text):
                errors.append(f"possible sensitive value: {path.relative_to(root)}")
                break

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("OK: package contract and secret scan passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
