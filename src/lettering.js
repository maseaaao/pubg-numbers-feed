import font from "./assets/fonts/unbounded-600-glyphs.json" with { type: "json" };

// Draw the actual bundled Unbounded outlines. This avoids silent Pango/Windows
// font substitutions and makes icons independent of installed system fonts.
export function measure(text, size) {
  const scale = size / font.unitsPerEm;
  const glyphs = [...text].map((ch) => font.glyphs[ch]);
  return {
    widths: glyphs.map((g) => g.advance * scale),
    ascent: Math.max(...glyphs.map((g) => g.bounds?.[3] ?? 0)) * scale,
    descent: -Math.min(...glyphs.map((g) => g.bounds?.[1] ?? 0)) * scale,
  };
}

export function drawLetter(ctx, ch, x, baseline, size) {
  ctx.save();
  ctx.translate(x, baseline);
  ctx.scale(size / font.unitsPerEm, -size / font.unitsPerEm);
  ctx.beginPath();
  for (const [op, points] of font.glyphs[ch].commands) {
    if (op === "moveTo") ctx.moveTo(...points[0]);
    else if (op === "lineTo") for (const p of points) ctx.lineTo(...p);
    else if (op === "curveTo") ctx.bezierCurveTo(...points.flat());
    else if (op === "qCurveTo") {
      // TrueType consecutive controls imply an on-curve midpoint.
      for (let i = 0; i < points.length - 1; i++) {
        const end = i === points.length - 2 ? points[i + 1] :
          points[i].map((v, axis) => (v + points[i + 1][axis]) / 2);
        ctx.quadraticCurveTo(...points[i], ...end);
      }
    } else if (op === "closePath") ctx.closePath();
    else throw new Error(`Unsupported glyph operation: ${op}`);
  }
  ctx.fill();
  ctx.restore();
}

export function drawLabel(ctx, text, x, baseline, size) {
  const { widths } = measure(text, size);
  [...text].forEach((ch, i) => {
    drawLetter(ctx, ch, x, baseline, size);
    x += widths[i];
  });
}
