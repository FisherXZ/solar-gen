"""Generate the static Open Graph image for public share pages.

Output: frontend/public/og-share.png  (1200x630, the OG standard size)

Palette (from frontend/DESIGN.md):
- surface-primary   #1C1A17  background
- surface-raised    #252320  inner card
- accent-amber      #E8A230  brand
- text-primary      #FFF8EB  warm ivory
- text-tertiary     rgba(#FFF8EB, 0.38)

Run:
    python3 scripts/generate_og_share.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1200, 630
BG = (28, 26, 23)          # #1C1A17
CARD = (37, 35, 32)        # #252320
AMBER = (232, 162, 48)     # #E8A230
IVORY = (255, 248, 235)    # #FFF8EB
TERTIARY = (255, 248, 235, 97)  # ~0.38 alpha


def _load_font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont:
    """Best-effort load of a system serif/sans font, falling back gracefully."""
    candidates = [
        # Prefer Lora-ish serif for display; fall back to system serifs.
        "/System/Library/Fonts/Supplemental/Georgia Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Georgia.ttf",
        "/System/Library/Fonts/Times.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def main() -> None:
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img, "RGBA")

    # Subtle inner card
    padding = 60
    draw.rounded_rectangle(
        (padding, padding, WIDTH - padding, HEIGHT - padding),
        radius=24,
        fill=CARD,
    )

    # Amber accent bar (top-left of card)
    draw.rounded_rectangle(
        (padding + 40, padding + 48, padding + 44, padding + 120),
        radius=2,
        fill=AMBER,
    )

    # Overline
    overline_font = _load_font(22, bold=True)
    draw.text(
        (padding + 70, padding + 50),
        "SHARED CONVERSATION",
        fill=(255, 248, 235, 140),  # muted ivory
        font=overline_font,
    )

    # Big headline (serif)
    head_font = _load_font(82, bold=True)
    draw.text(
        (padding + 70, padding + 95),
        "Research from",
        fill=IVORY,
        font=head_font,
    )
    draw.text(
        (padding + 70, padding + 195),
        "Civ Robotics",
        fill=AMBER,
        font=head_font,
    )

    # Subhead
    sub_font = _load_font(30)
    draw.text(
        (padding + 70, padding + 320),
        "A snapshot from our solar project discovery agent.",
        fill=(255, 248, 235, 150),
        font=sub_font,
    )

    # Footer wordmark area
    footer_font = _load_font(22, bold=True)
    draw.text(
        (padding + 70, HEIGHT - padding - 55),
        "civrobotics.com",
        fill=(255, 248, 235, 120),
        font=footer_font,
    )

    # Amber sun glyph bottom-right
    sun_cx, sun_cy, sun_r = WIDTH - padding - 90, HEIGHT - padding - 70, 26
    draw.ellipse(
        (sun_cx - sun_r, sun_cy - sun_r, sun_cx + sun_r, sun_cy + sun_r),
        fill=AMBER,
    )
    # Simple ray marks
    for angle in range(0, 360, 45):
        import math

        rad = math.radians(angle)
        x1 = sun_cx + int((sun_r + 10) * math.cos(rad))
        y1 = sun_cy + int((sun_r + 10) * math.sin(rad))
        x2 = sun_cx + int((sun_r + 22) * math.cos(rad))
        y2 = sun_cy + int((sun_r + 22) * math.sin(rad))
        draw.line((x1, y1, x2, y2), fill=AMBER, width=4)

    out = Path(__file__).resolve().parent.parent / "frontend" / "public" / "og-share.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "PNG", optimize=True)
    print(f"wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
