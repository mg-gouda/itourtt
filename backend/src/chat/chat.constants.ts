/** In-app chat limits and the file types it accepts. */

export const CHAT_MAX_TEXT = 4000;
export const CHAT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const CHAT_MAX_VOICE_SEC = 300;
/** Longest edge an image is scaled down to before it is stored. */
export const CHAT_IMAGE_MAX_EDGE = 1600;
/** A user counts as online when a session touched the API this recently. */
export const CHAT_ONLINE_WINDOW_MS = 5 * 60_000;

/** Roles that use the portals (one side of every chat). */
export const CHAT_PORTAL_ROLES = ['REP', 'DRIVER'] as const;
export type ChatPortalRole = (typeof CHAT_PORTAL_ROLES)[number];

/** Roles that never take part in chat on the staff side. */
export const CHAT_NON_STAFF_ROLES = ['REP', 'DRIVER', 'SUPPLIER', 'B2C_CLIENT'];

/** Sniff an audio container from its first bytes → [mime, extension]. */
export function sniffAudio(buf: Buffer): [string, string] | null {
  if (buf.length < 12) return null;
  if (buf.readUInt32BE(0) === 0x1a45dfa3) return ['audio/webm', 'webm'];
  if (buf.toString('ascii', 0, 4) === 'OggS') return ['audio/ogg', 'ogg'];
  if (buf.toString('ascii', 4, 8) === 'ftyp') return ['audio/mp4', 'm4a'];
  if (buf.toString('ascii', 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0))
    return ['audio/mpeg', 'mp3'];
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE')
    return ['audio/wav', 'wav'];
  return null;
}
