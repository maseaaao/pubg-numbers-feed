import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, deflateSync } from "node:zlib";
import { createCanvas, loadImage } from "canvas";
import { BLUE, INK, PAPER, MIN_CONTRAST, fromHex, toHex, contrast, textColor, createPalette, oklab, distance } from "./palette.js";
import { measure, drawLetter, drawLabel } from "./lettering.js";
import pkg from "../package.json" with { type: "json" };

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const observerDir = join(root, "Observer");
const iconsDir = join(observerDir, "TeamIcon");
const previewDir = join(root, "preview");
const distDir = join(root, "dist");
const version = pkg.version;

const COUNT = 100;
const SIZE = 64;
const MAX_FONT_SIZE = 76;
const PADDING = 3;
const RADIUS = 8;
const TRACKING = 0.025;
const QUANT_TOLERANCE = 40;
const FAMILY = "Unbounded";
const WEIGHT = 600;
const palette = createPalette(COUNT);

const layoutText = (ctx, text, size) => {
  const tracking = size * TRACKING;
  const chars = [...text];
  const { widths, ascent, descent } = measure(text, size);
  return {
    chars,
    widths,
    tracking,
    size,
    width: widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1),
    ascent: ascent,
    descent: descent,
  };
};

const fitLayout = (ctx, text, box) => {
  let size = MAX_FONT_SIZE;
  let layout = layoutText(ctx, text, size);
  while (
    size > 12 &&
    (layout.width > box || layout.ascent + layout.descent > box)
  ) {
    size -= 1;
    layout = layoutText(ctx, text, size);
  }
  return layout;
};

const chipPath = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const drawIcon = (number, rgb) => {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");

  chipPath(ctx, 0.5, 0.5, SIZE - 1, SIZE - 1, RADIUS);
  ctx.fillStyle = toHex(rgb);
  ctx.fill();

  const layout = fitLayout(ctx, String(number), SIZE - PADDING * 2);
  const baselineY = SIZE / 2 + (layout.ascent - layout.descent) / 2;
  const startX = SIZE / 2 - layout.width / 2;
  const fill = textColor(rgb);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = fill;

  let x = startX;
  for (let i = 0; i < layout.chars.length; i += 1) {
    drawLetter(ctx, layout.chars[i], x, baselineY, layout.size);
    x += layout.widths[i] + layout.tracking;
  }

  return canvas;
};

let crcTable;

const crc32 = (buf) => {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const byte of buf) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, out.length - 4)), out.length - 4);
  return out;
};

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const encodePng = ({ data, width, height }) => {
  const pixelCount = width * height;
  const indexed = Buffer.alloc(pixelCount);

  const freq = new Map();
  const keys = Buffer.alloc(pixelCount * 4);
  for (let i = 0; i < pixelCount; i += 1) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    const key = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
    keys.writeUInt32BE(key, i * 4);
    freq.set(key, (freq.get(key) || 0) + 1);
  }

  const colors = [...freq.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 256)
    .map(([key]) => key);
  const exact = new Map(colors.map((key, i) => [key, i]));

  const lookup = new Map();
  for (let i = 0; i < pixelCount; i += 1) {
    const key = keys.readUInt32BE(i * 4);
    let idx = exact.get(key);
    if (idx === undefined) {
      idx = lookup.get(key);
    }
    if (idx === undefined) {
      const r = key >>> 24;
      const g = (key >>> 16) & 0xff;
      const b = (key >>> 8) & 0xff;
      const a = key & 0xff;
      let bestDist = Infinity;
      for (let p = 0; p < colors.length; p += 1) {
        const c = colors[p];
        const dr = r - (c >>> 24);
        const dg = g - ((c >>> 16) & 0xff);
        const db = b - ((c >>> 8) & 0xff);
        const da = a - (c & 0xff);
        const dist = dr * dr + dg * dg + db * db + da * da;
        if (dist < bestDist) {
          bestDist = dist;
          idx = p;
        }
      }
      lookup.set(key, idx);
    }
    indexed[i] = idx;
  }

  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    indexed.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;

  const plte = Buffer.alloc(colors.length * 3);
  const trns = Buffer.alloc(colors.length);
  let hasAlpha = false;
  colors.forEach((key, i) => {
    plte[i * 3] = key >>> 24;
    plte[i * 3 + 1] = (key >>> 16) & 0xff;
    plte[i * 3 + 2] = (key >>> 8) & 0xff;
    trns[i] = key & 0xff;
    if ((key & 0xff) !== 255) hasAlpha = true;
  });

  const chunks = [
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("PLTE", plte),
  ];
  if (hasAlpha) {
    chunks.push(pngChunk("tRNS", trns));
  }
  chunks.push(
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  );
  return Buffer.concat(chunks);
};

const encodeCanvas = (canvas) =>
  encodePng(
    canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height),
  );

const maxChannelDiff = async (buffer, source) => {
  const img = await loadImage(buffer);
  if (img.width !== SIZE || img.height !== SIZE) return -1;
  const probe = createCanvas(SIZE, SIZE).getContext("2d");
  probe.drawImage(img, 0, 0);
  const decoded = probe.getImageData(0, 0, SIZE, SIZE).data;
  const original = source.getContext("2d").getImageData(0, 0, SIZE, SIZE).data;
  let max = 0;
  let over8 = 0;
  let worstI = 0;
  for (let i = 0; i < decoded.length; i += 4) {
    const da = decoded[i + 3] / 255;
    const oa = original[i + 3] / 255;
    const diffs = [
      Math.abs(decoded[i + 3] - original[i + 3]),
      Math.abs(decoded[i] * da - original[i] * oa),
      Math.abs(decoded[i + 1] * da - original[i + 1] * oa),
      Math.abs(decoded[i + 2] * da - original[i + 2] * oa),
    ];
    const m = Math.max(...diffs);
    if (m > 8) over8 += 1;
    if (m > max) {
      max = m;
      worstI = i;
    }
  }
  if (max > 12) {
    const uniq = new Set();
    for (let i = 0; i < original.length; i += 4) {
      uniq.add(
        ((original[i] << 24) |
          (original[i + 1] << 16) |
          (original[i + 2] << 8) |
          original[i + 3]) >>>
          0,
      );
    }
    const p = worstI / 4;
    console.error(
      `diag: unique=${uniq.size} over8=${over8} max=${max} px=${p % SIZE},${Math.floor(p / SIZE)} orig=[${original[worstI]},${original[worstI + 1]},${original[worstI + 2]},${original[worstI + 3]}] dec=[${decoded[worstI]},${decoded[worstI + 1]},${decoded[worstI + 2]},${decoded[worstI + 3]}]`,
    );
  }
  return max;
};

const dosDateTime = (date) => ({
  time:
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    (date.getSeconds() >> 1),
  date:
    ((date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate(),
});

const makeZip = (files) => {
  const { time, date } = dosDateTime(new Date());
  const parts = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const deflated = deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const payload = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, nameBuf, payload);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(date, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(payload.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt16LE(0, 30);
    entry.writeUInt16LE(0, 32);
    entry.writeUInt16LE(0, 34);
    entry.writeUInt16LE(0, 36);
    entry.writeUInt32LE(0, 38);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);

    offset += local.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuf, eocd]);
};

const contactSheet = (canvases, cols, cell, iconSize) => {
  const pad = 28, header = 116;
  const sheet = createCanvas(cols * cell + pad * 2, Math.ceil(canvases.length / cols) * cell + pad * 2 + header);
  const ctx = sheet.getContext("2d");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = BLUE;
  ctx.fillRect(0, 0, sheet.width, header);
  ctx.fillStyle = PAPER;
  drawLabel(ctx, "maseaaao / PUBG", pad, 32, 13);
  drawLabel(ctx, "Numbers feed", pad, 72, 26);
  ctx.font = "13px Arial";
  ctx.fillText("100 teams / Unbounded 600 / text contrast >= 7:1", pad, 98);
  canvases.forEach((icon, i) => ctx.drawImage(icon,
    pad + (i % cols) * cell + (cell - iconSize) / 2,
    header + pad + Math.floor(i / cols) * cell + (cell - iconSize) / 2, iconSize, iconSize));
  return sheet;
};
const smallSizeStrip = (canvases) => {
  const cols = 25, cell = 26, pad = 20, header = 52, block = 214;
  const sheet = createCanvas(pad * 2 + cols * cell, header + 3 * block);
  const ctx = sheet.getContext("2d");
  ctx.fillStyle = BLUE;
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = PAPER;
  drawLabel(ctx, "maseaaao / killfeed size check", pad, 32, 15);
  [INK, PAPER, "#54684B"].forEach((bg, section) => {
    const top = header + section * block;
    ctx.fillStyle = bg;
    ctx.fillRect(0, top, sheet.width, block);
    ctx.fillStyle = section === 1 ? INK : PAPER;
    ctx.font = "13px Arial";
    ctx.fillText(["20 px / dark HUD", "20 px / light HUD", "20 px / terrain + 11% horizontal stretch"][section], pad, top + 24);
    canvases.forEach((icon, i) => ctx.drawImage(icon,
      pad + (i % cols) * cell, top + 38 + Math.floor(i / cols) * 44,
      section === 2 ? 22.2 : 20, 20));
  });
  return sheet;
};
for (const dir of [iconsDir, previewDir, distDir]) mkdirSync(dir, { recursive: true });

console.log(`font: ${FAMILY} SemiBold ${WEIGHT}, bundled vector outlines, tracking ${TRACKING}em`);
console.log(
  "encoder: in-repo indexed PNG + zip on node:zlib, nearest-palette quantization above 256 colors",
);

const canvases = [];
const zipFiles = [];
const csvRows = [];
const sizes = [];
let worstDeviation = 0;

for (let i = 0; i < COUNT; i += 1) {
  const number = i + 1;
  const rgb = palette[i];
  const fileName = `${String(number).padStart(3, "0")}.png`;

  const icon = drawIcon(number, rgb);
  canvases.push(icon);

  const buffer = encodeCanvas(icon);
  const deviation = await maxChannelDiff(buffer, icon);
  if (deviation < 0 || deviation > QUANT_TOLERANCE) {
    throw new Error(`roundtrip deviation ${deviation} for ${fileName}`);
  }
  worstDeviation = Math.max(worstDeviation, deviation);
  writeFileSync(join(iconsDir, fileName), buffer);
  zipFiles.push({ name: `Observer/TeamIcon/${fileName}`, data: buffer });
  sizes.push(buffer.length);

  csvRows.push(
    [
      number,
      `Team ${number}`,
      `T${number}`,
      fileName,
      `${toHex(rgb).slice(1)}FF`,
    ].join(","),
  );

  if ((i + 1) % 25 === 0) {
    console.log(`generated ${i + 1}/${COUNT} icons`);
  }
}

const csv = `Team #,TeamName,TeamShortName,ImageFileName,TeamColor\n${csvRows.join("\n")}\n`;
writeFileSync(join(observerDir, "Teaminfo.csv"), csv);
zipFiles.push({ name: "Observer/Teaminfo.csv", data: Buffer.from(csv) });

writeFileSync(
  join(previewDir, "preview.png"),
  encodeCanvas(contactSheet(canvases, 10, 60, 48)),
);
writeFileSync(
  join(previewDir, "small-size.png"),
  encodeCanvas(smallSizeStrip(canvases)),
);

const zipBuffer = makeZip(zipFiles);
const zipPath = join(distDir, `pubg-numbers-feed-v${version}.zip`);
writeFileSync(zipPath, zipBuffer);

const total = sizes.reduce((a, b) => a + b, 0);
console.log("");
console.log(
  `TeamIcon: ${sizes.length} files, total ${(total / 1024).toFixed(1)} KB, avg ${Math.round(total / sizes.length)} B, min ${Math.min(...sizes)} B, max ${Math.max(...sizes)} B`,
);
console.log(`Teaminfo.csv: ${COUNT} rows`);
console.log(
  `dist zip: ${zipPath} (${(zipBuffer.length / 1024).toFixed(1)} KB)`,
);
console.log(
  `verify: decode roundtrip ${COUNT}/${COUNT}, max channel deviation ${worstDeviation}/255 (limit ${QUANT_TOLERANCE})`,
);

const ratios = palette.map((rgb) => contrast(rgb, fromHex(textColor(rgb))));
let closest = { distance: Infinity };
for (let i = 0; i < COUNT; i++) {
  for (let j = i + 1; j < COUNT; j++) {
    const d = distance(oklab(palette[i]), oklab(palette[j]));
    if (d < closest.distance) closest = { teams: [i + 1, j + 1], distance: d };
  }
}
if (new Set(palette.map(toHex)).size !== COUNT || Math.min(...ratios) < MIN_CONTRAST) {
  throw new Error("Palette uniqueness / contrast validation failed");
}
writeFileSync(join(previewDir, "palette.json"), JSON.stringify({
  minimumContrast: Math.min(...ratios), closestPair: closest,
  teams: palette.map((rgb, i) => ({ team: i + 1, background: toHex(rgb), text: textColor(rgb), contrast: ratios[i] }))
}, null, 2) + "\n");
console.log(`palette: ${COUNT} unique colors, min contrast ${Math.min(...ratios).toFixed(2)}:1, min OKLab distance ${closest.distance.toFixed(4)}`);
console.log("done");
