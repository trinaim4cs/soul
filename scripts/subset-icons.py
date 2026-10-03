"""Builds SOUL's icon font: a Material Symbols subset with only the glyphs in src/theme/icons.ts.

Usage: npm run icons:subset   (needs Python 3 with fonttools: `pip install fonttools`)

Outputs, committed to the repo:
  assets/fonts/SoulIcons-Light.ttf     (Material Symbols Outlined, weight 300)
  assets/fonts/SoulIcons-Regular.ttf   (Material Symbols Outlined, weight 400)
  assets/fonts/SoulIcons.codepoints.json  (what the fonts contain; a unit test compares it
                                           with src/theme/icons.ts so a stale font is caught)
"""

import json
import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
ICONS_TS = ROOT / "src" / "theme" / "icons.ts"
SOURCE = ROOT / "node_modules" / "@expo-google-fonts" / "material-symbols"
OUT = ROOT / "assets" / "fonts"

WEIGHTS = [
    ("300Light/MaterialSymbols_300Light.ttf", "SoulIcons-Light.ttf", "Light", 300),
    ("400Regular/MaterialSymbols_400Regular.ttf", "SoulIcons-Regular.ttf", "Regular", 400),
]


def read_glyphs() -> dict[str, int]:
    text = ICONS_TS.read_text(encoding="utf-8")
    block = re.search(r"iconGlyphs = \{(.*?)\} as const", text, re.S)
    if not block:
        sys.exit("Could not find `iconGlyphs` in src/theme/icons.ts")
    glyphs = {name: int(code, 16) for name, code in re.findall(r"(\w+): 0x([0-9a-fA-F]+)", block.group(1))}
    if not glyphs:
        sys.exit("`iconGlyphs` is empty")
    return glyphs


def rename(font: TTFont, style: str) -> None:
    names = {1: "SoulIcons", 2: style, 4: f"SoulIcons {style}", 6: f"SoulIcons-{style}", 16: "SoulIcons", 17: style}
    table = font["name"]
    for record in list(table.names):
        if record.nameID in names:
            table.setName(names[record.nameID], record.nameID, record.platformID, record.platEncID, record.langID)


def build(glyphs: dict[str, int]) -> None:
    codepoints = sorted(set(glyphs.values()))
    for source_name, out_name, style, weight in WEIGHTS:
        source = SOURCE / source_name
        if not source.exists():
            sys.exit(f"Missing {source}. Run `npm install` first.")
        options = subset.Options()
        options.layout_features = []  # glyphs are addressed by code point; no ligature table
        options.hinting = False
        options.glyph_names = False
        options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17]  # keep copyright and licence
        font = subset.load_font(str(source), options)
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=codepoints)
        subsetter.subset(font)
        rename(font, style)
        font["OS/2"].usWeightClass = weight

        cmap = font.getBestCmap()
        missing = [name for name, code in glyphs.items() if code not in cmap]
        if missing:
            sys.exit(f"{source_name} has no glyph for: {', '.join(missing)}")
        target = OUT / out_name
        subset.save_font(font, str(target), options)
        print(f"{out_name}: {len(codepoints)} glyphs, {target.stat().st_size} bytes")

    manifest = {name: glyphs[name] for name in sorted(glyphs)}
    # LF endings on every platform, so the file matches Prettier and the repo.
    with open(OUT / "SoulIcons.codepoints.json", "w", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    build(read_glyphs())
