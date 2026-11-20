"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2, MessageSquareWarning, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useLocaleId } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { ComplaintThread, ThreadComposer, type ThreadMessage } from "@/components/complaint-thread";

/**
 * Rep / driver portal › Complaints: every complaint that names them (as soon as it does), the story
 * without the money, and their own answer thread with the office (text + evidence).
 */
type Portal = "rep" | "driver";

interface ListRow {
  id: string;
  complaintNo: string;
  subject: string;
  status: string;
  open: boolean;
  messageCount: number;
  awaitingYou: boolean;
  categoryEn: string;
  categoryAr: string;
  jobRef: string;
  jobDate: string;
  chargedAmount?: number | null;
  chargedCurrency?: string | null;
}

interface Detail {
  id: string;
  complaintNo: string;
  subject: string;
  description: string;
  status: string;
  open: boolean;
  complaintDate: string;
  categoryEn: string;
  categoryAr: string;
  job: { internalRef: string; jobDate: string; serviceType: string; route: string | null; from: string | null; to: string | null; guest: string | null; pax: number };
  messages: ThreadMessage[];
}

const EN = {
  title: "Complaints",
  intro: "Complaints that name you. Read what happened and send your side with any evidence (photos, WhatsApp screenshots, PDF).",
  none: "No complaints name you.",
  open: "Open",
  closed: "Closed",
  answerNeeded: "Answer needed",
  back: "Back",
  job: "Job",
  route: "Route",
  guest: "Guest",
  pax: "Pax",
  category: "Category",
  what: "What the guest / customer said",
  thread: "Your answer to the office",
  empty: "No answers yet. Write your side of the story below.",
  office: "Office",
  readOnly: "This complaint is closed — the conversation is read-only.",
  placeholder: "Write your answer…",
  attach: "Attach",
  camera: "Camera",
  send: "Send",
  sent: "Answer sent",
  tooMany: "At most 10 files per answer",
  tooBig: "larger than 15 MB",
  needSomething: "Write an answer or attach evidence",
  deducted: "Deducted",
  statuses: { OPEN: "Open", UNDER_REVIEW: "Under review", REPLIED: "Replied", ESCALATED: "Escalated", WON: "Won", PARTIALLY_LOST: "Partially lost", LOST: "Lost", CANCELLED: "Cancelled" } as Record<string, string>,
};
const AR: typeof EN = {
  title: "الشكاوى",
  intro: "الشكاوى التي تذكرك. اقرأ ما حدث وأرسل ردك مع أي دليل (صور، لقطات واتساب، PDF).",
  none: "لا توجد شكاوى تذكرك.",
  open: "مفتوحة",
  closed: "مغلقة",
  answerNeeded: "مطلوب ردك",
  back: "رجوع",
  job: "الرحلة",
  route: "المسار",
  guest: "الضيف",
  pax: "عدد الأفراد",
  category: "التصنيف",
  what: "ما قاله الضيف / العميل",
  thread: "ردك على الإدارة",
  empty: "لا توجد ردود بعد. اكتب روايتك بالأسفل.",
  office: "الإدارة",
  readOnly: "هذه الشكوى مغلقة — المحادثة للقراءة فقط.",
  placeholder: "اكتب ردك…",
  attach: "إرفاق",
  camera: "الكاميرا",
  send: "إرسال",
  sent: "تم إرسال الرد",
  tooMany: "10 ملفات كحد أقصى لكل رد",
  tooBig: "أكبر من 15 ميجابايت",
  needSomething: "اكتب ردًا أو أرفق دليلًا",
  deducted: "تم الخصم",
  statuses: { OPEN: "مفتوحة", UNDER_REVIEW: "قيد المراجعة", REPLIED: "تم الرد", ESCALATED: "مُصعّدة", WON: "لصالحنا", PARTIALLY_LOST: "خسارة جزئية", LOST: "خسارة", CANCELLED: "ملغاة" },
};

export function PortalComplaints({ portal }: { portal: Portal }) {
  const localeId = useLocaleId();
  const ar = localeId.startsWith("ar");
  const L = ar ? AR : EN;
  const base = `/${portal}-portal/complaints`;
  const me = portal === "rep" ? "REP" : "DRIVER";

  const [rows, setRows] = useState<ListRow[] | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const { data } = await api.get(base);
      setRows(data.data ?? []);
    } catch {
      toast.error("Failed to load complaints");
      setRows([]);
    }
  }, [base]);

  const loadDetail = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const { data } = await api.get(`${base}/${id}`);
        setDetail(data.data);
      } catch {
        toast.error("Failed to load the complaint");
        setOpenId(null);
      } finally {
        setLoading(false);
      }
    },
    [base],
  );

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Deep link: /rep/complaints?id=… (from a notification)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) setOpenId(id);
  }, []);

  useEffect(() => {
    if (openId) loadDetail(openId);
    else setDetail(null);
  }, [openId, loadDetail]);

  const statusBadge = (status: string, open: boolean) => (
    <Badge variant="outline" className={cn("text-[11px]", open ? "border-amber-500 text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
      {L.statuses[status] ?? status}
    </Badge>
  );

  if (openId) {
    return (
      <div className="space-y-4" dir={ar ? "rtl" : "ltr"}>
        <Button variant="ghost" size="sm" onClick={() => { setOpenId(null); loadList(); }}>
          <ArrowLeft className={cn("h-4 w-4", ar ? "ml-1 rotate-180" : "mr-1")} />
          {L.back}
        </Button>
        {loading || !detail ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">{detail.complaintNo}</div>
                    <div className="font-semibold">{detail.subject}</div>
                  </div>
                  {statusBadge(detail.status, detail.open)}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div className="text-muted-foreground">{L.job}</div>
                  <div>{detail.job.internalRef} · {formatDate(detail.job.jobDate)}</div>
                  {(detail.job.route || detail.job.from) && (
                    <>
                      <div className="text-muted-foreground">{L.route}</div>
                      <div>{detail.job.route ?? `${detail.job.from ?? "—"} → ${detail.job.to ?? "—"}`}</div>
                    </>
                  )}
                  {detail.job.guest && (
                    <>
                      <div className="text-muted-foreground">{L.guest}</div>
                      <div>{detail.job.guest} · {L.pax} {detail.job.pax}</div>
                    </>
                  )}
                  <div className="text-muted-foreground">{L.category}</div>
                  <div>{ar ? detail.categoryAr || detail.categoryEn : detail.categoryEn}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{L.what}</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{detail.description}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="text-sm font-semibold">{L.thread}</div>
                <ComplaintThread
                  messages={detail.messages}
                  fileUrl={(attId) => `${base}/${detail.id}/attachments/${attId}`}
                  mine={(m) => m.authorType === me}
                  labels={{ office: L.office, empty: L.empty }}
                  locale={localeId}
                />
                {detail.open ? (
                  <ThreadComposer
                    postUrl={`${base}/${detail.id}/messages`}
                    onSent={() => loadDetail(detail.id)}
                    labels={L}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">{L.readOnly}</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4" dir={ar ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <MessageSquareWarning className="h-5 w-5" />
          {L.title}
        </h1>
        <Button variant="ghost" size="icon" onClick={loadList} aria-label="refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{L.intro}</p>
      {rows === null ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">{L.none}</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <button key={r.id} type="button" className="block w-full text-start" onClick={() => setOpenId(r.id)}>
              <Card className={cn("transition-colors hover:bg-muted/50", r.awaitingYou && "border-amber-500")}>
                <CardContent className="space-y-1 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {r.complaintNo} · {r.jobRef} · {formatDate(r.jobDate)}
                    </span>
                    {statusBadge(r.status, r.open)}
                  </div>
                  <div className="font-medium">{r.subject}</div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{ar ? r.categoryAr || r.categoryEn : r.categoryEn}</span>
                    {r.messageCount > 0 && <span>· 💬 {r.messageCount}</span>}
                    {r.awaitingYou && (
                      <Badge className="bg-amber-500 text-white hover:bg-amber-500 text-[11px]">{L.answerNeeded}</Badge>
                    )}
                    {r.chargedAmount ? (
                      <span className="text-red-600">
                        · {L.deducted} {r.chargedAmount} {r.chargedCurrency}
                      </span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
