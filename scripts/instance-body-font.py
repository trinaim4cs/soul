"""Makes SOUL's static body-font files from the Plus Jakarta Sans variable font (SIL OFL 1.1).

Android's weight-mapped font families (expo-font config plugin) need one static file per
weight, so the variable font is instanced at 400, 500 and 600 (DECISIONS D-021).

Usage: python scripts/instance-body-font.py <path to PlusJakartaSans[wght].ttf>
Source: https://github.com/google/fonts/tree/main/ofl/plusjakartasans (needs fonttools)
"""

import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

OUT = Path(__file__).resolve().parent.parent / "assets" / "fonts"
FAMILY = "PlusJakartaSans"
WEIGHTS = [(400, "Regular"), (500, "Medium"), (600, "SemiBold")]


def main(source: str) -> None:
    for weight, style in WEIGHTS:
        font = instancer.instantiateVariableFont(TTFont(source), {"wght": weight})
        # Each weight is its own "Regular" style under a weight-named family (static-font
        # convention); Android and the web select by weight, not by these names.
        names = {1: f"Plus Jakarta Sans {style}", 2: "Regular", 4: f"Plus Jakarta Sans {style}",
                 6: f"{FAMILY}-{style}", 16: "Plus Jakarta Sans", 17: style}
        table = font["name"]
        table.removeNames(nameID=25)  # variable-font PostScript prefix, meaningless once static
        for name_id, value in names.items():
            table.setName(value, name_id, 3, 1, 0x409)
        font["OS/2"].usWeightClass = weight
        target = OUT / f"{FAMILY}-{style}.ttf"
        font.save(str(target))
        print(target.name, target.stat().st_size, "bytes")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
