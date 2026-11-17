import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

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

/** Who a broadcast can go to (mirrors the ChatBroadcastAudience enum). */
export const CHAT_BROADCAST_AUDIENCES = ['REPS', 'DRIVERS', 'REPS_AND_DRIVERS', 'STAFF'] as const;
export type ChatBroadcastAudienceKey = (typeof CHAT_BROADCAST_AUDIENCES)[number];

/** Permission key that lets a staff user send broadcasts and see their receipts. */
export const CHAT_BROADCAST_PERMISSION = 'chat-broadcast';

/**
 * Inbox id of the read-only announcements thread. Used in `?c=` links, push
 * tags (`chat-announcements`) and `latestUnread.conversationId`; never a UUID,
 * so it cannot collide with a real conversation.
 */
export const CHAT_ANNOUNCEMENTS_ID = 'announcements';

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

/**
 * Re-encode a voice note to AAC in an .m4a (MP4) container with ffmpeg
 * (installed in the backend image). Rejects if ffmpeg is missing or fails;
 * the caller then keeps the original.
 */
export async function transcodeToAac(buf: Buffer): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chat-voice-'));
  const src = path.join(dir, `${randomUUID()}.in`);
  const dst = path.join(dir, `${randomUUID()}.m4a`);
  try {
    await fs.writeFile(src, buf);
    await new Promise<void>((resolve, reject) => {
      execFile(
        'ffmpeg',
        ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vn', '-ac', '1', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', dst],
        { timeout: 60_000 },
        (err) => (err ? reject(err) : resolve()),
      );
    });
    return await fs.readFile(dst);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
