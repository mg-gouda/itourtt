"use client";

import { useEffect, useState } from "react";
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
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

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
      toast.success(`${type} export downloaded`);
    } catch {
      toast.error(`Export not available yet`);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance"
        description="Invoices, payments, and Odoo exports"
      />

      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList className="bg-card border border-border">
          <TabsTrigger
            value="invoices"
            className="data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
          >
            Invoices
          </TabsTrigger>
          <TabsTrigger
            value="exports"
            className="data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
          >
            Odoo Exports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          <Card className="border-border bg-card">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : invoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <DollarSign className="mb-2 h-8 w-8" />
                <p>No invoices yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Invoices are generated from completed traffic jobs
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Invoice #</TableHead>
                    <TableHead className="text-muted-foreground">Agent / Customer</TableHead>
                    <TableHead className="text-muted-foreground">Date</TableHead>
                    <TableHead className="text-muted-foreground">Due Date</TableHead>
                    <TableHead className="text-muted-foreground">Currency</TableHead>
                    <TableHead className="text-muted-foreground text-right">
                      Total
                    </TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow
                      key={inv.id}
                      className="border-border hover:bg-accent"
                    >
                      <TableCell className="text-foreground font-mono text-xs">
                        {inv.invoiceNumber}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {inv.agent?.legalName || inv.customer?.legalName || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(inv.invoiceDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(inv.dueDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {inv.currency}
                      </TableCell>
                      <TableCell className="text-right text-foreground font-mono">
                        {inv.total.toLocaleString(undefined, {
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
            )}
          </Card>
        </TabsContent>

        <TabsContent value="exports">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { key: "customers", label: "Customers (res.partner)" },
              { key: "suppliers", label: "Suppliers (res.partner)" },
              { key: "invoices", label: "Customer Invoices (account.move)" },
              { key: "vendor-bills", label: "Vendor Bills (account.move)" },
              { key: "payments", label: "Payments (account.payment)" },
              { key: "journals", label: "Journal Entries" },
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
                    <p className="text-xs text-muted-foreground">XLSX format</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => exportOdoo(exp.key)}
                  className="gap-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
