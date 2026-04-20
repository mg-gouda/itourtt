import sharp from 'sharp';

/**
 * Burn date/time (Cairo timezone) + GPS coordinates onto an image buffer.
 * Auto-rotates based on EXIF before compositing so portrait photos are
 * handled correctly. Returns a JPEG buffer.
 *
 * Font: "DejaVu Sans" installed via font-dejavu Alpine package in the
 * production Dockerfile — librsvg resolves it from the system font cache.
 */
export async function stampEvidenceImage(
  buffer: Buffer,
  lat: number,
  lng: number,
  date?: Date,
): Promise<Buffer> {
  const rotated = await sharp(buffer).rotate().toBuffer();
  const meta = await sharp(rotated).metadata();
  const w = meta.width ?? 1280;
  const h = meta.height ?? 960;

  const now = date ?? new Date();
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

  const line1Y = h - bgH + pad + lineH - Math.round(fontSize * 0.2);
  const line2Y = line1Y + lineH;

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const svg = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="${h - bgH}" width="${w}" height="${bgH}" fill="rgba(0,0,0,0.65)"/>` +
      `<text x="${pad}" y="${line1Y}" fill="#FFD700" font-family="DejaVu Sans,sans-serif" font-size="${fontSize}" font-weight="bold">${esc(dateLine)}</text>` +
      `<text x="${pad}" y="${line2Y}" fill="#FFD700" font-family="DejaVu Sans,sans-serif" font-size="${fontSize}" font-weight="bold">${esc(gpsLine)}</text>` +
    `</svg>`,
  );

  return sharp(rotated)
    .composite([{ input: svg, blend: 'over' }])
    .jpeg({ quality: 88 })
    .toBuffer();
}
