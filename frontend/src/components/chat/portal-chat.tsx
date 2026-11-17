"use client";

import { Suspense, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ChatInbox } from "./chat-inbox";
import { ChatThread } from "./chat-thread";
import { AnnouncementsThread } from "./announcements-thread";
import { ANNOUNCEMENTS_ID } from "@/lib/chat";

/**
 * Rep/driver portal chat page. `?c=<conversationId>` opens a thread — that is
 * also where a chat push notification lands.
 */
export function PortalChat() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center p-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PortalChatInner />
    </Suspense>
  );
}

function PortalChatInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const open = params.get("c");

  const go = useCallback(
    (id: string | null) => router.push(id ? `${pathname}?c=${id}` : pathname),
    [router, pathname],
  );

  return (
    // Fills the space between the portal top bar and the bottom tab bar.
    <Card className="-mx-2 -my-2 flex h-[calc(100dvh-10.5rem)] min-h-[360px] flex-col overflow-hidden p-0">
      {open === ANNOUNCEMENTS_ID ? (
        <AnnouncementsThread onBack={() => go(null)} />
      ) : open ? (
        <ChatThread key={open} conversationId={open} onBack={() => go(null)} />
      ) : (
        <ChatInbox canStartWith="STAFF" onOpen={(id) => go(id)} />
      )}
    </Card>
  );
}
