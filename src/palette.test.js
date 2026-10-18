import test from "node:test";
import assert from "node:assert/strict";
import { contrast, createPalette, fromHex, toHex, textColor, BLUE } from "./palette.js";
import { measure } from "./lettering.js";

test("contrast matches the black/white reference and is symmetric", () => {
  assert.equal(contrast([0, 0, 0], [255, 255, 255]), 21);
  assert.equal(contrast([128, 128, 128], [128, 128, 128]), 1);
  assert.equal(contrast([16, 32, 64], [200, 220, 240]), contrast([200, 220, 240], [16, 32, 64]));
});

test("all 100 team colors are unique, deterministic, and have at least 7:1 text contrast", () => {
  const palette = createPalette();
  assert.equal(palette.length, 100);
  assert.equal(toHex(palette[0]), BLUE);
  assert.equal(new Set(palette.map(toHex)).size, 100);
  assert.deepEqual(palette, createPalette());
  for (const rgb of palette) assert.ok(contrast(rgb, fromHex(textColor(rgb))) >= 7);
});

test("every team number has real bundled glyphs with usable dimensions", () => {
  for (let team = 1; team <= 100; team++) {
    const metrics = measure(String(team), 64);
    assert.ok(metrics.ascent > 0);
    assert.ok(metrics.widths.every((w) => w > 0 && Number.isFinite(w)));
  }
});
