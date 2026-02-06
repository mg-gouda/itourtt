import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import * as XLSX from 'xlsx';

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────
  // CUSTOMERS (Agent → res.partner)
  // ─────────────────────────────────────────────

  async exportCustomers(): Promise<Buffer> {
    const agents = await this.prisma.agent.findMany({
      where: { deletedAt: null },
      include: { creditTerms: true },
      orderBy: { legalName: 'asc' },
    });

    const rows = agents.map((a) => ({
      name: a.legalName,
      company_type: 'company',
      is_company: true,
      street: a.address || '',
      city: a.city || '',
      country_id: a.country || 'Egypt',
      phone: a.phone || '',
      email: a.email || '',
      vat: a.taxId || '',
      customer_rank: 1,
      supplier_rank: 0,
      property_payment_term_id: a.creditTerms
        ? `${a.creditTerms.creditDays} Days`
        : '',
      property_account_receivable_id: '120000',
      property_account_payable_id: '210000',
      ref: a.id,
    }));

    return this.createWorkbook(rows, 'res.partner');
  }

  // ─────────────────────────────────────────────
  // SUPPLIERS (Supplier → res.partner)
  // ─────────────────────────────────────────────

  async exportSuppliers(): Promise<Buffer> {
    const suppliers = await this.prisma.supplier.findMany({
      where: { deletedAt: null },
      orderBy: { legalName: 'asc' },
    });

    const rows = suppliers.map((s) => ({
      name: s.legalName,
      company_type: 'company',
      is_company: true,
      street: s.address || '',
      city: s.city || '',
      country_id: s.country || 'Egypt',
      phone: s.phone || '',
      email: s.email || '',
      vat: s.taxId || '',
      customer_rank: 0,
      supplier_rank: 1,
      property_account_receivable_id: '120000',
      property_account_payable_id: '210000',
      ref: s.id,
    }));

    return this.createWorkbook(rows, 'res.partner');
  }

  // ─────────────────────────────────────────────
  // CUSTOMER INVOICES (AgentInvoice → account.move out_invoice)
  // ─────────────────────────────────────────────

  async exportInvoices(): Promise<Buffer> {
    const invoices = await this.prisma.agentInvoice.findMany({
      where: { status: { not: 'CANCELLED' } },
      include: {
        agent: true,
        customer: true,
        lines: {
          include: {
            trafficJob: true,
          },
        },
      },
      orderBy: { invoiceDate: 'asc' },
    });

    const rows: Record<string, unknown>[] = [];

    for (const inv of invoices) {
      const partnerName = inv.agent?.legalName || inv.customer?.legalName || 'Unknown';
      for (const line of inv.lines) {
        rows.push({
          move_type: 'out_invoice',
          partner_id: partnerName,
          invoice_date: this.formatDate(inv.invoiceDate),
          invoice_date_due: this.formatDate(inv.dueDate),
          currency_id: inv.currency,
          journal_id: 'Customer Invoices',
          ref: inv.invoiceNumber,
          name: line.description,
          account_id: '400000',
          quantity: line.quantity,
          price_unit: Number(line.unitPrice),
          tax_ids: Number(line.taxRate) > 0 ? `VAT ${line.taxRate}%` : '',
          amount_currency: Number(line.lineTotal),
          external_reference: line.trafficJob?.internalRef || '',
        });
      }
    }

    return this.createWorkbook(rows, 'account.move');
  }

  // ─────────────────────────────────────────────
  // VENDOR BILLS (SupplierCost → account.move in_invoice)
  // ─────────────────────────────────────────────

  async exportVendorBills(): Promise<Buffer> {
    const costs = await this.prisma.supplierCost.findMany({
      include: {
        supplier: true,
        trafficJob: {
          include: {
            agent: true,
            fromZone: true,
            toZone: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const rows = costs.map((c) => {
      const job = c.trafficJob;
      const routeDesc = job.fromZone && job.toZone
        ? `${job.fromZone.name} → ${job.toZone.name}`
        : job.internalRef;

      return {
        move_type: 'in_invoice',
        partner_id: c.supplier.legalName,
        invoice_date: this.formatDate(c.createdAt),
        currency_id: c.currency,
        journal_id: 'Vendor Bills',
        ref: job.internalRef,
        name: `Transport: ${routeDesc} (${job.serviceType})`,
        account_id: '510000',
        quantity: 1,
        price_unit: Number(c.amount),
        tax_ids: '',
        amount_currency: Number(c.amount),
        external_reference: job.internalRef,
      };
    });

    return this.createWorkbook(rows, 'account.move');
  }

  // ─────────────────────────────────────────────
  // PAYMENTS (Payment → account.payment)
  // ─────────────────────────────────────────────

  async exportPayments(): Promise<Buffer> {
    const payments = await this.prisma.payment.findMany({
      include: {
        agentInvoice: {
          include: {
            agent: true,
            customer: true,
          },
        },
      },
      orderBy: { paymentDate: 'asc' },
    });

    const rows = payments.map((p) => ({
      payment_type: 'inbound',
      partner_type: 'customer',
      partner_id: p.agentInvoice.agent?.legalName || p.agentInvoice.customer?.legalName || 'Unknown',
      amount: Number(p.amount),
      currency_id: p.currency,
      journal_id: this.mapPaymentJournal(p.paymentMethod),
      date: this.formatDate(p.paymentDate),
      ref: p.agentInvoice.invoiceNumber,
      communication: p.reference || p.agentInvoice.invoiceNumber,
    }));

    return this.createWorkbook(rows, 'account.payment');
  }

  // ─────────────────────────────────────────────
  // JOURNAL ENTRIES
  // ─────────────────────────────────────────────

  async exportJournalEntries(): Promise<Buffer> {
    const entries = await this.prisma.journalEntry.findMany({
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
      orderBy: { entryDate: 'asc' },
    });

    const rows: Record<string, unknown>[] = [];

    for (const entry of entries) {
      for (const line of entry.lines) {
        rows.push({
          journal_id: this.mapJournalType(entry.journalType),
          date: this.formatDate(entry.entryDate),
          ref: entry.entryNumber,
          name: entry.description || '',
          account_id: line.account.code,
          debit: Number(line.debit),
          credit: Number(line.credit),
          currency_id: line.currency,
          amount_currency:
            Number(line.debit) > 0
              ? Number(line.debit)
              : -Number(line.credit),
        });
      }
    }

    return this.createWorkbook(rows, 'account.move.line');
  }

  // ─────────────────────────────────────────────
  // REP FEES REPORT
  // ─────────────────────────────────────────────

  async exportRepFees(date: string): Promise<Buffer> {
    const jobDate = new Date(date);

    const assignments = await this.prisma.trafficAssignment.findMany({
      where: {
        repId: { not: null },
        trafficJob: {
          jobDate,
          deletedAt: null,
        },
      },
      include: {
        rep: true,
        trafficJob: {
          include: {
            fromZone: true,
            toZone: true,
            flight: true,
            repFees: true,
          },
        },
      },
    });

    // Build summary rows aggregated by rep
    const repMap = new Map<
      string,
      { name: string; feePerFlight: number; flights: number; total: number }
    >();

    const detailRows: Record<string, unknown>[] = [];

    for (const a of assignments) {
      if (!a.rep) continue;
      const repId = a.repId!;
      const feePerFlight = Number(a.rep.feePerFlight);
      const isArr = a.trafficJob.serviceType === 'ARR';
      const existingFee = a.trafficJob.repFees.find((f) => f.repId === repId);
      const amount = existingFee
        ? Number(existingFee.amount)
        : isArr
          ? feePerFlight
          : 0;

      if (isArr) {
        const existing = repMap.get(repId);
        if (existing) {
          existing.flights++;
          existing.total += amount;
        } else {
          repMap.set(repId, {
            name: a.rep.name,
            feePerFlight,
            flights: 1,
            total: amount,
          });
        }
      }

      detailRows.push({
        'Rep Name': a.rep.name,
        'Service Type': a.trafficJob.serviceType,
        'Flight No': a.trafficJob.flight?.flightNo || '—',
        Carrier: a.trafficJob.flight?.carrier || '—',
        'Job Ref': a.trafficJob.internalRef,
        Pax: a.trafficJob.paxCount,
        Route:
          a.trafficJob.fromZone && a.trafficJob.toZone
            ? `${a.trafficJob.fromZone.name} → ${a.trafficJob.toZone.name}`
            : '—',
        Status: a.trafficJob.status,
        'Fee Amount': amount,
      });
    }

    const summaryRows = Array.from(repMap.values()).map((r) => ({
      'Rep Name': r.name,
      'Fee/Flight': r.feePerFlight,
      Flights: r.flights,
      Total: r.total,
    }));

    // Grand total row
    const grandTotal = summaryRows.reduce((sum, r) => sum + r.Total, 0);
    summaryRows.push({
      'Rep Name': 'GRAND TOTAL',
      'Fee/Flight': 0,
      Flights: summaryRows.reduce((sum, r) => sum + r.Flights, 0),
      Total: grandTotal,
    });

    // Create multi-sheet workbook
    const wb = XLSX.utils.book_new();

    const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
    this.autoSizeColumns(summaryWs, summaryRows);
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    if (detailRows.length > 0) {
      const detailWs = XLSX.utils.json_to_sheet(detailRows);
      this.autoSizeColumns(detailWs, detailRows);
      XLSX.utils.book_append_sheet(wb, detailWs, 'Details');
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.from(buf);
  }

  private autoSizeColumns(
    ws: XLSX.WorkSheet,
    data: Record<string, unknown>[],
  ) {
    if (data.length > 0) {
      const colWidths = Object.keys(data[0]).map((key) => {
        const maxLen = Math.max(
          key.length,
          ...data.map((row) => String(row[key] ?? '').length),
        );
        return { wch: Math.min(maxLen + 2, 40) };
      });
      ws['!cols'] = colWidths;
    }
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private mapPaymentJournal(method: string): string {
    switch (method) {
      case 'CASH':
        return 'Cash';
      case 'BANK_TRANSFER':
        return 'Bank';
      case 'CHECK':
        return 'Bank';
      default:
        return 'Cash';
    }
  }

  private mapJournalType(type: string): string {
    switch (type) {
      case 'SALE':
        return 'Customer Invoices';
      case 'PURCHASE':
        return 'Vendor Bills';
      case 'CASH':
        return 'Cash';
      case 'BANK':
        return 'Bank';
      case 'GENERAL':
        return 'Miscellaneous';
      default:
        return 'Miscellaneous';
    }
  }

  private createWorkbook(
    data: Record<string, unknown>[],
    sheetName: string,
  ): Buffer {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);

    // Auto-size columns
    if (data.length > 0) {
      const colWidths = Object.keys(data[0]).map((key) => {
        const maxLen = Math.max(
          key.length,
          ...data.map((row) => String(row[key] ?? '').length),
        );
        return { wch: Math.min(maxLen + 2, 40) };
      });
      ws['!cols'] = colWidths;
    }

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.from(buf);
  }
}
