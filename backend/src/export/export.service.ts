import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import * as XLSX from 'xlsx';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);
const { convertArabic } = _require('arabic-reshaper') as { convertArabic: (t: string) => string };
const bidi = _require('bidi-js') as (text: string, opts: Record<string, unknown>) => {
  getEmbeddingLevels: (text: string, opts: Record<string, unknown>) => unknown;
  getReorderedString: (text: string, levels: unknown) => string;
};

/** Returns true if the string contains any Arabic Unicode characters. */
function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/** Reshape + visually reorder Arabic text so pdf-lib renders it correctly.
 *  Passes through unchanged if the text contains no Arabic characters. */
function arabicize(text: string): string {
  if (!text || !hasArabic(text)) return text;
  const reshaped = convertArabic(text);
  const bidiObj = bidi(reshaped, { defaultParaLevel: 1 });
  return bidiObj.getReorderedString(
    reshaped,
    bidiObj.getEmbeddingLevels(reshaped, { defaultParaLevel: 1 }),
  );
}

/** Resolve the absolute paths to the bundled fonts. */
function fontPaths() {
  const base = path.join(process.cwd(), 'fonts');
  return {
    arabicRegular: path.join(base, 'Cairo-Regular.woff2'),
    arabicBold:    path.join(base, 'Cairo-Bold.woff2'),
    latinRegular:  path.join(base, 'DejaVuSans-Regular.ttf'),
    latinBold:     path.join(base, 'DejaVuSans-Bold.ttf'),
  };
}

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

  async exportRepFees(from: string, to: string): Promise<Buffer> {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const assignments = await this.prisma.trafficAssignment.findMany({
      where: {
        repId: { not: null },
        trafficJob: {
          jobDate: { gte: fromDate, lte: toDate },
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

    const [arrivals, departures, otherJobs] = await Promise.all([
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
        where: { ...baseWhere, serviceType: { in: ['DAY_TOUR', 'ONE_WAY_TRANSFER', 'TWO_WAY_TRANSFER'] as any } },
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
    addSheet('Other Services', otherJobs);

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
      include: { assignment: { include: { rep: true } } },
      orderBy: { createdAt: 'asc' },
    });

    if (jobs.length === 0) {
      throw new Error('NO_SIGN_JOBS');
    }

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const fp = fontPaths();
    const latinFont    = await pdfDoc.embedFont(fs.readFileSync(fp.latinRegular));
    const latinBold    = await pdfDoc.embedFont(fs.readFileSync(fp.latinBold));
    const arabicFont   = await pdfDoc.embedFont(fs.readFileSync(fp.arabicRegular));
    const arabicBold   = await pdfDoc.embedFont(fs.readFileSync(fp.arabicBold));

    /** Pick the right font: Cairo Arabic for Arabic text, DejaVu Sans otherwise. */
    const pickFont = (text: string, isBold = false) =>
      hasArabic(text) ? (isBold ? arabicBold : arabicFont) : (isBold ? latinBold : latinFont);

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
        font: latinFont,
        color: rgb(0.3, 0.3, 0.3),
      });

      currentY -= 30;

      // Draw client name in large bold text, centered
      // Auto-size font to fit within page width
      const displayName = arabicize(clientName);
      const nameFont = pickFont(clientName, true);
      let fontSize = 72;
      const maxTextWidth = pageWidth - 2 * margin - 60;
      let textWidth = nameFont.widthOfTextAtSize(displayName, fontSize);
      while (textWidth > maxTextWidth && fontSize > 24) {
        fontSize -= 2;
        textWidth = nameFont.widthOfTextAtSize(displayName, fontSize);
      }

      // Center the name vertically in the remaining space
      const textX = (pageWidth - textWidth) / 2;
      const remainingHeight = currentY - margin;
      const textY = margin + remainingHeight / 2 - fontSize / 3;

      page.drawText(displayName, {
        x: textX,
        y: textY,
        size: fontSize,
        font: nameFont,
        color: rgb(0, 0, 0),
      });

      // Draw rep name at bottom-right corner (size 10pt)
      const repName = job.assignment?.rep?.name;
      if (repName) {
        const repDisplay = arabicize(repName);
        const repFont = pickFont(repName);
        const repSize = 10;
        const repW = repFont.widthOfTextAtSize(repDisplay, repSize);
        page.drawText(repDisplay, {
          x: pageWidth - margin - 8 - repW,
          y: margin + 8,
          size: repSize,
          font: repFont,
          color: rgb(0.3, 0.3, 0.3),
        });
      }
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  // ─────────────────────────────────────────────
  // JOB EVIDENCE PDF (server-side, no browser needed)
  // ─────────────────────────────────────────────

  async generateJobEvidencePdf(jobId: string): Promise<Buffer> {
    /** Normalize and arabicize text for PDF rendering. */
    const s = (text: string | null | undefined): string => {
      if (!text) return '-';
      return arabicize(
        (text + '')
          .replace(/\u2192/g, '>').replace(/\u2014/g, '-').replace(/\u2013/g, '-')
          .replace(/\u2026/g, '...').replace(/[\u201C\u201D]/g, '"')
          .replace(/[\u2018\u2019]/g, "'"),
      );
    };

    const [settings, job] = await Promise.all([
      this.prisma.companySettings.findFirst(),
      this.prisma.trafficJob.findUnique({
        where: { id: jobId },
        include: {
          agent: true,
          assignment: { include: { vehicle: true, driver: true, rep: true } },
          flight: true,
          fromZone: true,
          toZone: true,
          originAirport: true,
          destinationAirport: true,
          originHotel: true,
          destinationHotel: true,
          noShowEvidence: { orderBy: { createdAt: 'asc' } },
          inPlaceEvidence: { orderBy: { createdAt: 'asc' } },
          completedEvidence: { orderBy: { createdAt: 'asc' } },
        },
      }),
    ]);

    if (!job) throw new NotFoundException('Job not found');

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const fp = fontPaths();
    const regular    = await pdfDoc.embedFont(fs.readFileSync(fp.latinRegular));
    const bold       = await pdfDoc.embedFont(fs.readFileSync(fp.latinBold));
    const arabicFont = await pdfDoc.embedFont(fs.readFileSync(fp.arabicRegular));
    const arabicBold = await pdfDoc.embedFont(fs.readFileSync(fp.arabicBold));

    /** Returns the correct font — Cairo Arabic if Arabic, DejaVu Sans otherwise. */
    const pickFont = (text: string, isBold = false) =>
      hasArabic(text) ? (isBold ? arabicBold : arabicFont) : (isBold ? bold : regular);

    const PW = 595, PH = 842, M = 36, CW = PW - 2 * M;
    const black = rgb(0, 0, 0);
    const grayC = rgb(0.5, 0.5, 0.5);
    const lightBg = rgb(0.95, 0.95, 0.95);
    const darkText = rgb(0.2, 0.2, 0.2);

    // Load company logo
    let logoImg: Awaited<ReturnType<typeof pdfDoc.embedJpg>> | null = null;
    if (settings?.logoUrl) {
      try {
        const lp = path.join(process.cwd(), settings.logoUrl.replace(/^\//, ''));
        const lb = fs.readFileSync(lp);
        logoImg = settings.logoUrl.toLowerCase().endsWith('.png')
          ? await pdfDoc.embedPng(lb)
          : await pdfDoc.embedJpg(lb);
      } catch { /* no logo — continue */ }
    }

    // Page cursor helpers
    let page = pdfDoc.addPage([PW, PH]);
    let y = PH - M;

    const newPage = () => { page = pdfDoc.addPage([PW, PH]); y = PH - M; };
    const need = (h: number) => { if (y - h < M + 24) newPage(); };

    const truncate = (text: string, font: typeof bold, size: number, maxW: number): string => {
      if (font.widthOfTextAtSize(text, size) <= maxW) return text;
      let t = text;
      while (t.length > 3 && font.widthOfTextAtSize(t + '...', size) > maxW) t = t.slice(0, -1);
      return t + '...';
    };

    // ── HEADER ──
    if (logoImg) {
      const d = logoImg.scale(1);
      const sc = Math.min(120 / d.width, 40 / d.height, 1);
      page.drawImage(logoImg, { x: M, y: y - d.height * sc, width: d.width * sc, height: d.height * sc });
    } else {
      page.drawText(s(settings?.companyName ?? 'iTour'), { x: M, y: y - 12, size: 11, font: bold, color: black });
    }

    const title = 'Job Evidence Report';
    const tw = bold.widthOfTextAtSize(title, 15);
    page.drawText(title, { x: (PW - tw) / 2, y: y - 18, size: 15, font: bold, color: black });

    const dateStr = new Date(job.jobDate).toLocaleDateString('en-GB');
    const dw = regular.widthOfTextAtSize(dateStr, 9);
    page.drawText(dateStr, { x: PW - M - dw, y: y - 12, size: 9, font: regular, color: grayC });

    y -= 52;
    page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 1, color: black });
    y -= 14;

    // ── SECTION HEADER ──
    const drawSectionHeader = (label: string) => {
      need(22);
      page.drawRectangle({ x: M, y: y - 16, width: CW, height: 16, color: lightBg });
      page.drawRectangle({ x: M, y: y - 16, width: 3, height: 16, color: darkText });
      page.drawText(label.toUpperCase(), { x: M + 8, y: y - 11, size: 7.5, font: bold, color: darkText });
      y -= 22;
    };

    // ── JOB DETAILS ──
    drawSectionHeader('Job Details');

    const origin = job.originAirport
      ? `${job.originAirport.name} (${job.originAirport.code})`
      : (job.originHotel?.name ?? job.fromZone?.name ?? '—');
    const dest = job.destinationAirport
      ? `${job.destinationAirport.name} (${job.destinationAirport.code})`
      : (job.destinationHotel?.name ?? job.toZone?.name ?? '—');

    const details: [string, string][] = [
      ['Job Ref',      s(job.internalRef)],
      ['Agent',        s(job.agent?.legalName)],
      ['Agent Ref',    s(job.agentRef)],
      ['Date',         dateStr],
      ['Service Type', s(job.serviceType)],
      ['Status',       s(job.status)],
      ['Pax Count',    String(job.paxCount)],
      ['Client',       s(job.clientName)],
      ['Route',        s(`${origin} > ${dest}`)],
      ['Vehicle',      s(job.assignment?.vehicle?.plateNumber)],
      ['Driver',       s(job.assignment?.driver?.name)],
      ['Rep',          s(job.assignment?.rep?.name)],
    ];
    if (job.flight) {
      details.push(['Flight', s(`${job.flight.carrier ?? ''} ${job.flight.flightNo}`.trim())]);
    }

    const ROW_H = 17;
    const COL_W = CW / 2;
    const KEY_W = 62;

    for (let i = 0; i < details.length; i += 2) {
      need(ROW_H + 2);
      const bg = Math.floor(i / 2) % 2 === 0 ? rgb(0.97, 0.97, 0.97) : rgb(1, 1, 1);
      page.drawRectangle({ x: M, y: y - ROW_H, width: CW, height: ROW_H, color: bg });

      for (let c = 0; c < 2; c++) {
        const idx = i + c;
        if (idx >= details.length) break;
        const [key, val] = details[idx];
        const xBase = M + c * COL_W;
        page.drawText(key + ':', {
          x: xBase + 4, y: y - ROW_H + 5,
          size: 7.5, font: regular, color: grayC,
        });
        const valFont = pickFont(val, true);
        page.drawText(truncate(val, valFont, 8, COL_W - KEY_W - 8), {
          x: xBase + KEY_W, y: y - ROW_H + 5,
          size: 8, font: valFont, color: black,
        });
      }
      y -= ROW_H;
    }
    y -= 10;

    // ── EVIDENCE SECTIONS ──
    const driverName = job.assignment?.driver?.name ?? null;
    const repName    = job.assignment?.rep?.name    ?? null;

    const repEvidence = [
      ...job.inPlaceEvidence.filter(e => repName    && e.submittedBy === repName),
      ...job.noShowEvidence,
    ];
    const driverEvidence = [
      ...job.inPlaceEvidence.filter(e => driverName && e.submittedBy === driverName),
      ...job.completedEvidence,
      // fallback: items not attributed to either party go under driver
      ...job.inPlaceEvidence.filter(
        e => (!repName || e.submittedBy !== repName) && (!driverName || e.submittedBy !== driverName),
      ),
    ];

    const IMG_COLS = 3;
    const IMG_GAP  = 6;
    const IMG_W    = (CW - IMG_GAP * (IMG_COLS - 1)) / IMG_COLS;
    const IMG_H    = 115;

    const embedImage = async (rawUrl: string) => {
      const imgPath = path.join(process.cwd(), rawUrl.replace(/^\//, ''));
      const imgBytes = fs.readFileSync(imgPath);
      return rawUrl.toLowerCase().includes('.png')
        ? pdfDoc.embedPng(imgBytes)
        : pdfDoc.embedJpg(imgBytes);
    };

    const drawEvidenceGroup = async (label: string, items: typeof repEvidence) => {
      if (!items.length) return;
      drawSectionHeader(label);

      for (const ev of items) {
        const metaDate = new Date(ev.createdAt).toLocaleString('en-GB', { timeZone: 'Africa/Cairo' });
        const rawMeta = `Submitted by: ${ev.submittedBy}   |   ${metaDate}`;
        const metaFont = pickFont(rawMeta);
        const meta = truncate(s(rawMeta), metaFont, 7.5, CW - 10);
        need(22);
        page.drawRectangle({ x: M, y: y - 18, width: CW, height: 18, color: lightBg });
        page.drawText(meta, { x: M + 5, y: y - 12.5, size: 7.5, font: metaFont, color: darkText });
        y -= 24;

        const imageUrls: string[] = ev.imageUrls ?? [];
        for (let i = 0; i < imageUrls.length; i += IMG_COLS) {
          need(IMG_H + IMG_GAP + 4);
          const row = imageUrls.slice(i, i + IMG_COLS);
          let rowH = 0;

          for (let c = 0; c < row.length; c++) {
            const rawUrl = row[c];
            const xBase  = M + c * (IMG_W + IMG_GAP);
            try {
              const embedded = await embedImage(rawUrl);
              const d  = embedded.scale(1);
              const sc = Math.min(IMG_W / d.width, IMG_H / d.height);
              const iw = d.width  * sc;
              const ih = d.height * sc;
              rowH = Math.max(rowH, ih);
              const ix = xBase + (IMG_W - iw) / 2;
              page.drawImage(embedded, { x: ix, y: y - ih, width: iw, height: ih });
              page.drawRectangle({
                x: ix - 1, y: y - ih - 1, width: iw + 2, height: ih + 2,
                borderColor: rgb(0.78, 0.78, 0.78), borderWidth: 0.5,
              });
            } catch {
              rowH = Math.max(rowH, IMG_H);
              page.drawRectangle({ x: xBase, y: y - IMG_H, width: IMG_W, height: IMG_H, color: rgb(0.9, 0.9, 0.9) });
              page.drawText('Image unavailable', { x: xBase + 4, y: y - IMG_H / 2, size: 8, font: regular, color: grayC });
            }
          }
          y -= (rowH + IMG_GAP);
        }
        y -= 6;
      }
    };

    await drawEvidenceGroup('Rep Evidence', repEvidence);
    await drawEvidenceGroup('Driver Evidence', driverEvidence);

    if (!repEvidence.length && !driverEvidence.length) {
      need(20);
      page.drawText('No evidence submitted for this job.', {
        x: M, y: y - 12, size: 10, font: regular, color: grayC,
      });
    }

    // ── FOOTER on every page ──
    const now       = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Cairo' });
    const compName  = s(settings?.companyName ?? 'iTour');
    const totalPgs  = pdfDoc.getPageCount();
    const footerY   = M + 4;

    for (let p = 0; p < totalPgs; p++) {
      const pg  = pdfDoc.getPage(p);
      const pgW = pg.getWidth();
      pg.drawLine({
        start: { x: M, y: footerY + 12 }, end: { x: pgW - M, y: footerY + 12 },
        thickness: 0.5, color: rgb(0.75, 0.75, 0.75),
      });
      pg.drawText(compName, { x: M, y: footerY, size: 7, font: regular, color: grayC });
      const fr = `Issued on ${s(now)}`;
      pg.drawText(fr, { x: pgW - M - regular.widthOfTextAtSize(fr, 7), y: footerY, size: 7, font: regular, color: grayC });
      const pn  = `Page ${p + 1} of ${totalPgs}`;
      const pnw = regular.widthOfTextAtSize(pn, 7);
      pg.drawText(pn, { x: (pgW - pnw) / 2, y: footerY, size: 7, font: regular, color: grayC });
    }

    return Buffer.from(await pdfDoc.save());
  }

  // ─────────────────────────────────────────────
  // DAILY DISPATCH REPORT EXPORT
  // ─────────────────────────────────────────────

  async exportDailyDispatchReport(date: string): Promise<Buffer> {
    const jobDate = new Date(date);

    const jobs = await this.prisma.trafficJob.findMany({
      where: { jobDate, deletedAt: null },
      include: {
        agent: true,
        customer: true,
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
      },
      orderBy: { createdAt: 'asc' },
    });

    const rows = jobs.map((job) => ({
      'Ref': job.internalRef,
      'Agent / Customer': job.agent?.legalName || job.customer?.legalName || '',
      'Service Type': job.serviceType,
      'Status': job.status,
      'Client Name': job.clientName || '',
      'Pax': job.paxCount,
      'From': job.fromZone?.name || '',
      'To': job.toZone?.name || '',
      'Flight No': job.flight?.flightNo || '',
      'Carrier': job.flight?.carrier || '',
      'Vehicle': job.assignment?.vehicle?.plateNumber || '',
      'Vehicle Type': job.assignment?.vehicle?.vehicleType?.name || '',
      'Driver': job.assignment?.driver?.name || '',
      'Rep': job.assignment?.rep?.name || '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    this.autoSizeColumns(ws, rows);
    XLSX.utils.book_append_sheet(wb, ws, `Dispatch ${date}`);
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  // ─────────────────────────────────────────────
  // DRIVER TRIP REPORT EXPORT
  // ─────────────────────────────────────────────

  async exportDriverTrips(from: string, to: string): Promise<Buffer> {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const assignments = await this.prisma.trafficAssignment.findMany({
      where: {
        driverId: { not: null },
        trafficJob: {
          jobDate: { gte: fromDate, lte: toDate },
          deletedAt: null,
        },
      },
      include: {
        driver: true,
        trafficJob: {
          include: {
            fromZone: true,
            toZone: true,
            agent: true,
          },
        },
      },
    });

    // Aggregate by driver for summary
    const driverMap = new Map<string, { name: string; mobile: string; trips: number; fees: number }>();

    const detailRows: Record<string, unknown>[] = [];

    for (const a of assignments) {
      if (!a.driver) continue;
      const existing = driverMap.get(a.driverId!);
      if (existing) {
        existing.trips++;
      } else {
        driverMap.set(a.driverId!, {
          name: a.driver.name,
          mobile: a.driver.mobileNumber,
          trips: 1,
          fees: 0,
        });
      }

      detailRows.push({
        'Driver': a.driver.name,
        'Job Date': this.formatDate(a.trafficJob.jobDate),
        'Service Type': a.trafficJob.serviceType,
        'Route': a.trafficJob.fromZone && a.trafficJob.toZone
          ? `${a.trafficJob.fromZone.name} → ${a.trafficJob.toZone.name}`
          : '—',
        'Agent': a.trafficJob.agent?.legalName || '—',
        'Ref': a.trafficJob.internalRef,
      });
    }

    // Fetch fees
    const fees = await this.prisma.driverTripFee.findMany({
      where: {
        trafficJob: {
          jobDate: { gte: fromDate, lte: toDate },
          deletedAt: null,
        },
      },
    });
    for (const fee of fees) {
      const d = driverMap.get(fee.driverId);
      if (d) d.fees += Number(fee.amount);
    }

    const summaryRows = Array.from(driverMap.values()).map((d) => ({
      'Driver': d.name,
      'Mobile': d.mobile,
      'Trips': d.trips,
      'Total Fees': d.fees,
    }));

    const wb = XLSX.utils.book_new();

    const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
    this.autoSizeColumns(summaryWs, summaryRows);
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    if (detailRows.length > 0) {
      const detailWs = XLSX.utils.json_to_sheet(detailRows);
      this.autoSizeColumns(detailWs, detailRows);
      XLSX.utils.book_append_sheet(wb, detailWs, 'Details');
    }

    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  // ─────────────────────────────────────────────
  // AGENT STATEMENT EXPORT
  // ─────────────────────────────────────────────

  async exportAgentStatement(agentId: string, from: string, to: string): Promise<Buffer> {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: { creditTerms: true },
    });

    const invoices = await this.prisma.agentInvoice.findMany({
      where: {
        agentId,
        invoiceDate: { gte: fromDate, lte: toDate },
      },
      include: { payments: true },
      orderBy: { invoiceDate: 'asc' },
    });

    const rows = invoices.map((inv) => {
      const paid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      return {
        'Invoice #': inv.invoiceNumber,
        'Date': this.formatDate(inv.invoiceDate),
        'Due Date': this.formatDate(inv.dueDate),
        'Currency': inv.currency,
        'Subtotal': Number(inv.subtotal),
        'Tax': Number(inv.taxAmount),
        'Total': Number(inv.total),
        'Paid': paid,
        'Balance': Number(inv.total) - paid,
        'Status': inv.status,
      };
    });

    // Add totals row
    const totalInvoiced = rows.reduce((sum, r) => sum + (r['Total'] as number), 0);
    const totalPaid = rows.reduce((sum, r) => sum + (r['Paid'] as number), 0);
    rows.push({
      'Invoice #': 'TOTALS',
      'Date': '',
      'Due Date': '',
      'Currency': '' as any,
      'Subtotal': rows.reduce((sum, r) => sum + (r['Subtotal'] as number), 0),
      'Tax': rows.reduce((sum, r) => sum + (r['Tax'] as number), 0),
      'Total': totalInvoiced,
      'Paid': totalPaid,
      'Balance': totalInvoiced - totalPaid,
      'Status': '' as any,
    });

    const wb = XLSX.utils.book_new();

    // Agent info sheet
    const infoRows = [
      { Field: 'Agent', Value: agent?.legalName || '' },
      { Field: 'Trade Name', Value: agent?.tradeName || '' },
      { Field: 'Period', Value: `${from} to ${to}` },
      { Field: 'Credit Limit', Value: agent?.creditTerms ? Number(agent.creditTerms.creditLimit) : 'N/A' },
      { Field: 'Credit Days', Value: agent?.creditTerms?.creditDays ?? 'N/A' },
      { Field: 'Total Invoiced', Value: totalInvoiced },
      { Field: 'Total Paid', Value: totalPaid },
      { Field: 'Outstanding', Value: totalInvoiced - totalPaid },
    ];
    const infoWs = XLSX.utils.json_to_sheet(infoRows);
    this.autoSizeColumns(infoWs, infoRows);
    XLSX.utils.book_append_sheet(wb, infoWs, 'Summary');

    const invoiceWs = XLSX.utils.json_to_sheet(rows);
    this.autoSizeColumns(invoiceWs, rows);
    XLSX.utils.book_append_sheet(wb, invoiceWs, 'Invoices');

    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  // ─────────────────────────────────────────────
  // REVENUE REPORT EXPORT
  // ─────────────────────────────────────────────

  async exportRevenue(from: string, to: string): Promise<Buffer> {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const invoices = await this.prisma.agentInvoice.findMany({
      where: {
        invoiceDate: { gte: fromDate, lte: toDate },
        status: { not: 'CANCELLED' as any },
      },
      include: {
        agent: true,
        customer: true,
        lines: { include: { trafficJob: true } },
      },
    });

    let totalRevenue = 0;
    const byAgent = new Map<string, { name: string; revenue: number; invoices: number; jobs: number }>();
    const byServiceType: Record<string, number> = {};

    for (const inv of invoices) {
      const invTotal = Number(inv.total);
      totalRevenue += invTotal;
      const partnerId = inv.agentId || inv.customerId || 'unknown';
      const partnerName = inv.agent?.legalName || inv.customer?.legalName || 'Unknown';
      const entry = byAgent.get(partnerId) || { name: partnerName, revenue: 0, invoices: 0, jobs: 0 };
      entry.revenue += invTotal;
      entry.invoices++;
      byAgent.set(partnerId, entry);

      for (const line of inv.lines) {
        if (line.trafficJob) {
          byServiceType[line.trafficJob.serviceType] = (byServiceType[line.trafficJob.serviceType] || 0) + Number(line.lineTotal);
          byAgent.get(partnerId)!.jobs++;
        }
      }
    }

    const [driverFees, repFees, supplierCosts] = await Promise.all([
      this.prisma.driverTripFee.aggregate({
        where: { trafficJob: { jobDate: { gte: fromDate, lte: toDate }, deletedAt: null } },
        _sum: { amount: true },
      }),
      this.prisma.repFee.aggregate({
        where: { trafficJob: { jobDate: { gte: fromDate, lte: toDate }, deletedAt: null } },
        _sum: { amount: true },
      }),
      this.prisma.supplierCost.aggregate({
        where: { trafficJob: { jobDate: { gte: fromDate, lte: toDate }, deletedAt: null } },
        _sum: { amount: true },
      }),
    ]);

    const totalDriverFees = Number(driverFees._sum.amount || 0);
    const totalRepFees = Number(repFees._sum.amount || 0);
    const totalSupplierCosts = Number(supplierCosts._sum.amount || 0);
    const totalCosts = totalDriverFees + totalRepFees + totalSupplierCosts;

    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryRows = [
      { Metric: 'Period', Value: `${from} to ${to}` },
      { Metric: 'Total Revenue', Value: totalRevenue },
      { Metric: 'Driver Fees', Value: totalDriverFees },
      { Metric: 'Rep Fees', Value: totalRepFees },
      { Metric: 'Supplier Costs', Value: totalSupplierCosts },
      { Metric: 'Total Costs', Value: totalCosts },
      { Metric: 'Gross Profit', Value: totalRevenue - totalCosts },
      { Metric: 'Profit Margin %', Value: totalRevenue > 0 ? Math.round(((totalRevenue - totalCosts) / totalRevenue) * 100) : 0 },
    ];
    const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
    this.autoSizeColumns(summaryWs, summaryRows);
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    // By Agent sheet
    const agentRows = Array.from(byAgent.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((a) => ({
        'Agent / Customer': a.name,
        'Revenue': a.revenue,
        'Invoices': a.invoices,
        'Jobs': a.jobs,
      }));
    if (agentRows.length > 0) {
      const agentWs = XLSX.utils.json_to_sheet(agentRows);
      this.autoSizeColumns(agentWs, agentRows);
      XLSX.utils.book_append_sheet(wb, agentWs, 'By Agent');
    }

    // By Service Type sheet
    const stRows = Object.entries(byServiceType).map(([type, revenue]) => ({
      'Service Type': type,
      'Revenue': revenue,
    }));
    if (stRows.length > 0) {
      const stWs = XLSX.utils.json_to_sheet(stRows);
      this.autoSizeColumns(stWs, stRows);
      XLSX.utils.book_append_sheet(wb, stWs, 'By Service Type');
    }

    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  // ─────────────────────────────────────────────
  // VEHICLE COMPLIANCE REPORT EXPORT
  // ─────────────────────────────────────────────

  async exportVehicleCompliance(): Promise<Buffer> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { deletedAt: null },
      include: {
        vehicleType: true,
        compliance: true,
      },
      orderBy: { plateNumber: 'asc' },
    });

    const today = new Date();
    const rows = vehicles.map((v) => {
      const c = v.compliance;
      const licenseStatus = c?.licenseExpiryDate
        ? new Date(c.licenseExpiryDate) < today ? 'EXPIRED' : 'VALID'
        : 'N/A';
      const insuranceStatus = c?.insuranceExpiryDate
        ? new Date(c.insuranceExpiryDate) < today ? 'EXPIRED' : 'VALID'
        : c?.hasInsurance ? 'VALID' : 'N/A';

      return {
        'Plate Number': v.plateNumber,
        'Vehicle Type': v.vehicleType?.name || '',
        'Ownership': v.ownership,
        'Active': v.isActive ? 'Yes' : 'No',
        'License Expiry': c?.licenseExpiryDate ? this.formatDate(c.licenseExpiryDate) : '',
        'License Status': licenseStatus,
        'Has Insurance': c?.hasInsurance ? 'Yes' : 'No',
        'Insurance Expiry': c?.insuranceExpiryDate ? this.formatDate(c.insuranceExpiryDate) : '',
        'Insurance Status': insuranceStatus,
        'Annual Payment': c?.annualPayment ? Number(c.annualPayment) : '',
        'GPS Subscription': c?.gpsSubscription ? Number(c.gpsSubscription) : '',
        'Tourism Fund': c?.tourismSupportFund ? Number(c.tourismSupportFund) : '',
        'Registration Fees': c?.registrationFees ? Number(c.registrationFees) : '',
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    this.autoSizeColumns(ws, rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Vehicle Compliance');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
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
