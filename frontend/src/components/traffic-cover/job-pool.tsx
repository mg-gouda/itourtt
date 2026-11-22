"use client";

/**
 * Traffic Cover › Job pool: the day's B2B and Online jobs that have no car yet, in three tables
 * (Arrivals, Departures, Other) sorted by time. Tick one or several rows (in any table) and drag
 * them onto a car card to assign them; drag a job from a car card back here to take it off the car.
 * Drag data travels as JSON under JOBS_MIME (see DragJobsPayload).
 */

import { useMemo, useState, type DragEvent } from "react";
import { GripVertical, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export const JOBS_MIME = "application/x-itour-jobs";

/** What is being dragged: jobs from the pool, or one saved job from a car card. */
export interface DragJobsPayload {
  source: "pool" | "card";
  jobs: { jobId: string; assignmentId?: string; ref: string }[];
  fromVehicleId?: string;
}

export function setDragJobs(e: DragEvent, payload: DragJobsPayload) {
  e.dataTransfer.setData(JOBS_MIME, JSON.stringify(payload));
  e.dataTransfer.setData("text/plain", payload.jobs.map((j) => j.ref).join(", "));
  e.dataTransfer.effectAllowed = "move";
}

export function readDragJobs(e: DragEvent): DragJobsPayload | null {
  try {
    const raw = e.dataTransfer.getData(JOBS_MIME);
    return raw ? (JSON.parse(raw) as DragJobsPayload) : null;
  } catch {
    return null;
  }
}

export const isJobsDrag = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(JOBS_MIME);

export interface PoolJob {
  id: string;
  ref: string; // internal ref
  customerJobId: string;
  customer: string;
  channel: string;
  serviceType: string;
  route: string;
  time: string; // HH:MM (pick-up, else flight time)
  pax: number;
  flightNo: string;
  notes: string;
  carType: string; // requested vehicle type
  assignmentId?: string; // an assignment without a car (e.g. rep only)
}

const GROUPS: { key: "ARR" | "DEP" | "OTHER"; label: string; tone: string }[] = [
  { key: "ARR", label: "Arrivals", tone: "border-t-blue-500" },
  { key: "DEP", label: "Departures", tone: "border-t-green-500" },
  { key: "OTHER", label: "Other (transfers, trips, tours)", tone: "border-t-amber-500" },
];

const groupOf = (j: PoolJob) => (j.serviceType === "ARR" ? "ARR" : j.serviceType === "DEP" ? "DEP" : "OTHER");

export function JobPool({
  jobs,
  selected,
  onSelectedChange,
  onDropFromCar,
}: {
  jobs: PoolJob[];
  selected: Set<string>;
  onSelectedChange: (s: Set<string>) => void;
  /** A job dragged from a car card was dropped on the pool: take it off its car. */
  onDropFromCar: (payload: DragJobsPayload) => void;
}) {
  const [over, setOver] = useState(false);
  const groups = useMemo(() => {
    const byTime = (a: PoolJob, b: PoolJob) => (a.time || "99:99").localeCompare(b.time || "99:99") || a.ref.localeCompare(b.ref);
    return GROUPS.map((g) => ({ ...g, rows: jobs.filter((j) => groupOf(j) === g.key).sort(byTime) }));
  }, [jobs]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };
  const toggleGroup = (rows: PoolJob[]) => {
    const all = rows.length > 0 && rows.every((r) => selected.has(r.id));
    const next = new Set(selected);
    rows.forEach((r) => (all ? next.delete(r.id) : next.add(r.id)));
    onSelectedChange(next);
  };

  const startDrag = (e: DragEvent, row: PoolJob) => {
    // Dragging a ticked row takes every ticked job; dragging an unticked row takes just that one.
    const ids = selected.has(row.id) ? jobs.filter((j) => selected.has(j.id)) : [row];
    setDragJobs(e, { source: "pool", jobs: ids.map((j) => ({ jobId: j.id, assignmentId: j.assignmentId, ref: j.ref })) });
  };

  return (
    <section
      onDragOver={(e) => {
        if (!isJobsDrag(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const p = readDragJobs(e);
        if (p?.source === "card") {
          e.preventDefault();
          onDropFromCar(p);
        }
      }}
      className={cn("space-y-2 rounded-lg border border-dashed border-border p-3 transition-colors", over && "border-primary bg-primary/5")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Job pool <span className="font-normal text-muted-foreground">· {jobs.length} without a car</span>
        </h2>
        <p className="text-xs text-muted-foreground">
          Tick jobs (any table) and drag them onto a car card · drag a job from a card back here to take it off the car
          {selected.size > 0 && (
            <>
              {" · "}
              <b>{selected.size} selected</b>{" "}
              <button type="button" className="underline" onClick={() => onSelectedChange(new Set())}>
                clear
              </button>
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {groups.map((g) => {
          const allTicked = g.rows.length > 0 && g.rows.every((r) => selected.has(r.id));
          return (
            <div key={g.key} className={cn("min-w-0 overflow-hidden rounded-md border border-t-4 bg-card", g.tone)}>
              <div className="flex items-center justify-between border-b px-2 py-1.5 text-xs font-semibold">
                <span>
                  {g.label} <span className="font-normal text-muted-foreground">({g.rows.length})</span>
                </span>
              </div>
              {g.rows.length === 0 ? (
                <div className="flex items-center justify-center gap-1.5 py-5 text-xs text-muted-foreground">
                  <Inbox className="h-3.5 w-3.5" /> Nothing waiting
                </div>
              ) : (
                <div className="max-h-[24vh] overflow-auto">
                  <table className="w-full border-collapse text-[11px]">
                    <thead className="sticky top-0 z-10 bg-muted">
                      <tr className="text-left">
                        <th className="w-6 px-1 py-1">
                          <input type="checkbox" checked={allTicked} onChange={() => toggleGroup(g.rows)} title="Tick all" />
                        </th>
                        <th className="w-4" />
                        <th className="px-1 py-1">Time</th>
                        <th className="px-1 py-1">Job</th>
                        <th className="px-1 py-1">Customer</th>
                        <th className="px-1 py-1">Route</th>
                        <th className="px-1 py-1 text-center">Pax</th>
                        <th className="px-1 py-1">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r) => {
                        const on = selected.has(r.id);
                        return (
                          <tr
                            key={r.id}
                            draggable
                            onDragStart={(e) => startDrag(e, r)}
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest("input")) return;
                              toggle(r.id);
                            }}
                            className={cn("cursor-grab border-t hover:bg-muted/60 active:cursor-grabbing", on && "bg-primary/10")}
                            title={[r.flightNo && `Flight ${r.flightNo}`, r.carType && `Car type ${r.carType}`, r.channel].filter(Boolean).join(" · ")}
                          >
                            <td className="px-1 py-1">
                              <input type="checkbox" checked={on} onChange={() => toggle(r.id)} />
                            </td>
                            <td className="text-muted-foreground">
                              <GripVertical className="h-3 w-3" />
                            </td>
                            <td className="whitespace-nowrap px-1 py-1 font-mono">{r.time || "—"}</td>
                            <td className="whitespace-nowrap px-1 py-1">
                              <div className="font-medium">{r.customerJobId || r.ref}</div>
                              {r.customerJobId && <div className="text-[10px] text-muted-foreground">{r.ref}</div>}
                            </td>
                            <td className="max-w-[110px] truncate px-1 py-1" title={r.customer}>
                              {r.customer}
                            </td>
                            <td className="max-w-[130px] truncate px-1 py-1" title={r.route} dir="auto">
                              {r.route.split(" | ")[0] || "—"}
                            </td>
                            <td className="px-1 py-1 text-center">{r.pax}</td>
                            <td className="max-w-[120px] truncate px-1 py-1" title={r.notes} dir="auto">
                              {r.notes}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
