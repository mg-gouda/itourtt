import api from '../client';

// ─── Types (mirror backend/src/chat/chat.service.ts) ─────────────────────────

export type ChatKind = 'TEXT' | 'IMAGE' | 'VOICE' | 'LOCATION';
/** Ticks on a message the caller sent: ✓ sent, ✓✓ delivered, highlighted ✓✓ seen. */
export type ChatMessageStatus = 'SENT' | 'DELIVERED' | 'SEEN';
export type ChatBroadcastAudience = 'REPS' | 'DRIVERS' | 'REPS_AND_DRIVERS' | 'STAFF';

/** Inbox id of the read-only announcements thread (push data conversationId). */
export const CHAT_ANNOUNCEMENTS_ID = 'announcements';

export interface ChatPerson {
  userId: string;
  name: string;
  role: string;
  roleName: string;
  online: boolean;
  active: boolean;
}

export interface ChatConversationSummary {
  id: string;
  portalRole: 'REP' | 'DRIVER';
  other: ChatPerson;
  lastMessage: {
    kind: ChatKind;
    body: string | null;
    fromMe: boolean;
    status: ChatMessageStatus | null;
    createdAt: string;
  } | null;
  unread: number;
  lastMessageAt: string | null;
}

export interface ChatMessage {
  id: string;
  fromMe: boolean;
  kind: ChatKind;
  body: string | null;
  hasAttachment: boolean;
  attachmentMime: string | null;
  attachmentSize: number | null;
  durationSec: number | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracyM?: number | null;
  createdAt: string;
  /** Client-only: optimistic send state and local file preview. */
  pending?: boolean;
  failed?: boolean;
  localUri?: string;
}

export interface ChatThreadHeader {
  id: string;
  portalRole: 'REP' | 'DRIVER';
  other: ChatPerson;
  otherLastReadAt: string | null;
  otherLastDeliveredAt: string | null;
}

export interface ChatMessagesPage {
  messages: ChatMessage[];
  otherLastReadAt: string | null;
  otherLastDeliveredAt: string | null;
  hasMore: boolean;
}

export interface ChatMe {
  enabled: boolean;
  side?: 'PORTAL' | 'STAFF';
  unreadTotal?: number;
  announcementsUnread?: number;
  latestUnread?: { conversationId: string; at: string } | null;
}

export interface ChatAnnouncement extends Omit<ChatMessage, 'fromMe'> {
  senderName: string;
  senderRoleName: string | null;
  audience: ChatBroadcastAudience;
  read: boolean;
}

export interface ChatAnnouncementsSummary {
  unread: number;
  last: { kind: ChatKind; body: string | null; senderName: string; createdAt: string };
}

/** Timer-driven requests: keep the session seen, never count as activity. */
const background = { headers: { 'X-Background-Poll': '1' } };

/** Every chat response is wrapped in ApiResponse { data }. */
const unwrap = <T>(p: Promise<{ data: { data: T } }>) => p.then((r) => r.data.data);

export const chatApi = {
  me: () => unwrap<ChatMe>(api.get('/chat/me', background)),
  conversations: () => unwrap<ChatConversationSummary[]>(api.get('/chat/conversations', background)),
  contacts: (search?: string) =>
    unwrap<ChatPerson[]>(api.get('/chat/contacts', { params: { search: search || undefined } })),
  open: (userId: string) => unwrap<{ id: string }>(api.post('/chat/conversations', { userId })),
  conversation: (id: string) => unwrap<ChatThreadHeader>(api.get(`/chat/conversations/${id}`)),
  messages: (id: string, params: { after?: string; before?: string; limit?: number }, poll = false) =>
    unwrap<ChatMessagesPage>(
      api.get(`/chat/conversations/${id}/messages`, { ...(poll ? background : {}), params }),
    ),
  send: (id: string, form: FormData) =>
    unwrap<ChatMessage>(
      api.post(`/chat/conversations/${id}/messages`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      }),
    ),
  markRead: (id: string) => api.post(`/chat/conversations/${id}/read`, null, background),
  announcementsSummary: () =>
    unwrap<ChatAnnouncementsSummary | null>(api.get('/chat/announcements/summary', background)),
  announcements: (params: { before?: string; limit?: number }, poll = false) =>
    unwrap<{ announcements: ChatAnnouncement[]; hasMore: boolean }>(
      api.get('/chat/announcements', { ...(poll ? background : {}), params }),
    ),
  markAnnouncementsRead: () => api.post('/chat/announcements/read', null, background),
  /** Path (under the API base URL) an attachment is streamed from. */
  messageAttachmentPath: (id: string) => `/chat/messages/${id}/attachment`,
  broadcastAttachmentPath: (id: string) => `/chat/broadcasts/${id}/attachment`,
};
