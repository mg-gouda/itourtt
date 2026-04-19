import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

// Load DejaVu Bold once at module init and embed as base64 so librsvg
// never needs to find a system font — this is the only reliable approach
// in a headless container where fc-list returns nothing.
const FONT_B64 = (() => {
  const p = path.join(process.cwd(), 'fonts', 'DejaVuSans-Bold.ttf');
  return fs.existsSync(p) ? fs.readFileSync(p).toString('base64') : null;
})();

/**
 * Burn date/time (Cairo timezone) + GPS coordinates onto an image buffer.
 * Auto-rotates based on EXIF before compositing so portrait photos are
 * handled correctly. Returns a JPEG buffer.
 */
export async function stampEvidenceImage(
  buffer: Buffer,
  lat: number,
  lng: number,
): Promise<Buffer> {
  // Auto-rotate first so width/height match what the user sees
  const rotated = await sharp(buffer).rotate().toBuffer();
  const meta = await sharp(rotated).metadata();
  const w = meta.width ?? 1280;
  const h = meta.height ?? 960;

  const now = new Date();
  const dateLine = now.toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const gpsLine = `GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  const fontSize = Math.max(16, Math.min(52, Math.round(w * 0.022)));
  const lineH    = Math.round(fontSize * 1.6);
  const pad      = Math.round(fontSize * 0.6);
  const bgH      = lineH * 2 + pad * 2;
  const bgW      = w; // full width so text is never clipped

  const line1Y = h - bgH + pad + lineH - Math.round(fontSize * 0.2);
  const line2Y = line1Y + lineH;

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const fontFace = FONT_B64
    ? `<defs><style>@font-face{font-family:'DV';src:url('data:font/truetype;base64,${FONT_B64}') format('truetype');font-weight:bold;}</style></defs>`
    : '';
  const fontFamily = FONT_B64 ? 'DV' : 'monospace';

  const svg = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
      fontFace +
      `<rect x="0" y="${h - bgH}" width="${bgW}" height="${bgH}" fill="rgba(0,0,0,0.65)"/>` +
      `<text x="${pad}" y="${line1Y}" fill="#FFD700" font-family="${fontFamily}" font-size="${fontSize}" font-weight="bold">${esc(dateLine)}</text>` +
      `<text x="${pad}" y="${line2Y}" fill="#FFD700" font-family="${fontFamily}" font-size="${fontSize}" font-weight="bold">${esc(gpsLine)}</text>` +
    `</svg>`,
  );

  return sharp(rotated)
    .composite([{ input: svg, blend: 'over' }])
    .jpeg({ quality: 88 })
    .toBuffer();
}
