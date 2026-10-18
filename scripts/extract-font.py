"""Run only when updating the bundled font. Requires fonttools."""
import json
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.boundsPen import BoundsPen
root = Path(__file__).resolve().parents[1]
f = TTFont(root / "src/assets/fonts/Unbounded-SemiBold.ttf")
glyphs = f.getGlyphSet()
cmap = f.getBestCmap()
output = {"unitsPerEm": f["head"].unitsPerEm, "glyphs": {}}
for code in range(32, 127):
    glyph = glyphs[cmap[code]]
    pen = DecomposingRecordingPen(glyphs)
    glyph.draw(pen)
    bounds = BoundsPen(glyphs)
    glyph.draw(bounds)
    output["glyphs"][chr(code)] = {"advance": glyph.width, "bounds": bounds.bounds, "commands": pen.value}
(root / "src/assets/fonts/unbounded-600-glyphs.json").write_text(json.dumps(output, separators=(",", ":")) + "\n", encoding="utf-8")
