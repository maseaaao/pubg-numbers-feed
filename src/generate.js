const fs = require('fs');
const path = require('path');
const { createCanvas, registerFont } = require('canvas');
const JSZip = require('jszip');

let sharp = null;
try { sharp = require('sharp'); } catch (_) {}

const ROOT = path.join(__dirname, '..');
const OBSERVER_DIR = path.join(ROOT, 'Observer');
const ICONS_DIR = path.join(OBSERVER_DIR, 'TeamIcon');
const PREVIEW_DIR = path.join(ROOT, 'preview');
const DIST_DIR = path.join(ROOT, 'dist');
const FONT_PATH = path.join(__dirname, 'assets', 'fonts', 'Geologica-ExtraBold.ttf');
const VERSION = require('../package.json').version;

const COUNT = 100;
const SIZE = 64;
const MAX_FONT_SIZE = 72;
const PADDING = 4;
const FAMILY = 'Geologica';
const WEIGHT = 800;
const DARK_TEXT = '#141519';
const LIGHT_TEXT = '#FFFFFF';
const LUMA_THRESHOLD = 0.45;

registerFont(FONT_PATH, { family: FAMILY, weight: String(WEIGHT) });

const fontSpec = size => `${WEIGHT} ${size}px ${FAMILY}`;

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

const toHex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();

function relativeLuminance(rgb) {
  const f = v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}

function teamColor(index) {
  const hue = (index * 137.508) % 360;
  const sat = 64 + (index % 2) * 12;
  const light = 50 + (Math.floor(index / 2) % 3) * 7;
  return hslToRgb(hue, sat, light);
}

const textColor = rgb => (relativeLuminance(rgb) > LUMA_THRESHOLD ? DARK_TEXT : LIGHT_TEXT);

function textMetrics(ctx, text, size) {
  ctx.font = fontSpec(size);
  const m = ctx.measureText(text);
  return {
    width: m.width,
    ascent: m.actualBoundingBoxAscent || size * 0.74,
    descent: m.actualBoundingBoxDescent || size * 0.04
  };
}

function fitFontSize(ctx, text, maxWidth, maxHeight) {
  let size = MAX_FONT_SIZE;
  while (size > 12) {
    const m = textMetrics(ctx, text, size);
    if (m.width <= maxWidth && m.ascent + m.descent <= maxHeight) break;
    size -= 1;
  }
  return size;
}

function drawIcon(number, rgb) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = toHex(rgb);
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(10,12,16,0.30)';
  ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);

  const text = String(number);
  const size = fitFontSize(ctx, text, SIZE - PADDING * 2, SIZE - PADDING * 2);
  const m = textMetrics(ctx, text, size);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const baselineY = SIZE / 2 + (m.ascent - m.descent) / 2;
  const fill = textColor(rgb);

  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeStyle = fill === LIGHT_TEXT ? DARK_TEXT : LIGHT_TEXT;
  ctx.lineWidth = Math.min(4, Math.max(2, size * 0.07));
  ctx.strokeText(text, SIZE / 2, baselineY);

  ctx.shadowColor = 'rgba(8,10,14,0.30)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = fill;
  ctx.fillText(text, SIZE / 2, baselineY);
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  return canvas;
}

async function optimize(buffer) {
  if (!sharp) return buffer;
  return sharp(buffer).png({ palette: true, quality: 96, compressionLevel: 9 }).toBuffer();
}

function contactSheet(canvases, cols, cell, iconSize) {
  const rows = Math.ceil(canvases.length / cols);
  const pad = 8;
  const canvas = createCanvas(cols * cell + pad * 2, rows * cell + pad * 2);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#14161B';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  canvases.forEach((icon, i) => {
    const x = pad + (i % cols) * cell + (cell - iconSize) / 2;
    const y = pad + Math.floor(i / cols) * cell + (cell - iconSize) / 2;
    ctx.drawImage(icon, x, y, iconSize, iconSize);
  });
  return canvas;
}

function smallSizeStrip(canvases) {
  const n = 25;
  const cell = 24;
  const iconSize = 20;
  const pad = 10;
  const canvas = createCanvas(pad * 2 + n * cell, pad * 2 + cell);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#14161B';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < n; i++) {
    const x = pad + i * cell + (cell - iconSize) / 2;
    ctx.drawImage(canvases[i], x, pad + (cell - iconSize) / 2, iconSize, iconSize);
  }
  return canvas;
}

async function savePng(canvas, file) {
  const buffer = await optimize(canvas.toBuffer('image/png'));
  fs.writeFileSync(file, buffer);
  return buffer.length;
}

function reportStats(label, sizes) {
  const total = sizes.reduce((a, b) => a + b, 0);
  const avg = Math.round(total / sizes.length);
  const min = Math.min(...sizes);
  const max = Math.max(...sizes);
  console.log(`${label}: ${sizes.length} files, total ${(total / 1024).toFixed(1)} KB, avg ${avg} B, min ${min} B, max ${max} B`);
}

async function main() {
  [ICONS_DIR, PREVIEW_DIR, DIST_DIR].forEach(dir => fs.mkdirSync(dir, { recursive: true }));

  const probe = createCanvas(8, 8).getContext('2d');
  probe.font = fontSpec(40);
  const geoWidth = probe.measureText('808').width;
  probe.font = '40px sans-serif';
  const fallbackWidth = probe.measureText('808').width;
  if (Math.abs(geoWidth - fallbackWidth) < 0.01) {
    console.warn('warning: Geologica metrics match the fallback font, font may not be registered');
  } else {
    console.log(`font: Geologica ExtraBold ${WEIGHT} registered (${FONT_PATH})`);
  }
  console.log(`optimizer: ${sharp ? 'sharp palette quantization' : 'raw PNG (sharp not installed)'}`);

  const canvases = [];
  const zip = new JSZip();
  const csvRows = [];
  const sizes = [];

  for (let i = 0; i < COUNT; i++) {
    const number = i + 1;
    const rgb = teamColor(i);
    const fileName = String(number).padStart(3, '0') + '.png';

    const icon = drawIcon(number, rgb);
    canvases.push(icon);

    const buffer = await optimize(icon.toBuffer('image/png'));
    fs.writeFileSync(path.join(ICONS_DIR, fileName), buffer);
    zip.file(`Observer/TeamIcon/${fileName}`, buffer);
    sizes.push(buffer.length);

    csvRows.push([number, `Team ${number}`, `T${number}`, fileName, toHex(rgb).slice(1) + 'FF'].join(','));

    if ((i + 1) % 25 === 0) console.log(`generated ${i + 1}/${COUNT} icons`);
  }

  const csv = 'Team #,TeamName,TeamShortName,ImageFileName,TeamColor\n' + csvRows.join('\n') + '\n';
  fs.writeFileSync(path.join(OBSERVER_DIR, 'Teaminfo.csv'), csv);
  zip.file('Observer/Teaminfo.csv', csv);

  await savePng(contactSheet(canvases, 10, 60, 48), path.join(PREVIEW_DIR, 'preview.png'));
  await savePng(smallSizeStrip(canvases), path.join(PREVIEW_DIR, 'small-size.png'));

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
  const zipPath = path.join(DIST_DIR, `pubg-numbers-feed-v${VERSION}.zip`);
  fs.writeFileSync(zipPath, zipBuffer);

  console.log('');
  reportStats('TeamIcon', sizes);
  console.log(`Teaminfo.csv: ${COUNT} rows`);
  console.log(`dist zip: ${zipPath} (${(zipBuffer.length / 1024).toFixed(1)} KB)`);
  console.log('done');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
