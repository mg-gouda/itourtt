"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { usePermission } from "@/hooks/use-permission";
import { Loader2, MessagesSquare } from "lucide-react";
import { ComplaintThread, ThreadComposer, type ThreadMessage } from "@/components/complaint-thread";

interface PartyThread {
  party: "REP" | "DRIVER";
  name: string;
  messages: ThreadMessage[];
}

/**
 * Admin complaint view › the answers the blamed rep / driver sent from their app or portal, one
 * thread per party, with their evidence; the office replies in the same thread.
 */
export function ComplaintPartyThreads({ complaintId, refreshKey }: { complaintId: string; refreshKey?: unknown }) {
  const canReply = usePermission("complaints.editButton");
  const [data, setData] = useState<{ open: boolean; threads: PartyThread[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/complaints/${complaintId}/messages`);
      setData(data.data);
    } catch {
      setData({ open: false, threads: [] });
    }
  }, [complaintId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (!data) {
    return (
      <div className="flex justify-center py-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data.threads.length) return null;

  return (
    <div className="space-y-4">
      {data.threads.map((t) => (
        <div key={t.party} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <MessagesSquare className="h-3.5 w-3.5" />
            {t.party === "REP" ? "Rep" : "Driver"} answer — {t.name}
          </div>
          <ComplaintThread
            messages={t.messages}
            fileUrl={(attId) => `/complaints/attachments/${attId}/file`}
            mine={(m) => m.authorType === "STAFF"}
            labels={{
              office: "Office",
              empty: `No answer from the ${t.party === "REP" ? "rep" : "driver"} yet. They see this complaint in their app / portal.`,
            }}
          />
          {data.open && canReply && (
            <ThreadComposer
              postUrl={`/complaints/${complaintId}/messages`}
              extra={{ party: t.party }}
              onSent={load}
              labels={{
                placeholder: `Reply to the ${t.party === "REP" ? "rep" : "driver"}…`,
                attach: "Attach",
                camera: "Camera",
                send: "Send reply",
                sent: "Reply sent",
                tooMany: "At most 10 files",
                tooBig: "larger than 15 MB",
                needSomething: "Write a reply or attach a file",
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
