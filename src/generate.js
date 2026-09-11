const fs = require('fs');
const path = require('path');
const { createCanvas, registerFont } = require('canvas');
const JSZip = require('jszip');

let sharp = null;
try { sharp = require('sharp'); } catch (_) {}

const ROOT = path.join(__dirname, '..');
const OBSERVER_DIR = path.join(ROOT, 'Observer');
const PLAIN_DIR = path.join(OBSERVER_DIR, 'TeamIcon');
const NUMBERED_DIR = path.join(OBSERVER_DIR, 'TeamIconNumbered');
const PREVIEW_DIR = path.join(ROOT, 'preview');
const DIST_DIR = path.join(ROOT, 'dist');
const FONT_PATH = path.join(__dirname, 'assets', 'fonts', 'Geologica-ExtraBold.ttf');

const COUNT = 100;
const SIZE = 64;
const MAX_FONT_SIZE = 48;
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

function drawIcon(number, rgb, variant) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = toHex(rgb);
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(10,12,16,0.30)';
  ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);

  const text = String(number);
  const padding = text.length >= 3 ? 3 : 6;
  const size = fitFontSize(ctx, text, SIZE - padding * 2, SIZE - 8);
  const m = textMetrics(ctx, text, size);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const baselineY = SIZE / 2 + (m.ascent - m.descent) / 2;
  const fill = textColor(rgb);

  if (variant === 'numbered') {
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = fill === LIGHT_TEXT ? DARK_TEXT : LIGHT_TEXT;
    ctx.lineWidth = Math.max(2, Math.round(size * 0.1));
    ctx.strokeText(text, SIZE / 2, baselineY);
  }

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

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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

function smallSizeStrip(plain, numbered) {
  const n = 25;
  const cell = 24;
  const iconSize = 20;
  const pad = 10;
  const gap = 12;
  const canvas = createCanvas(pad * 2 + n * cell, pad * 2 + cell * 2 + gap);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#14161B';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < n; i++) {
    const x = pad + i * cell + (cell - iconSize) / 2;
    ctx.drawImage(plain[i], x, pad + (cell - iconSize) / 2, iconSize, iconSize);
    ctx.drawImage(numbered[i], x, pad + cell + gap + (cell - iconSize) / 2, iconSize, iconSize);
  }
  return canvas;
}

function killfeedDemo(plain) {
  const rows = 6;
  const rowH = 36;
  const pad = 14;
  const iconSize = 22;
  const canvas = createCanvas(560, rows * (rowH + 8) + pad * 2);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1D2026';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'middle';
  for (let r = 0; r < rows; r++) {
    const killer = r * 4 + 1;
    const victim = r * 4 + 2;
    const y = pad + r * (rowH + 8);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, pad, y, canvas.width - pad * 2, rowH, 5);
    ctx.fill();
    let x = pad + 10;
    ctx.drawImage(plain[killer - 1], x, y + (rowH - iconSize) / 2, iconSize, iconSize);
    x += iconSize + 10;
    ctx.font = fontSpec(14);
    ctx.fillStyle = '#E8EAED';
    const killerName = 'Player_' + String(killer).padStart(2, '0');
    ctx.fillText(killerName, x, y + rowH / 2 + 1);
    x += ctx.measureText(killerName).width + 10;
    ctx.fillStyle = '#9AA0A8';
    ctx.font = fontSpec(12);
    ctx.fillText('eliminated', x, y + rowH / 2 + 1);
    x += ctx.measureText('eliminated').width + 10;
    ctx.drawImage(plain[victim - 1], x, y + (rowH - iconSize) / 2, iconSize, iconSize);
    x += iconSize + 10;
    ctx.font = fontSpec(14);
    ctx.fillStyle = '#E8EAED';
    ctx.fillText('Player_' + String(victim).padStart(2, '0'), x, y + rowH / 2 + 1);
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
  [PLAIN_DIR, NUMBERED_DIR, PREVIEW_DIR, DIST_DIR].forEach(dir => fs.mkdirSync(dir, { recursive: true }));

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

  const plainCanvases = [];
  const numberedCanvases = [];
  const zip = new JSZip();
  const csvRows = [];
  const plainSizes = [];
  const numberedSizes = [];

  for (let i = 0; i < COUNT; i++) {
    const number = i + 1;
    const rgb = teamColor(i);
    const fileName = String(number).padStart(3, '0') + '.png';

    const plainCanvas = drawIcon(number, rgb, 'plain');
    const numberedCanvas = drawIcon(number, rgb, 'numbered');
    plainCanvases.push(plainCanvas);
    numberedCanvases.push(numberedCanvas);

    const plainBuffer = await optimize(plainCanvas.toBuffer('image/png'));
    const numberedBuffer = await optimize(numberedCanvas.toBuffer('image/png'));
    fs.writeFileSync(path.join(PLAIN_DIR, fileName), plainBuffer);
    fs.writeFileSync(path.join(NUMBERED_DIR, fileName), numberedBuffer);
    zip.file(`Observer/TeamIcon/${fileName}`, plainBuffer);
    zip.file(`Observer/TeamIconNumbered/${fileName}`, numberedBuffer);
    plainSizes.push(plainBuffer.length);
    numberedSizes.push(numberedBuffer.length);

    csvRows.push([number, `Team ${number}`, `T${number}`, fileName, toHex(rgb).slice(1) + 'FF'].join(','));

    if ((i + 1) % 25 === 0) console.log(`generated ${i + 1}/${COUNT} icons`);
  }

  const csv = 'Team #,TeamName,TeamShortName,ImageFileName,TeamColor\n' + csvRows.join('\n') + '\n';
  fs.writeFileSync(path.join(OBSERVER_DIR, 'Teaminfo.csv'), csv);
  zip.file('Observer/Teaminfo.csv', csv);

  await savePng(contactSheet(plainCanvases, 10, 60, 48), path.join(PREVIEW_DIR, 'preview.png'));
  await savePng(contactSheet(numberedCanvases, 10, 60, 48), path.join(PREVIEW_DIR, 'preview-numbered.png'));
  await savePng(smallSizeStrip(plainCanvases, numberedCanvases), path.join(PREVIEW_DIR, 'small-size.png'));
  await savePng(killfeedDemo(plainCanvases), path.join(PREVIEW_DIR, 'killfeed-demo.png'));

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
  const zipPath = path.join(DIST_DIR, 'pubg-numbers-feed-v1.0.0.zip');
  fs.writeFileSync(zipPath, zipBuffer);

  console.log('');
  reportStats('TeamIcon', plainSizes);
  reportStats('TeamIconNumbered', numberedSizes);
  console.log(`Teaminfo.csv: ${COUNT} rows`);
  console.log(`dist zip: ${zipPath} (${(zipBuffer.length / 1024).toFixed(1)} KB)`);
  console.log('done');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
