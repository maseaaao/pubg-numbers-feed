// Shared identity with maseaaao.tv; team colors extend the blue/warm-light pair.
export const INK = "#20201E";
export const PAPER = "#F4F3EC";
export const BLUE = "#1616D9";
export const MIN_CONTRAST = 7;
export const fromHex = (hex) => hex.slice(1).match(/../g).map((v) => parseInt(v, 16));
export const toHex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
export const luminance = (rgb) => rgb.map((v) => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
export const contrast = (a, b) => {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
export const textColor = (rgb) => contrast(rgb, fromHex(INK)) >= contrast(rgb, fromHex(PAPER)) ? INK : PAPER;

// Euclidean OKLab distance accounts for perceived lightness and hue differences.
export const oklab = (rgb) => {
  const [r, g, b] = rgb.map((v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b);
  const m = Math.cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b);
  const s = Math.cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b);
  return [0.2104542553*l + 0.793617785*m - 0.0040720468*s,
    1.9779984951*l - 2.428592205*m + 0.4505937099*s,
    0.0259040371*l + 0.7827717662*m - 0.808675766*s];
};
export const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

export function createPalette(count = 100) {
  const candidates = [];
  for (let r = 16; r <= 256; r += 12) {
    for (let g = 16; g <= 256; g += 12) {
      for (let b = 16; b <= 256; b += 12) {
        const rgb = [r, g, b].map((v) => Math.min(v, 255));
        const lab = oklab(rgb);
        // Avoid muddy neutrals and near-black chips that disappear on the HUD.
        if (Math.hypot(lab[1], lab[2]) < 0.07 || lab[0] < 0.36) continue;
        if (contrast(rgb, fromHex(textColor(rgb))) < MIN_CONTRAST) continue;
        candidates.push({ rgb, lab, nearest: Infinity });
      }
    }
  }
  const chosen = [fromHex(BLUE)];
  while (chosen.length < count) {
    const last = oklab(chosen.at(-1));
    let best;
    for (const candidate of candidates) {
      candidate.nearest = Math.min(candidate.nearest, distance(candidate.lab, last));
      if (!best || candidate.nearest > best.nearest) best = candidate;
    }
    if (!best || best.nearest === 0) throw new Error("Palette exhausted");
    chosen.push(best.rgb);
  }
  return chosen;
}
