"use client";

// System Parameters › Routes › RMF Hotels — the Marsa Alam hotels north / south of RMF airport and
// the deep south (table rmf_hotels). Traffic Cover reads this list: when a row's Notes name one of
// these hotels, the row's route becomes that hotel's area route for the row's leg.
// One Access-style datasheet per section: type in the ✱ row to add a hotel, a row saves when you
// leave it, select rows by their marker and press Delete to remove them.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DataSheet, type DSColumn } from "@/components/data-sheet";
import api from "@/lib/api";
import { RMF_AREAS, RMF_SECTIONS, findRmfHotel, type RmfHotel, type RmfSection } from "@/lib/rmf-hotel-match";

interface Row extends Omit<RmfHotel, "id"> {
  key: string; // the hotel id, or "new:n" until saved
  id: string | null;
  dirty: boolean;
  saving?: boolean;
  error?: string;
}

const errText = (e: unknown) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Not saved";

export function RmfHotelsTab({ canEdit, canDelete }: { canEdit: boolean; canDelete: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [probe, setProbe] = useState("");
  const seq = useRef(0);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const load = useCallback(async () => {
    try {
      const r = await api.get("/rmf-hotels");
      setRows(((r.data.data || []) as RmfHotel[]).map((h) => ({ ...h, key: h.id, dirty: false })));
    } catch {
      toast.error("Failed to load RMF hotels");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patchRow = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const save = async (key: string) => {
    const r = rowsRef.current.find((x) => x.key === key);
    if (!r || !r.dirty || r.saving) return;
    if (!r.name.trim()) return patchRow(key, { error: "Name is required" });
    patchRow(key, { saving: true, error: undefined });
    const body = {
      name: r.name,
      section: r.section,
      routeArea: r.routeArea,
      matchWords: r.matchWords,
      excludeWords: r.excludeWords || null,
      isActive: r.isActive,
    };
    try {
      const res = r.id ? await api.patch(`/rmf-hotels/${r.id}`, body) : await api.post("/rmf-hotels", body);
      const h = res.data.data as RmfHotel;
      patchRow(key, { ...h, id: h.id, dirty: false, saving: false });
    } catch (e) {
      patchRow(key, { saving: false, error: errText(e) });
    }
  };

  const remove = async (rs: Row[]) => {
    if (!rs.length) return;
    if (!window.confirm(`Delete ${rs.length === 1 ? `"${rs[0].name}"` : `${rs.length} hotels`} from the RMF list?`)) return;
    for (const r of rs) {
      try {
        if (r.id) await api.delete(`/rmf-hotels/${r.id}`);
        setRows((x) => x.filter((y) => y.key !== r.key));
      } catch (e) {
        toast.error(errText(e));
      }
    }
  };

  const edit = () => canEdit;
  const columns: DSColumn<Row>[] = [
    { key: "name", title: "Hotel", width: 260, get: (r) => r.name, editable: edit, placeholder: "Hotel name" },
    {
      key: "matchWords",
      title: "Match words (notes)",
      width: 300,
      get: (r) => r.matchWords,
      editable: edit,
      placeholder: "e.g. movenpick quseir, movenpick qusier",
    },
    { key: "excludeWords", title: "Not when notes say", width: 200, get: (r) => r.excludeWords ?? "", editable: edit, placeholder: "e.g. hurghada" },
    { key: "routeArea", title: "Route area", width: 170, type: "select", options: RMF_AREAS.map((a) => ({ value: a, label: a })), get: (r) => r.routeArea, editable: edit },
    {
      key: "isActive",
      title: "Status",
      width: 90,
      type: "select",
      options: [
        { value: "true", label: "Active" },
        { value: "false", label: "Inactive" },
      ],
      get: (r) => String(r.isActive),
      editable: edit,
    },
  ];

  const probeHit = probe.trim() ? findRmfHotel(probe, rows.filter((r) => r.id) as unknown as RmfHotel[]) : null;

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Marsa Alam hotels by where they lie from RMF airport. On Traffic Cover, when a row&apos;s Notes name one of these hotels, the
        route is set to its area (ARR / DEP / going / return). Match words: comma-separated alternatives; each word must start a word of
        the notes, in any order (&quot;movenpick quseir&quot; needs both). Type in the ✱ row to add a hotel; a row saves when you leave it.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={probe} onChange={(e) => setProbe(e.target.value)} placeholder="Test notes text, e.g. Jaz Lamaya Resort 5*" className="pl-9" />
        </div>
        {probe.trim() && (
          <span className="text-xs">
            {probeHit ? (
              <>
                Matches <b>{probeHit.name}</b> → {probeHit.routeArea}
              </>
            ) : (
              <span className="text-muted-foreground">No RMF hotel matches</span>
            )}
          </span>
        )}
      </div>

      {RMF_SECTIONS.map((s) => {
        const sectionRows = rows.filter((r) => r.section === s.key);
        return (
          <section key={s.key} className="space-y-1.5">
            <h3 className="text-sm font-semibold">
              {s.label} <span className="font-normal text-muted-foreground">({sectionRows.length}) · default route area {s.area}</span>
            </h3>
            <DataSheet
              rows={sectionRows}
              rowKey={(r) => r.key}
              columns={columns}
              maxHeight="45vh"
              onChange={(r, col, value) =>
                patchRow(r.key, { [col]: col === "isActive" ? value === "true" : value, dirty: true, error: undefined } as Partial<Row>)
              }
              onCreateRows={
                canEdit
                  ? (values) =>
                      setRows((rs) => [
                        ...rs,
                        ...values.map<Row>((v) => ({
                          key: `new:${++seq.current}`,
                          id: null,
                          name: v.name ?? "",
                          section: s.key as RmfSection,
                          routeArea: v.routeArea || s.area,
                          matchWords: v.matchWords ?? "",
                          excludeWords: v.excludeWords ?? "",
                          sortOrder: 0,
                          isActive: v.isActive ? v.isActive === "true" : true,
                          dirty: true,
                        })),
                      ])
                  : undefined
              }
              onRowLeave={canEdit ? (r) => void save(r.key) : undefined}
              onDeleteRows={canDelete ? (rs) => void remove(rs) : undefined}
              isDirty={(r) => r.dirty}
              rowError={(r) => r.error}
              rowClassName={(r) => !r.isActive && "opacity-60"}
              emptyText="No hotels yet — type in the ✱ row"
            />
          </section>
        );
      })}
    </div>
  );
}
