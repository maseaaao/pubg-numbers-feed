import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, deflateSync } from "node:zlib";
import { createCanvas, registerFont, loadImage } from "canvas";
import pkg from "../package.json" with { type: "json" };

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const observerDir = join(root, "Observer");
const iconsDir = join(observerDir, "TeamIcon");
const previewDir = join(root, "preview");
const distDir = join(root, "dist");
const fontPath = join(here, "assets", "fonts", "Tektur-ExtraBold.ttf");
const version = pkg.version;

const COUNT = 100;
const SIZE = 64;
const MAX_FONT_SIZE = 76;
const PADDING = 3;
const RADIUS = 8;
const TRACKING = 0.06;
const QUANT_TOLERANCE = 40;
const FAMILY = "Tektur";
const WEIGHT = 800;
const DARK_TEXT = "#141519";
const LIGHT_TEXT = "#FFFFFF";
const LUMA_THRESHOLD = 0.45;

if (!process.env.PUBG_NUMBERS_FEED_CHILD) {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: { ...process.env, PUBG_NUMBERS_FEED_CHILD: "1" },
    stdio: ["inherit", "inherit", "pipe"],
    encoding: "utf8",
  });
  const filtered = (child.stderr || "")
    .split("\n")
    .filter((line) => !line.includes(`couldn't load font "${FAMILY}`))
    .join("\n");
  if (filtered.trim()) {
    process.stderr.write(filtered);
  }
  process.exit(child.status ?? 1);
}

registerFont(fontPath, { family: FAMILY, weight: WEIGHT });

const fontSpec = (size) => `${size}px ${WEIGHT} ${FAMILY}`;

const hslToRgb = (h, s, l) => {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [
    Math.round(f(0) * 255),
    Math.round(f(8) * 255),
    Math.round(f(4) * 255),
  ];
};

const toHex = (rgb) =>
  `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();

const relativeLuminance = ([r, g, b]) => {
  const channel = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const teamColor = (index) => {
  const hue = (index * 137.508) % 360;
  const sat = 64 + (index % 2) * 12;
  const light = 50 + (Math.floor(index / 2) % 3) * 7;
  return hslToRgb(hue, sat, light);
};

const textColor = (rgb) =>
  relativeLuminance(rgb) > LUMA_THRESHOLD ? DARK_TEXT : LIGHT_TEXT;

const layoutText = (ctx, text, size) => {
  ctx.font = fontSpec(size);
  const tracking = size * TRACKING;
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const full = ctx.measureText(text);
  return {
    chars,
    widths,
    tracking,
    size,
    width: widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1),
    ascent: full.actualBoundingBoxAscent || size * 0.74,
    descent: full.actualBoundingBoxDescent || size * 0.04,
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
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(10,12,16,0.35)";
  ctx.stroke();

  const layout = fitLayout(ctx, String(number), SIZE - PADDING * 2);
  const baselineY = SIZE / 2 + (layout.ascent - layout.descent) / 2;
  const startX = SIZE / 2 - layout.width / 2;
  const fill = textColor(rgb);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeStyle = fill === LIGHT_TEXT ? DARK_TEXT : LIGHT_TEXT;
  ctx.lineWidth = Math.min(4, Math.max(2, layout.size * 0.07));

  let x = startX;
  for (let i = 0; i < layout.chars.length; i += 1) {
    ctx.strokeText(layout.chars[i], x, baselineY);
    x += layout.widths[i] + layout.tracking;
  }

  ctx.shadowColor = "rgba(8,10,14,0.35)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = fill;

  x = startX;
  for (let i = 0; i < layout.chars.length; i += 1) {
    ctx.fillText(layout.chars[i], x, baselineY);
    x += layout.widths[i] + layout.tracking;
  }

  ctx.shadowColor = "rgba(0,0,0,0)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

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
  const rows = Math.ceil(canvases.length / cols);
  const pad = 8;
  const sheet = createCanvas(cols * cell + pad * 2, rows * cell + pad * 2);
  const ctx = sheet.getContext("2d");
  ctx.fillStyle = "#14161B";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  canvases.forEach((icon, i) => {
    const x = pad + (i % cols) * cell + (cell - iconSize) / 2;
    const y = pad + Math.floor(i / cols) * cell + (cell - iconSize) / 2;
    ctx.drawImage(icon, x, y, iconSize, iconSize);
  });
  return sheet;
};

const smallSizeStrip = (canvases) => {
  const n = 25;
  const cell = 24;
  const iconSize = 20;
  const pad = 10;
  const strip = createCanvas(pad * 2 + n * cell, pad * 2 + cell);
  const ctx = strip.getContext("2d");
  ctx.fillStyle = "#14161B";
  ctx.fillRect(0, 0, strip.width, strip.height);
  for (let i = 0; i < n; i += 1) {
    const x = pad + i * cell + (cell - iconSize) / 2;
    ctx.drawImage(
      canvases[i],
      x,
      pad + (cell - iconSize) / 2,
      iconSize,
      iconSize,
    );
  }
  return strip;
};

for (const dir of [iconsDir, previewDir, distDir]) {
  mkdirSync(dir, { recursive: true });
}

const probe = createCanvas(8, 8).getContext("2d");
probe.font = fontSpec(40);
const geoWidth = probe.measureText("808").width;
probe.font = "40px sans-serif";
const fallbackWidth = probe.measureText("808").width;
if (Math.abs(geoWidth - fallbackWidth) < 0.01) {
  console.warn(
    `warning: ${FAMILY} metrics match the fallback font, font may not be registered`,
  );
} else {
  console.log(
    `font: ${FAMILY} ExtraBold ${WEIGHT} registered, tracking ${TRACKING}em`,
  );
}
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
  const rgb = teamColor(i);
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
console.log("done");
