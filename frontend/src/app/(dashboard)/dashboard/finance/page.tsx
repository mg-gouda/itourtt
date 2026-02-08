"use client";

import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  DollarSign,
  Download,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { useT, useLocaleId } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { useSortable } from "@/hooks/use-sortable";
import { SortableHeader } from "@/components/sortable-header";
import { TableFilterBar } from "@/components/table-filter-bar";

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  status: string;
  agent?: { legalName: string } | null;
  customer?: { legalName: string } | null;
}

const statusColors: Record<string, string> = {
  DRAFT: "bg-zinc-500/20 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
  POSTED: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
  PAID: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  CANCELLED: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
};

export default function FinancePage() {
  const t = useT();
  const locale = useLocaleId();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filtered = useMemo(() => {
    let result = invoices;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          (inv.agent?.legalName && inv.agent.legalName.toLowerCase().includes(q)) ||
          (inv.customer?.legalName && inv.customer.legalName.toLowerCase().includes(q))
      );
    }
    if (statusFilter !== "ALL") {
      result = result.filter((inv) => inv.status === statusFilter);
    }
    return result;
  }, [invoices, search, statusFilter]);

  const { sortedData, sortKey, sortDir, onSort } = useSortable<Invoice>(filtered);

  useEffect(() => {
    async function fetch() {
      try {
        const { data } = await api.get("/finance/invoices");
        setInvoices(Array.isArray(data) ? data : data.data || []);
      } catch {
        // no invoices yet is ok
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  const exportOdoo = async (type: string) => {
    try {
      const { data } = await api.get(`/export/odoo/${type}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `odoo-${type}-${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${type} ${t("finance.exportDownloaded")}`);
    } catch {
      toast.error(t("finance.exportNotAvailable"));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("finance.title")}
        description={t("finance.description")}
      />

      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList className="bg-card border border-border">
          <TabsTrigger
            value="invoices"
            className="data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
          >
            {t("finance.invoices")}
          </TabsTrigger>
          <TabsTrigger
            value="exports"
            className="data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
          >
            {t("finance.odooExports")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <DollarSign className="mb-2 h-8 w-8" />
              <p>{t("finance.noInvoices")}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                {t("finance.invoicesGenerated")}
              </p>
            </div>
          ) : (
            <>
              <TableFilterBar
                search={search}
                onSearchChange={setSearch}
                placeholder={t("common.search") + "..."}
                statusOptions={[
                  { value: "ALL", label: t("common.all") },
                  { value: "DRAFT", label: "Draft" },
                  { value: "POSTED", label: "Posted" },
                  { value: "PAID", label: "Paid" },
                  { value: "CANCELLED", label: "Cancelled" },
                ]}
                statusValue={statusFilter}
                onStatusChange={setStatusFilter}
                statusPlaceholder={t("common.all")}
              />
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border bg-gray-700/75 dark:bg-gray-800/75">
                      <SortableHeader label={t("finance.invoiceNo")} sortKey="invoiceNumber" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                      <TableHead className="text-white text-xs">{t("jobs.agentCustomer")}</TableHead>
                      <SortableHeader label={t("common.date")} sortKey="invoiceDate" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                      <SortableHeader label={t("finance.dueDate")} sortKey="dueDate" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                      <TableHead className="text-white text-xs">{t("finance.currency")}</TableHead>
                      <SortableHeader label={t("common.total")} sortKey="total" currentKey={sortKey} currentDir={sortDir} onSort={onSort} className="text-right" />
                      <TableHead className="text-white text-xs">{t("common.status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedData.map((inv, idx) => (
                    <TableRow
                      key={inv.id}
                      className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                    >
                      <TableCell className="text-foreground font-mono text-xs">
                        {inv.invoiceNumber}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {inv.agent?.legalName || inv.customer?.legalName || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(inv.invoiceDate)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(inv.dueDate)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {inv.currency}
                      </TableCell>
                      <TableCell className="text-right text-foreground font-mono">
                        {inv.total.toLocaleString(locale, {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusColors[inv.status] || ""}
                        >
                          {inv.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="exports">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { key: "customers", label: t("finance.exportCustomers") },
              { key: "suppliers", label: t("finance.exportSuppliers") },
              { key: "invoices", label: t("finance.exportInvoices") },
              { key: "vendor-bills", label: t("finance.exportVendorBills") },
              { key: "payments", label: t("finance.exportPayments") },
              { key: "journals", label: t("finance.exportJournals") },
            ].map((exp) => (
              <Card
                key={exp.key}
                className="flex items-center justify-between border-border bg-card p-4"
              >
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {exp.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{t("finance.xlsxFormat")}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => exportOdoo(exp.key)}
                  className="gap-1 text-muted-foreground hover:text-foreground"
                >
                  <Download className="h-4 w-4" />
                  {t("common.export")}
                </Button>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
