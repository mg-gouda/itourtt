import sharp from 'sharp';

/**
 * Burn date/time (Cairo timezone) + GPS coordinates onto an image buffer
 * using an SVG composite overlay. Returns a JPEG buffer.
 */
export async function stampEvidenceImage(
  buffer: Buffer,
  lat: number,
  lng: number,
): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
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

  const fontSize = Math.max(14, Math.min(48, Math.round(w * 0.02)));
  const lineH = Math.round(fontSize * 1.5);
  const pad = Math.round(fontSize * 0.5);
  const bgH = lineH * 2 + pad * 2;
  const bgW = Math.round(w * 0.72);

  // SVG y on <text> is the baseline; position lines inside the background rect
  const line1Y = h - lineH - pad;
  const line2Y = h - pad;

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const svg = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="${h - bgH}" width="${bgW}" height="${bgH}" fill="rgba(0,0,0,0.6)"/>` +
      `<text x="${pad}" y="${line1Y}" fill="#FFD700" font-family="monospace" font-size="${fontSize}" font-weight="bold">${esc(dateLine)}</text>` +
      `<text x="${pad}" y="${line2Y}" fill="#FFD700" font-family="monospace" font-size="${fontSize}" font-weight="bold">${esc(gpsLine)}</text>` +
    `</svg>`,
  );

  return sharp(buffer)
    .composite([{ input: svg, blend: 'over' }])
    .jpeg({ quality: 85 })
    .toBuffer();
}
