"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Loader2,
  AlertTriangle,
  Clock,
  MessageSquareWarning,
  Trophy,
  Timer,
  Coins,
  Gauge,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/i18n";
import { usePermission } from "@/hooks/use-permission";
import {
  type ComplaintCategory,
  type ComplaintStatus,
  COMPLAINT_STATUS_META,
  STAGE_LABELS,
  SOURCE_LABELS,
  PARTY_LABELS,
  formatMoney,
} from "@/lib/complaints";

// ── shapes returned by GET /complaints/analytics ──────────────────────

interface Slice {
  key: string;
  label: string;
  total: number;
  breached: number;
  lost: number;
  won: number;
  /** Absent — not null — for viewers without complaints.financial.viewAmounts. */
  lossAmount?: number;
}

interface ResponsibleSlice extends Slice {
  party: string;
  penaltyPoints: number;
}

interface Analytics {
  range: { from: string; to: string };
  totals: {
    total: number;
    open: number;
    settled: number;
    cancelled: number;
    won: number;
    lost: number;
    partiallyLost: number;
    decided: number;
    winRate: number;
    breached: number;
    breachRate: number;
    awaitingReply: number;
    overdueNow: number;
    repliedInTime: number;
    repliedLate: number;
    avgReplyHours: number;
    avgResolutionDays: number;
    penaltyPointsTotal: number;
    jobsInRange: number;
    complaintsPer100Jobs: number;
  };
  sla: {
    repliedInTime: number;
    repliedLate: number;
    awaitingWithinWindow: number;
    awaitingOverdue: number;
  };
  byStatus: Slice[];
  byStage: Slice[];
  bySource: Slice[];
  byParty: Slice[];
  byCategory: Slice[];
  byAgent: Slice[];
  byResponsible: ResponsibleSlice[];
  byMonth: Slice[];
  money?: {
    claimedTotal: number;
    lossTotal: number;
    avgLoss: number;
    concededRate: number;
    chargesPostedTotal: number;
    chargesPostedCount: number;
    chargesPendingCount: number;
    byCurrency: { currency: string; count: number; claimed: number; loss: number }[];
  };
}

interface AgentOption {
  id: string;
  legalName: string;
  tradeName?: string | null;
}

/** yyyy-mm-dd, which is what a date input wants. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}

// ── building blocks ───────────────────────────────────────────────────

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ElementType;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "bad"
          ? "text-red-600 dark:text-red-400"
          : "text-foreground";

  return (
    <Card className="gap-0 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
      </div>
    </Card>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </Card>
  );
}

/**
 * A ranked breakdown. Bars are drawn against the largest row rather than the
 * total, so a long tail stays readable instead of collapsing into slivers.
 */
function BarList({
  rows,
  emptyText = "Nothing in this range.",
  barClass = "bg-primary",
}: {
  rows: { key: string; label: string; value: number; sub?: string }[];
  emptyText?: string;
  barClass?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((sum, r) => sum + r.value, 0);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{row.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {row.value}
              {total > 0 && (
                <span className="ml-1 text-xs">
                  ({Math.round((row.value / total) * 100)}%)
                </span>
              )}
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${barClass}`}
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </div>
          {row.sub && <p className="mt-0.5 text-xs text-muted-foreground">{row.sub}</p>}
        </div>
      ))}
    </div>
  );
}

/** The reply window at a glance: answered in time, answered late, still open. */
function SlaBar({ sla }: { sla: Analytics["sla"] }) {
  const segments = [
    { key: "inTime", label: "Replied in time", value: sla.repliedInTime, class: "bg-emerald-500" },
    { key: "late", label: "Replied late", value: sla.repliedLate, class: "bg-red-500" },
    {
      key: "waiting",
      label: "Awaiting reply, still in window",
      value: sla.awaitingWithinWindow,
      class: "bg-amber-400",
    },
    {
      key: "overdue",
      label: "Awaiting reply, overdue",
      value: sla.awaitingOverdue,
      class: "bg-red-700",
    },
  ];
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">No complaints in this range.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.key}
              className={s.class}
              style={{ width: `${(s.value / total) * 100}%` }}
              title={`${s.label}: ${s.value}`}
            />
          ))}
      </div>
      <div className="grid gap-1 sm:grid-cols-2">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-xs">
            <span className={`h-2 w-2 shrink-0 rounded-full ${s.class}`} />
            <span className="truncate text-muted-foreground">{s.label}</span>
            <span className="ml-auto tabular-nums">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Volume per month, with the lost share stacked on top of the total. */
function MonthlyTrend({ months }: { months: Slice[] }) {
  if (months.length === 0) {
    return <p className="text-sm text-muted-foreground">No complaints in this range.</p>;
  }

  const max = Math.max(1, ...months.map((m) => m.total));

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-full items-end gap-3" style={{ height: 160 }}>
        {months.map((m) => {
          const lostShare = m.total > 0 ? m.lost / m.total : 0;
          return (
            <div key={m.key} className="flex min-w-10 flex-1 flex-col items-center gap-1">
              <span className="text-xs tabular-nums text-muted-foreground">{m.total}</span>
              <div
                className="relative w-full overflow-hidden rounded-t bg-primary/25"
                style={{ height: `${Math.max(4, (m.total / max) * 120)}px` }}
                title={`${monthLabel(m.key)} — ${m.total} complaints, ${m.lost} lost, ${m.breached} breached`}
              >
                <div
                  className="absolute bottom-0 w-full bg-red-500/80"
                  style={{ height: `${lostShare * 100}%` }}
                />
              </div>
              <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                {monthLabel(m.key)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary/25" /> Received
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500/80" /> Lost or partially lost
        </span>
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────

export default function ComplaintAnalyticsPage() {
  const t = useT();
  const canViewAmounts = usePermission("complaints.financial.viewAmounts");

  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<ComplaintCategory[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);

  const [dateFrom, setDateFrom] = useState(() =>
    isoDate(new Date(Date.now() - 90 * 86_400_000)),
  );
  const [dateTo, setDateTo] = useState(() => isoDate(new Date()));
  const [agentId, setAgentId] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [party, setParty] = useState("all");

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", new Date(dateFrom).toISOString());
      if (dateTo) params.set("dateTo", new Date(`${dateTo}T23:59:59`).toISOString());
      if (agentId !== "all") params.set("agentId", agentId);
      if (categoryId !== "all") params.set("categoryId", categoryId);
      if (party !== "all") params.set("responsibleParty", party);

      const res = await api.get(`/complaints/analytics?${params.toString()}`);
      setData(res.data.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to load complaint analytics");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, agentId, categoryId, party]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    api
      .get("/complaint-categories")
      .then((res) => setCategories(res.data?.data ?? []))
      .catch(() => setCategories([]));
    api
      .get("/agents/lookup")
      .then((res) => setAgents(res.data?.data ?? []))
      .catch(() => setAgents([]));
  }, []);

  const statusRows = useMemo(
    () =>
      (data?.byStatus ?? []).map((s) => ({
        key: s.key,
        label:
          COMPLAINT_STATUS_META[s.key as ComplaintStatus]?.label ?? s.label,
        value: s.total,
      })),
    [data],
  );

  const totals = data?.totals;
  const money = data?.money;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("complaintAnalytics.title")}
        description={t("complaintAnalytics.description")}
      />

      {/* Filters */}
      <Card className="gap-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Agent</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.tradeName || a.legalName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nameEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Responsible</Label>
            <Select value={party} onValueChange={setParty}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Anyone</SelectItem>
                {Object.entries(PARTY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={fetchAnalytics} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </Card>

      {loading && !data ? (
        <div className="flex h-60 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data || !totals ? (
        <p className="text-sm text-muted-foreground">No data for this range.</p>
      ) : (
        <>
          {/* Headline numbers */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Complaints received"
              value={totals.total}
              hint={`${totals.open} still open · ${totals.settled} settled`}
              icon={MessageSquareWarning}
            />
            <StatCard
              label="Per 100 jobs"
              value={totals.complaintsPer100Jobs}
              hint={`${totals.jobsInRange.toLocaleString()} jobs operated in range`}
              icon={Gauge}
            />
            <StatCard
              label="Reply SLA breached"
              value={`${totals.breachRate}%`}
              hint={`${totals.breached} of ${totals.total} · ${totals.overdueNow} overdue right now`}
              icon={AlertTriangle}
              tone={totals.breachRate > 10 ? "bad" : totals.breachRate > 0 ? "warn" : "good"}
            />
            <StatCard
              label="Average reply time"
              value={totals.avgReplyHours ? `${totals.avgReplyHours}h` : "—"}
              hint={`${totals.repliedInTime} in time · ${totals.repliedLate} late`}
              icon={Timer}
            />
            <StatCard
              label="Win rate"
              value={totals.decided ? `${totals.winRate}%` : "—"}
              hint={`${totals.won} won · ${totals.lost} lost · ${totals.partiallyLost} partial`}
              icon={Trophy}
              tone={totals.decided === 0 ? "neutral" : totals.winRate >= 50 ? "good" : "warn"}
            />
            <StatCard
              label="Awaiting a reply"
              value={totals.awaitingReply}
              hint={`${totals.overdueNow} past the deadline`}
              icon={Clock}
              tone={totals.overdueNow > 0 ? "bad" : "neutral"}
            />
            <StatCard
              label="Average time to settle"
              value={totals.avgResolutionDays ? `${totals.avgResolutionDays}d` : "—"}
              hint={`${totals.settled} settled, ${totals.cancelled} cancelled`}
              icon={CheckCircle2}
            />
            {money ? (
              <StatCard
                label="Conceded to agents"
                value={formatMoney(money.lossTotal, "EGP")}
                hint={`${money.concededRate}% of ${formatMoney(money.claimedTotal, "EGP")} claimed`}
                icon={Coins}
                tone={money.lossTotal > 0 ? "warn" : "good"}
              />
            ) : (
              <StatCard
                label="Score penalties applied"
                value={totals.penaltyPointsTotal}
                hint="Points deducted from rep and driver job scores"
                icon={Gauge}
              />
            )}
          </div>

          {/* Reply window + trend */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Reply window"
              description="Every complaint in range against its own deadline."
            >
              <SlaBar sla={data.sla} />
            </Panel>
            <Panel
              title="Received per month"
              description="Cairo months. The red part is what we ended up conceding."
            >
              <MonthlyTrend months={data.byMonth} />
            </Panel>
          </div>

          {/* Breakdowns */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="By status">
              <BarList rows={statusRows} />
            </Panel>
            <Panel title="By stage">
              <BarList
                rows={data.byStage.map((s) => ({
                  key: s.key,
                  label: STAGE_LABELS[s.key as keyof typeof STAGE_LABELS] ?? s.label,
                  value: s.total,
                }))}
              />
            </Panel>
            <Panel title="By source">
              <BarList
                rows={data.bySource.map((s) => ({
                  key: s.key,
                  label: SOURCE_LABELS[s.key as keyof typeof SOURCE_LABELS] ?? s.label,
                  value: s.total,
                }))}
              />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="By category"
              description="What we are actually being complained about."
            >
              <BarList
                rows={data.byCategory.map((s) => ({
                  key: s.key,
                  label: s.label,
                  value: s.total,
                  sub:
                    s.lost > 0
                      ? `${s.lost} lost${
                          s.lossAmount ? ` · ${formatMoney(s.lossAmount, "EGP")} conceded` : ""
                        }`
                      : undefined,
                }))}
              />
            </Panel>
            <Panel
              title="By responsible party"
              description="Who the complaint was pinned on, not who answered it."
            >
              <BarList
                rows={data.byParty.map((s) => ({
                  key: s.key,
                  label: PARTY_LABELS[s.key as keyof typeof PARTY_LABELS] ?? s.label,
                  value: s.total,
                }))}
                barClass="bg-amber-500"
              />
            </Panel>
          </div>

          {/* Agents */}
          <Panel
            title="Agents complaining most"
            description="Top 15 by volume in this range."
          >
            {data.byAgent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing in this range.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead className="text-right">Complaints</TableHead>
                      <TableHead className="text-right">Breached</TableHead>
                      <TableHead className="text-right">Won</TableHead>
                      <TableHead className="text-right">Lost</TableHead>
                      {canViewAmounts && <TableHead className="text-right">Conceded</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byAgent.map((a) => (
                      <TableRow key={a.key}>
                        <TableCell className="font-medium">{a.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{a.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{a.breached}</TableCell>
                        <TableCell className="text-right tabular-nums">{a.won}</TableCell>
                        <TableCell className="text-right tabular-nums">{a.lost}</TableCell>
                        {canViewAmounts && (
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(a.lossAmount ?? 0, "EGP")}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>

          {/* People */}
          <Panel
            title="Most complained-about people"
            description="Drivers, reps and suppliers named as responsible. Penalty points are what was actually deducted — a posted fee is never re-scored."
          >
            {data.byResponsible.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No complaint in this range names a driver, rep or supplier.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Party</TableHead>
                      <TableHead className="text-right">Complaints</TableHead>
                      <TableHead className="text-right">Lost</TableHead>
                      <TableHead className="text-right">Penalty pts</TableHead>
                      {canViewAmounts && <TableHead className="text-right">Conceded</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byResponsible.map((p) => (
                      <TableRow key={p.key}>
                        <TableCell className="font-medium">{p.label}</TableCell>
                        <TableCell>
                          {PARTY_LABELS[p.party as keyof typeof PARTY_LABELS] ?? p.party}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{p.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.lost}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.penaltyPoints}
                        </TableCell>
                        {canViewAmounts && (
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(p.lossAmount ?? 0, "EGP")}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>

          {/* Money — the backend leaves this out entirely without viewAmounts */}
          {money && (
            <Panel
              title="Money"
              description="Totals are converted to EGP with the rate stored on each complaint."
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Claimed by agents"
                  value={formatMoney(money.claimedTotal, "EGP")}
                  icon={Coins}
                />
                <StatCard
                  label="Conceded"
                  value={formatMoney(money.lossTotal, "EGP")}
                  hint={`${money.concededRate}% of what was claimed`}
                  icon={Coins}
                  tone={money.lossTotal > 0 ? "warn" : "good"}
                />
                <StatCard
                  label="Average loss"
                  value={formatMoney(money.avgLoss, "EGP")}
                  hint="Per complaint we actually paid on"
                  icon={Coins}
                />
                <StatCard
                  label="Charged back"
                  value={formatMoney(money.chargesPostedTotal, "EGP")}
                  hint={`${money.chargesPostedCount} posted · ${money.chargesPendingCount} awaiting`}
                  icon={Coins}
                />
              </div>

              {money.byCurrency.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Currency</TableHead>
                        <TableHead className="text-right">Complaints</TableHead>
                        <TableHead className="text-right">Claimed</TableHead>
                        <TableHead className="text-right">Conceded</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {money.byCurrency.map((c) => (
                        <TableRow key={c.currency}>
                          <TableCell className="font-medium">{c.currency}</TableCell>
                          <TableCell className="text-right tabular-nums">{c.count}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(c.claimed, c.currency)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(c.loss, c.currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
