"use client";

// Quality Control › Guest Analytics — what the arrival guest surveys say, for a period (by job date):
// who the guests are (nationality, age, party, stay, repeat), where they stay, who sent them, how
// well reps cover arrivals with a survey, and what guests write. Data: GET /reports/guest-analytics
// (reports.service › guestAnalytics; free text folded by survey-normalize.util.ts).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ClipboardList, Loader2, MessageSquareQuote, RefreshCw, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";
import { localDateStr } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Named {
  name: string;
  count: number;
}
interface Grouped extends Named {
  repeatPct: number;
  avgParty: number;
}
interface Analytics {
  from: string;
  to: string;
  kpis: {
    surveys: number;
    eligibleArrivals: number;
    coveragePct: number;
    guests: number;
    adults: number;
    children: number;
    infants: number;
    avgParty: number;
    repeatPct: number;
    repeats: number;
    avgStayDays: number | null;
    emailPct: number;
    localAgentPct: number;
    commentPct: number;
  };
  trend: { weekly: boolean; points: { date: string; count: number }[] };
  weekday: Named[];
  nationalities: Grouped[];
  hotels: Grouped[];
  operators: Grouped[];
  localAgents: Named[];
  ageRanges: Named[];
  stay: Named[];
  partyTypes: Named[];
  repeat: { yes: number; no: number };
  reps: { repId: string; repName: string; surveys: number; eligible: number; coveragePct: number }[];
  words: { word: string; count: number }[];
  comments: { date: string; ref: string; rep: string; nationality: string; hotel: string; repeat: boolean; comment: string }[];
}

const fmt = (n: number) => n.toLocaleString("en-US");
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });

// ── Building blocks ──

function Panel({ title, sub, children, className }: { title: string; sub?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("border-border bg-card p-4", className)}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </Card>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "warn" | "bad" }) {
  return (
    <Card className="border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums text-foreground",
          tone === "good" && "text-green-600 dark:text-green-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "bad" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

/** Horizontal bars: label · bar · value (+ optional right-hand detail). */
function BarList({ items, total, detail, empty = "No data", max = 12 }: { items: Named[]; total?: number; detail?: (i: Named) => ReactNode; empty?: string; max?: number }) {
  if (!items.length) return <p className="py-4 text-center text-xs text-muted-foreground">{empty}</p>;
  const top = items.slice(0, max);
  const peak = Math.max(...top.map((i) => i.count), 1);
  return (
    <div className="space-y-1.5">
      {top.map((i) => (
        <div key={i.name} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs">
          <span className="truncate text-foreground" title={i.name} dir="auto">
            {i.name}
          </span>
          <div className="h-4 rounded bg-muted">
            <div className="h-4 rounded bg-primary/80" style={{ width: `${(i.count / peak) * 100}%` }} />
          </div>
          <span className="w-24 text-right tabular-nums text-muted-foreground">
            <b className="text-foreground">{fmt(i.count)}</b>
            {total ? ` · ${Math.round((i.count / total) * 100)}%` : ""}
            {detail && <span className="block text-[10px]">{detail(i)}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Area + line trend over the period. */
function Trend({ points, weekly }: { points: { date: string; count: number }[]; weekly: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return null;
  const W = 720, H = 180, P = { l: 30, r: 10, t: 10, b: 24 };
  const peak = Math.max(...points.map((p) => p.count), 1);
  const x = (i: number) => P.l + (points.length === 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (points.length - 1));
  const y = (v: number) => H - P.b - (v / peak) * (H - P.t - P.b);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.count)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${H - P.b} L${x(0)},${H - P.b} Z`;
  const ticks = [0, Math.ceil(peak / 2), peak];
  const every = Math.max(1, Math.ceil(points.length / 8));
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="stroke-border" strokeDasharray="3 3" />
            <text x={P.l - 6} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">{t}</text>
          </g>
        ))}
        <path d={area} className="fill-primary/15" />
        <path d={line} className="stroke-primary" fill="none" strokeWidth={2} />
        {points.map((p, i) => (
          <g key={p.date}>
            <rect x={x(i) - (W / points.length) / 2} y={0} width={W / points.length} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
            {(i % every === 0 || i === points.length - 1) && (
              <text x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">{dayLabel(p.date)}</text>
            )}
            {hover === i && <circle cx={x(i)} cy={y(p.count)} r={4} className="fill-primary" />}
          </g>
        ))}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow" style={{ left: `${(x(hover) / W) * 100}%`, transform: "translateX(-50%)" }}>
          {weekly ? "Week of " : ""}
          {dayLabel(points[hover].date)}: <b>{points[hover].count}</b> survey(s)
        </div>
      )}
    </div>
  );
}

/** Vertical bars (weekday). */
function Columns({ items }: { items: Named[] }) {
  const peak = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="flex h-36 items-end gap-2">
      {items.map((i) => (
        <div key={i.name} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] tabular-nums text-muted-foreground">{i.count}</span>
          <div className="w-full rounded-t bg-primary/80" style={{ height: `${Math.max(2, (i.count / peak) * 100)}px` }} />
          <span className="text-[10px] text-muted-foreground">{i.name}</span>
        </div>
      ))}
    </div>
  );
}

/** Two-part donut (repeat vs first visit). */
function Donut({ a, b, labelA, labelB }: { a: number; b: number; labelA: string; labelB: string }) {
  const total = a + b || 1;
  const R = 42, C = 2 * Math.PI * R;
  const pa = a / total;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 110 110" className="h-28 w-28 -rotate-90">
        <circle cx="55" cy="55" r={R} fill="none" strokeWidth="16" className="stroke-muted" />
        <circle cx="55" cy="55" r={R} fill="none" strokeWidth="16" className="stroke-green-500" strokeDasharray={`${pa * C} ${C}`} />
      </svg>
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-green-500" />
          {labelA}: <b className="text-foreground">{fmt(a)}</b> ({Math.round(pa * 100)}%)
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-muted" />
          {labelB}: <b className="text-foreground">{fmt(b)}</b> ({Math.round((1 - pa) * 100)}%)
        </div>
      </div>
    </div>
  );
}

/** Stacked composition bar (adults / children / infants). */
function Stack({ parts }: { parts: { label: string; value: number; className: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="space-y-2">
      <div className="flex h-5 overflow-hidden rounded">
        {parts.map((p) => (
          <div key={p.label} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} title={`${p.label}: ${p.value}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5">
            <span className={cn("h-3 w-3 rounded-sm", p.className)} />
            {p.label}: <b className="text-foreground">{fmt(p.value)}</b> ({Math.round((p.value / total) * 100)}%)
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Page ──

const RANGES: { label: string; days?: number; ytd?: boolean }[] = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "This year", ytd: true },
];

export default function GuestAnalyticsPage() {
  const now = new Date();
  const [from, setFrom] = useState(() => localDateStr(new Date(now.getTime() - 29 * 86_400_000)));
  const [to, setTo] = useState(() => localDateStr(now));
  const [repId, setRepId] = useState("ALL");
  const [reps, setReps] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [onlyNat, setOnlyNat] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/reps", { params: { isActive: true, limit: 1000 } })
      .then(({ data: d }) => setReps(((Array.isArray(d) ? d : d.data) || []).map((r: { id: string; name: string }) => ({ id: r.id, name: r.name }))))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get("/reports/guest-analytics", { params: { from, to, ...(repId !== "ALL" && { repId }) } });
      setData(d.data);
    } catch {
      toast.error("Failed to load guest analytics");
    } finally {
      setLoading(false);
    }
  }, [from, to, repId]);

  useEffect(() => {
    load();
  }, [load]);

  const setRange = (r: (typeof RANGES)[number]) => {
    const end = new Date();
    setTo(localDateStr(end));
    setFrom(localDateStr(r.ytd ? new Date(end.getFullYear(), 0, 1) : new Date(end.getTime() - ((r.days ?? 30) - 1) * 86_400_000)));
  };

  const comments = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    return data.comments.filter(
      (c) => (!onlyNat || c.nationality === onlyNat) && (!s || `${c.comment} ${c.hotel} ${c.rep} ${c.nationality}`.toLowerCase().includes(s)),
    );
  }, [data, q, onlyNat]);

  const k = data?.kpis;
  const coverageTone = !k || !k.eligibleArrivals ? undefined : k.coveragePct >= 80 ? "good" : k.coveragePct >= 50 ? "warn" : "bad";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Guest Analytics" description="What arrival guest surveys tell us — guests, stays, hotels, sources, rep coverage and comments." />
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/guest-surveys">
            <ClipboardList className="mr-1.5 h-4 w-4" />
            Guest Surveys
          </Link>
        </Button>
      </div>

      <Card className="border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-0.5 h-8 w-36 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-0.5 h-8 w-36 text-sm" />
          </div>
          <div className="min-w-[180px]">
            <Label className="text-xs text-muted-foreground">Rep</Label>
            <Select value={repId} onValueChange={setRepId}>
              <SelectTrigger className="mt-0.5 h-8 text-sm">
                <SelectValue placeholder="All reps" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All reps</SelectItem>
                {reps.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="inline-flex rounded-md border border-border p-0.5">
            {RANGES.map((r) => (
              <Button key={r.label} size="sm" variant="ghost" className="h-7 px-2.5 text-xs" onClick={() => setRange(r)}>
                {r.label}
              </Button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="ml-auto gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
      </Card>

      {!data ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data.kpis.surveys === 0 ? (
        <Card className="border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No guest surveys for this period{repId !== "ALL" ? " and rep" : ""}. {data.kpis.eligibleArrivals} arrival(s) with a rep had none.
        </Card>
      ) : (
        <div className={cn("space-y-4", loading && "opacity-60")}>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Surveys" value={fmt(k!.surveys)} hint={`${fmt(k!.guests)} guests covered`} />
            <Kpi label="Survey coverage" value={`${k!.coveragePct}%`} hint={`of ${fmt(k!.eligibleArrivals)} arrivals with a rep`} tone={coverageTone} />
            <Kpi label="Repeat guests" value={`${k!.repeatPct}%`} hint={`${fmt(k!.repeats)} came back`} tone={k!.repeatPct >= 40 ? "good" : undefined} />
            <Kpi label="Average party" value={k!.avgParty} hint={`${fmt(k!.adults)} adults · ${fmt(k!.children)} children · ${fmt(k!.infants)} infants`} />
            <Kpi label="Average stay" value={k!.avgStayDays !== null ? `${k!.avgStayDays} days` : "—"} hint="where the stay was given" />
            <Kpi label="Contact captured" value={`${k!.emailPct}%`} hint={`emails · ${k!.localAgentPct}% named a local agent · ${k!.commentPct}% commented`} />
          </div>

          {/* Trend + weekday */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Surveys over time" sub={data.trend.weekly ? "Per week (Monday start)" : "Per day"} className="lg:col-span-2">
              <Trend points={data.trend.points} weekly={data.trend.weekly} />
            </Panel>
            <Panel title="By weekday" sub="Arrival day of the surveyed jobs">
              <Columns items={data.weekday} />
            </Panel>
          </div>

          {/* Who the guests are */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Nationalities" sub="Spellings folded (Germany / German → German). Click one to filter the comments.">
              <div className="space-y-1.5">
                {data.nationalities.slice(0, 12).map((n) => {
                  const peak = data.nationalities[0]?.count || 1;
                  return (
                    <button
                      key={n.name}
                      type="button"
                      onClick={() => setOnlyNat(onlyNat === n.name ? null : n.name)}
                      className={cn("grid w-full grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-2 rounded text-left text-xs hover:bg-muted/60", onlyNat === n.name && "bg-primary/10")}
                    >
                      <span className="truncate text-foreground">{n.name}</span>
                      <div className="h-4 rounded bg-muted">
                        <div className="h-4 rounded bg-primary/80" style={{ width: `${(n.count / peak) * 100}%` }} />
                      </div>
                      <span className="w-28 text-right tabular-nums text-muted-foreground">
                        <b className="text-foreground">{n.count}</b> · {n.repeatPct}% repeat
                      </span>
                    </button>
                  );
                })}
              </div>
            </Panel>
            <Panel title="Repeat vs first visit">
              <Donut a={data.repeat.yes} b={data.repeat.no} labelA="Repeat guests" labelB="First visit" />
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-foreground">Party composition</p>
                <Stack
                  parts={[
                    { label: "Adults", value: k!.adults, className: "bg-primary/80" },
                    { label: "Children", value: k!.children, className: "bg-amber-500" },
                    { label: "Infants", value: k!.infants, className: "bg-pink-500" },
                  ]}
                />
              </div>
            </Panel>
            <Panel title="Party type">
              <BarList items={data.partyTypes} total={k!.surveys} />
              <p className="mb-2 mt-4 text-xs font-medium text-foreground">Age range</p>
              <BarList items={data.ageRanges} total={k!.surveys} />
            </Panel>
          </div>

          {/* Stay, hotels, sources */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Length of stay" sub="Free text read as days (1 week = 7)">
              <BarList items={data.stay} total={k!.surveys} />
            </Panel>
            <Panel title="Top hotels" sub="Job's hotel when set, else as typed">
              <BarList items={data.hotels} detail={(i) => `${(i as Grouped).repeatPct}% repeat`} />
            </Panel>
            <Panel title="Tour operators" sub="Agent / customer on the surveyed jobs">
              <BarList items={data.operators} total={k!.surveys} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Local travel agents named" sub={`${k!.localAgentPct}% of surveys named one`}>
              <BarList items={data.localAgents} empty="No local agents named" />
            </Panel>
            <Panel title="Rep survey coverage" sub="Surveys ÷ arrivals with that rep (not cancelled / no-show)" className="lg:col-span-2">
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left">
                      <th className="py-1 pr-2 font-semibold">Rep</th>
                      <th className="py-1 pr-2 text-right font-semibold">Surveys</th>
                      <th className="py-1 pr-2 text-right font-semibold">Arrivals</th>
                      <th className="w-1/2 py-1 font-semibold">Coverage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.reps.map((r) => (
                      <tr key={r.repId} className="border-t border-border">
                        <td className="py-1 pr-2 text-foreground">{r.repName}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{r.surveys}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{r.eligible}</td>
                        <td className="py-1">
                          <div className="flex items-center gap-2">
                            <div className="h-3 flex-1 rounded bg-muted">
                              <div
                                className={cn("h-3 rounded", r.coveragePct >= 80 ? "bg-green-500" : r.coveragePct >= 50 ? "bg-amber-500" : "bg-red-500")}
                                style={{ width: `${Math.min(100, r.coveragePct)}%` }}
                              />
                            </div>
                            <span className="w-12 text-right tabular-nums">{r.eligible ? `${r.coveragePct}%` : "—"}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          {/* Voice of the guest */}
          <Panel title="What guests say" sub={`${data.comments.length} comment(s) · most frequent words — click to search`}>
            {data.words.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {data.words.map((w) => {
                  const peak = data.words[0].count;
                  return (
                    <button
                      key={w.word}
                      type="button"
                      onClick={() => setQ(q === w.word ? "" : w.word)}
                      className={cn("rounded-full border border-border px-2 py-0.5 hover:bg-muted", q === w.word && "bg-primary/10")}
                      style={{ fontSize: `${11 + (w.count / peak) * 6}px` }}
                      dir="auto"
                    >
                      {w.word} <span className="text-muted-foreground">{w.count}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="relative w-72">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search comments…" className="h-8 pl-8 text-xs" />
              </div>
              {onlyNat && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOnlyNat(null)}>
                  {onlyNat} ✕
                </Button>
              )}
              <span className="text-xs text-muted-foreground">{comments.length} shown</span>
            </div>
            <div className="max-h-96 space-y-2 overflow-auto pr-1">
              {comments.map((c, i) => (
                <div key={`${c.ref}-${i}`} className="rounded-md border border-border p-2.5">
                  <p className="flex gap-2 text-sm text-foreground" dir="auto">
                    <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    {c.comment}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {dayLabel(c.date)} · {c.ref} · {c.nationality} · {c.hotel} · rep {c.rep}
                    {c.repeat ? " · repeat guest" : ""}
                  </p>
                </div>
              ))}
              {comments.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No comments match.</p>}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
