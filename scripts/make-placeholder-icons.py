"""Temporary monochrome launcher-icon placeholders (DECISIONS C-21).

The wide SOUL wordmark is never squeezed into an app icon: the full logo is for the splash and
branding, and the app icon needs a compact mark. Until the owner approves an original or
licensed compact mark (a release blocker), every app icon is this neutral placeholder: a white
ring on black. It deliberately does not resemble the logo.

Outputs (Android via app.config.ts, iPhone PWA via public/):
  assets/images/icon-placeholder.png                 1024, black with a white ring
  assets/images/adaptive-icon-foreground-placeholder.png  1024, transparent, ring in the safe zone
  public/icons/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png, favicon-48.png

Usage: python scripts/make-placeholder-icons.py   (needs Pillow)
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BLACK = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)
SUPERSAMPLE = 4


def ring(size: int, radius_share: float, stroke_share: float, background) -> Image.Image:
    """A centred ring; drawn large and scaled down for smooth edges."""
    big = size * SUPERSAMPLE
    image = Image.new("RGBA", (big, big), background)
    draw = ImageDraw.Draw(image)
    radius = big * radius_share
    stroke = max(1, round(big * stroke_share))
    centre = big / 2
    draw.ellipse(
        [centre - radius, centre - radius, centre + radius, centre + radius],
        outline=WHITE,
        width=stroke,
    )
    return image.resize((size, size), Image.LANCZOS)


def save(image: Image.Image, path: Path, keep_alpha: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    (image if keep_alpha else image.convert("RGB")).save(path, optimize=True)
    print(path.relative_to(ROOT), image.size[0])


def main() -> None:
    images = ROOT / "assets" / "images"
    icons = ROOT / "public" / "icons"
    # Launcher icons fill the square; the ring sits well inside every mask shape.
    save(ring(1024, 0.22, 0.05, BLACK), images / "icon-placeholder.png")
    # Adaptive icon: the visible safe zone is the central 66 %, so keep the ring inside it.
    save(ring(1024, 0.17, 0.04, (0, 0, 0, 0)), images / "adaptive-icon-foreground-placeholder.png", keep_alpha=True)
    save(ring(192, 0.22, 0.05, BLACK), icons / "icon-192.png")
    save(ring(512, 0.22, 0.05, BLACK), icons / "icon-512.png")
    # Maskable: may be cropped to a circle holding the central 80 %.
    save(ring(512, 0.18, 0.045, BLACK), icons / "icon-maskable-512.png")
    save(ring(180, 0.22, 0.05, BLACK), icons / "apple-touch-icon.png")
    save(ring(48, 0.26, 0.08, BLACK), icons / "favicon-48.png")


if __name__ == "__main__":
    main()
