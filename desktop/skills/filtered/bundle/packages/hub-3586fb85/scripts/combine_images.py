#!/usr/bin/env python3
"""
Combine original photo and generated poster into a vertical comparison image.

Layout: Original photo on top, generated poster on bottom.
Background: Cream white (#F5F0E8).

Design contract (v3.0):
  - The poster image produced by ImageGen is itself a *complete* poster — it
    already contains the subject, typography, and any other editorial elements.
  - This script is responsible ONLY for laying out [original | poster] on the
    cream background. It must NOT render title / subtitle / color swatches,
    because doing so would duplicate content that is already inside the poster.
  - --title / --subtitle / --colors arguments are kept for backward
    compatibility but are no longer drawn. Pass them only if you want them
    logged; they will not appear in the output image.

Usage:
  python combine_images.py <original_path> <poster_path> <output_path> \
    [--width 1024] \
    [--title "Title (logged only)"] \
    [--subtitle "subtitle (logged only)"] \
    [--colors "#hex1,#hex2,#hex3,#hex4 (logged only)"]

Requirements: Pillow (PIL)
"""

import sys
import os
import argparse
from PIL import Image, ImageDraw

# -- Constants --
CREAM_BG = (245, 240, 232)       # #F5F0E8
DEFAULT_WIDTH = 1024
PADDING = 48
GAP = 64
DIVIDER_COLOR = (220, 215, 205)


def resize_to_width(img: Image.Image, width: int) -> Image.Image:
    """Resize image to target width, maintaining aspect ratio."""
    ratio = img.width / img.height if img.height > 0 else 1.0
    new_height = max(1, int(width / ratio))
    return img.resize((width, new_height), Image.LANCZOS)


def combine_images(
    original_path: str,
    poster_path: str,
    output_path: str,
    width: int = DEFAULT_WIDTH,
    # The following three params are accepted but intentionally NOT drawn.
    # Kept so existing callers do not break.
    title: str = "",
    subtitle: str = "",
    colors: list = None,
) -> str:
    """
    Stack the original photo on top of the generated poster on a cream
    background.  The poster is treated as a complete artifact — no extra
    text or swatches are drawn on top of or below it.
    """
    # -- Load --
    original = Image.open(original_path).convert("RGB")
    poster = Image.open(poster_path).convert("RGB")

    # -- Resize both to the same content width --
    original_resized = resize_to_width(original, width)
    poster_resized = resize_to_width(poster, width)

    # -- Canvas dimensions: top(original) + gap + bottom(poster) + padding --
    canvas_width = width + 2 * PADDING
    total_height = (
        PADDING
        + original_resized.height
        + GAP
        + poster_resized.height
        + PADDING
    )

    # -- Create canvas --
    canvas = Image.new('RGB', (canvas_width, total_height), CREAM_BG)
    draw = ImageDraw.Draw(canvas)

    # -- Paste original at top --
    canvas.paste(original_resized, (PADDING, PADDING))

    # -- Thin dividing line between original and poster --
    line_y = PADDING + original_resized.height + GAP // 2
    draw.line(
        [(PADDING, line_y), (canvas_width - PADDING, line_y)],
        fill=DIVIDER_COLOR, width=1,
    )

    # -- Paste poster below (complete poster, no overlays) --
    poster_y = PADDING + original_resized.height + GAP
    canvas.paste(poster_resized, (PADDING, poster_y))

    # -- Save --
    canvas.save(output_path, quality=95)
    print(f"OK Combined image saved: {output_path}")
    print(f"   Canvas: {canvas_width}x{total_height}px")
    return output_path


def main():
    parser = argparse.ArgumentParser(
        description='Combine original photo and poster into vertical comparison image')
    parser.add_argument('original', help='Path to original photo')
    parser.add_argument('poster', help='Path to generated poster image')
    parser.add_argument('output', help='Output path for combined image')
    parser.add_argument('--width', type=int, default=DEFAULT_WIDTH,
                        help=f'Target width in pixels (default: {DEFAULT_WIDTH})')
    # Kept for backward compatibility but no longer rendered.
    parser.add_argument('--title', default='',
                        help='(Logged only — not drawn. Poster contains its own title.)')
    parser.add_argument('--subtitle', default='',
                        help='(Logged only — not drawn. Poster contains its own subtitle.)')
    parser.add_argument('--colors', default='',
                        help='(Logged only — not drawn. Palette lives inside the poster.)')

    args = parser.parse_args()

    if args.title:
        print(f"   Title (logged, not drawn): {args.title}")
    if args.subtitle:
        print(f"   Subtitle (logged, not drawn): {args.subtitle}")
    if args.colors:
        print(f"   Palette (logged, not drawn): {args.colors}")

    try:
        combine_images(
            args.original, args.poster, args.output,
            width=args.width,
            title=args.title,
            subtitle=args.subtitle,
        )
    except FileNotFoundError as e:
        print(f"Error: File not found - {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
