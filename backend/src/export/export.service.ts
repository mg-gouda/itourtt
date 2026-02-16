import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import * as XLSX from 'xlsx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

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
  // COLLECTIONS EXPORT
  // ─────────────────────────────────────────────

  async exportCollections(status?: string, dateFrom?: string, dateTo?: string): Promise<Buffer> {
    const where: any = { collectionRequired: true };

    if (status === 'PENDING') {
      where.collectionCollected = false;
    } else if (status === 'COLLECTED') {
      where.collectionCollected = true;
      where.collectionLiquidatedAt = null;
    } else if (status === 'LIQUIDATED') {
      where.collectionLiquidatedAt = { not: null };
    }

    if (dateFrom || dateTo) {
      where.jobDate = {};
      if (dateFrom) where.jobDate.gte = new Date(dateFrom);
      if (dateTo) where.jobDate.lte = new Date(dateTo);
    }

    const jobs = await this.prisma.trafficJob.findMany({
      where,
      include: {
        agent: { select: { legalName: true } },
        customer: { select: { legalName: true } },
        assignment: { include: { driver: { select: { name: true } } } },
      },
      orderBy: { jobDate: 'desc' },
    });

    const rows = jobs.map((j) => {
      let collectionStatus = 'PENDING';
      if (j.collectionLiquidatedAt) collectionStatus = 'LIQUIDATED';
      else if (j.collectionCollected) collectionStatus = 'COLLECTED';

      return {
        job_reference: j.internalRef,
        job_date: this.formatDate(j.jobDate),
        partner_name: j.agent?.legalName || j.customer?.legalName || '',
        driver_name: j.assignment?.driver?.name || '',
        collection_amount: j.collectionAmount ? Number(j.collectionAmount) : 0,
        collection_currency: j.collectionCurrency || 'EGP',
        status: collectionStatus,
        receipt_no: j.collectionReceiptNo || '',
        collected_at: j.collectionCollectedAt ? this.formatDate(j.collectionCollectedAt) : '',
        liquidated_at: j.collectionLiquidatedAt ? this.formatDate(j.collectionLiquidatedAt) : '',
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    this.autoSizeColumns(ws, rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Collections');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
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

  // ─────────────────────────────────────────────
  // DISPATCH DAY EXPORT
  // ─────────────────────────────────────────────

  async exportDispatchDay(date: string): Promise<Buffer> {
    const jobDate = new Date(date);

    const baseInclude = {
      agent: true,
      customer: true,
      originAirport: true,
      originZone: true,
      originHotel: { include: { zone: true } },
      destinationAirport: true,
      destinationZone: true,
      destinationHotel: { include: { zone: true } },
      fromZone: true,
      toZone: true,
      flight: true,
      assignment: {
        include: {
          vehicle: { include: { vehicleType: true } },
          driver: true,
          rep: true,
        },
      },
    };

    const baseWhere = { jobDate, deletedAt: null };

    const [arrivals, departures, excursions] = await Promise.all([
      this.prisma.trafficJob.findMany({
        where: { ...baseWhere, serviceType: 'ARR' as any },
        include: baseInclude,
        orderBy: [{ flight: { arrivalTime: 'asc' } }, { createdAt: 'asc' }],
      }),
      this.prisma.trafficJob.findMany({
        where: { ...baseWhere, serviceType: 'DEP' as any },
        include: baseInclude,
        orderBy: [{ flight: { departureTime: 'asc' } }, { createdAt: 'asc' }],
      }),
      this.prisma.trafficJob.findMany({
        where: { ...baseWhere, serviceType: 'EXCURSION' as any },
        include: baseInclude,
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const mapJob = (job: any): Record<string, unknown> => {
      const origin =
        job.originAirport?.code ||
        job.originZone?.name ||
        job.originHotel?.name ||
        '';
      const destination =
        job.destinationAirport?.code ||
        job.destinationZone?.name ||
        job.destinationHotel?.name ||
        '';
      const fmtTime = (d: Date | string | null | undefined) => {
        if (!d) return '';
        const dt = new Date(d);
        return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
      };

      return {
        'Ref': job.internalRef,
        'Agent Ref': job.agentRef || '',
        'Channel': job.bookingChannel,
        'Status': job.status,
        'Agent / Customer':
          job.agent?.legalName || job.customer?.legalName || '',
        'Client Name': job.clientName || '',
        'Client Mobile': job.clientMobile || '',
        'Cust Rep Name': job.custRepName || '',
        'Cust Rep Mobile': job.custRepMobile || '',
        'Meeting Point': job.custRepMeetingPoint || '',
        'Meeting Time': fmtTime(job.custRepMeetingTime),
        'Origin': origin,
        'Destination': destination,
        'From Zone': job.fromZone?.name || '',
        'To Zone': job.toZone?.name || '',
        'Adults': job.adultCount,
        'Children': job.childCount,
        'Pax': job.paxCount,
        'Pick-Up Time': fmtTime(job.pickUpTime),
        'Flight No': job.flight?.flightNo || '',
        'Carrier': job.flight?.carrier || '',
        'Terminal': job.flight?.terminal || '',
        'Arrival Time': fmtTime(job.flight?.arrivalTime),
        'Departure Time': fmtTime(job.flight?.departureTime),
        'Vehicle': job.assignment?.vehicle?.plateNumber || '',
        'Vehicle Type': job.assignment?.vehicle?.vehicleType?.name || '',
        'Seat Capacity': job.assignment?.vehicle?.vehicleType?.seatCapacity ?? '',
        'Driver': job.assignment?.driver?.name || '',
        'Driver Mobile': job.assignment?.driver?.mobileNumber || '',
        'Rep': job.assignment?.rep?.name || '',
        'Rep Mobile': job.assignment?.rep?.mobileNumber || '',
        'Booster Seat': job.boosterSeat ? `Yes (${job.boosterSeatQty})` : 'No',
        'Baby Seat': job.babySeat ? `Yes (${job.babySeatQty})` : 'No',
        'Wheelchair': job.wheelChair ? `Yes (${job.wheelChairQty})` : 'No',
        'Print Sign': job.printSign ? 'Yes' : 'No',
        'Notes': job.notes || '',
      };
    };

    const wb = XLSX.utils.book_new();

    const addSheet = (name: string, jobs: any[]) => {
      const rows = jobs.map(mapJob);
      if (rows.length === 0) {
        // Add empty sheet with headers only
        const headers = Object.keys(mapJob({
          internalRef: '', bookingChannel: '', status: '',
          adultCount: '', childCount: '', paxCount: '',
          boosterSeat: false, boosterSeatQty: 0,
          babySeat: false, babySeatQty: 0,
          wheelChair: false, wheelChairQty: 0,
          printSign: false,
        }));
        const ws = XLSX.utils.aoa_to_sheet([headers]);
        XLSX.utils.book_append_sheet(wb, ws, name);
      } else {
        const ws = XLSX.utils.json_to_sheet(rows);
        this.autoSizeColumns(ws, rows);
        XLSX.utils.book_append_sheet(wb, ws, name);
      }
    };

    addSheet('Arrivals', arrivals);
    addSheet('Departures', departures);
    addSheet('Excursions', excursions);

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.from(buf);
  }

  // ─────────────────────────────────────────────
  // CLIENT SIGNS PDF
  // ─────────────────────────────────────────────

  async generateClientSigns(date: string): Promise<Buffer> {
    const jobDate = new Date(date);

    // Fetch company settings for logo
    const settings = await this.prisma.companySettings.findFirst();
    const logoUrl = settings?.logoUrl; // e.g. "/uploads/filename.jpg"

    // Fetch jobs with printSign=true for the given date
    const jobs = await this.prisma.trafficJob.findMany({
      where: {
        jobDate,
        printSign: true,
        clientName: { not: null },
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (jobs.length === 0) {
      throw new Error('NO_SIGN_JOBS');
    }

    const pdfDoc = await PDFDocument.create();

    // Load logo if available
    let logoImage: Awaited<ReturnType<typeof pdfDoc.embedJpg>> | null = null;
    if (logoUrl) {
      try {
        const logoPath = path.join(process.cwd(), logoUrl.replace(/^\//, ''));
        const logoBytes = fs.readFileSync(logoPath);
        const ext = logoUrl.toLowerCase();
        if (ext.endsWith('.png')) {
          logoImage = await pdfDoc.embedPng(logoBytes);
        } else {
          logoImage = await pdfDoc.embedJpg(logoBytes);
        }
      } catch {
        // Logo not found, continue without it
      }
    }

    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Landscape A4: 842 x 595 pt
    const pageWidth = 842;
    const pageHeight = 595;
    const margin = 30;

    for (const job of jobs) {
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      const clientName = job.clientName || '';

      // Draw border rectangle
      page.drawRectangle({
        x: margin,
        y: margin,
        width: pageWidth - 2 * margin,
        height: pageHeight - 2 * margin,
        borderColor: rgb(0, 0, 0),
        borderWidth: 2,
      });

      let currentY = pageHeight - margin - 20;

      // Draw logo centered at top — 90% of page width
      if (logoImage) {
        const logoDims = logoImage.scale(1);
        const maxLogoWidth = pageWidth * 0.9;
        const scale = maxLogoWidth / logoDims.width;
        const logoW = logoDims.width * scale;
        const logoH = logoDims.height * scale;
        const logoX = (pageWidth - logoW) / 2;
        currentY -= logoH;
        page.drawImage(logoImage, {
          x: logoX,
          y: currentY,
          width: logoW,
          height: logoH,
        });
        currentY -= 25;
      } else {
        currentY -= 60;
      }

      // Draw "Mr/Mrs" text below logo, left-aligned
      page.drawText('Mr/Mrs', {
        x: margin + 30,
        y: currentY,
        size: 18,
        font: helvetica,
        color: rgb(0.3, 0.3, 0.3),
      });

      currentY -= 30;

      // Draw client name in large bold text, centered
      // Auto-size font to fit within page width
      let fontSize = 72;
      const maxTextWidth = pageWidth - 2 * margin - 60;
      let textWidth = helveticaBold.widthOfTextAtSize(clientName, fontSize);
      while (textWidth > maxTextWidth && fontSize > 24) {
        fontSize -= 2;
        textWidth = helveticaBold.widthOfTextAtSize(clientName, fontSize);
      }

      // Center the name vertically in the remaining space
      const textX = (pageWidth - textWidth) / 2;
      const remainingHeight = currentY - margin;
      const textY = margin + remainingHeight / 2 - fontSize / 3;

      page.drawText(clientName, {
        x: textX,
        y: textY,
        size: fontSize,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
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
