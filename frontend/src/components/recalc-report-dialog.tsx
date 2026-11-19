"use client";

// Result of a supplier-cost recalculation (price list edit / import / suppliers moved between
// lists): counts, plus posted costs that were left alone but would now differ (CSV download).

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { localDateStr } from "@/lib/utils";

export interface RecalcReport {
  jobs: number;
  costed: number;
  noPrice: number;
  noPriceList: number;
  postedUnchanged: number;
  postedDifferences: { internalRef: string; jobDate: string; supplier: string; postedAmount: number; newAmount: number | null; difference: number | null }[];
}
/** Report of a recalculation, with posted costs whose price changed (CSV download). */
export function RecalcReportDialog({ report, onClose }: { report: RecalcReport | null; onClose: () => void }) {
  const csv = () => {
    if (!report) return;
    const rows = [["Job", "Date", "Supplier", "Posted", "New", "Difference"], ...report.postedDifferences.map((d) => [d.internalRef, d.jobDate, d.supplier, d.postedAmount, d.newAmount ?? "no price", d.difference ?? ""])];
    const blob = new Blob(["﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `posted-cost-differences-${localDateStr(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Dialog open={!!report} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Jobs re-costed</DialogTitle>
        </DialogHeader>
        {report && (
          <div className="space-y-3 text-sm">
            <p>
              {report.jobs} supplier job(s) checked: <b>{report.costed}</b> costed, {report.noPrice} with no price for their route / car type,{" "}
              {report.noPriceList} with no price list on their date, {report.postedUnchanged} posted and unchanged.
            </p>
            {report.postedDifferences.length > 0 ? (
              <>
                <p className="text-amber-600 dark:text-amber-400">
                  {report.postedDifferences.length} posted (settled) cost(s) were left as they are but would now be different — adjust them manually:
                </p>
                <div className="max-h-64 overflow-auto rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="text-right">Posted</TableHead>
                        <TableHead className="text-right">New</TableHead>
                        <TableHead className="text-right">Diff</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.postedDifferences.map((d) => (
                        <TableRow key={d.internalRef}>
                          <TableCell className="font-mono text-xs">{d.internalRef}</TableCell>
                          <TableCell className="text-xs">{d.jobDate}</TableCell>
                          <TableCell className="text-xs">{d.supplier}</TableCell>
                          <TableCell className="text-right text-xs">{d.postedAmount}</TableCell>
                          <TableCell className="text-right text-xs">{d.newAmount ?? "—"}</TableCell>
                          <TableCell className="text-right text-xs">{d.difference ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">No posted costs were affected.</p>
            )}
          </div>
        )}
        <DialogFooter>
          {report && report.postedDifferences.length > 0 && (
            <Button variant="outline" onClick={csv}>
              <Download className="mr-1.5 h-4 w-4" />
              Download CSV
            </Button>
          )}
          <Button onClick={onClose}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

