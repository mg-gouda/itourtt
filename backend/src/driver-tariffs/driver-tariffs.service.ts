import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpsertTariffDto } from './dto/upsert-tariff.dto.js';
import type { Currency } from '../../generated/prisma/enums.js';

@Injectable()
export class DriverTariffsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: { fromZoneId?: string; toZoneId?: string; vehicleTypeId?: string }) {
    const where: Record<string, unknown> = {};
    if (filters.fromZoneId) where.fromZoneId = filters.fromZoneId;
    if (filters.toZoneId) where.toZoneId = filters.toZoneId;
    if (filters.vehicleTypeId) where.vehicleTypeId = filters.vehicleTypeId;

    return this.prisma.driverPriceTariff.findMany({
      where,
      include: {
        fromZone: { select: { id: true, name: true } },
        toZone: { select: { id: true, name: true } },
        vehicleType: { select: { id: true, name: true } },
        jobServiceType: { select: { id: true, name: true } },
      },
      orderBy: [
        { fromZone: { name: 'asc' } },
        { toZone: { name: 'asc' } },
        { vehicleType: { name: 'asc' } },
      ],
    });
  }

  async upsert(dto: UpsertTariffDto) {
    return this.prisma.driverPriceTariff.upsert({
      where: {
        fromZoneId_toZoneId_vehicleTypeId: {
          fromZoneId: dto.fromZoneId,
          toZoneId: dto.toZoneId,
          vehicleTypeId: dto.vehicleTypeId,
        },
      },
      update: {
        amount: dto.amount,
        currency: (dto.currency as Currency) ?? 'EGP',
        notes: dto.notes ?? null,
        isActive: dto.isActive ?? true,
        jobServiceTypeId: dto.jobServiceTypeId ?? null,
      },
      create: {
        fromZoneId: dto.fromZoneId,
        toZoneId: dto.toZoneId,
        vehicleTypeId: dto.vehicleTypeId,
        amount: dto.amount,
        currency: (dto.currency as Currency) ?? 'EGP',
        notes: dto.notes ?? null,
        isActive: dto.isActive ?? true,
        jobServiceTypeId: dto.jobServiceTypeId ?? null,
      },
      include: {
        fromZone: { select: { id: true, name: true } },
        toZone: { select: { id: true, name: true } },
        vehicleType: { select: { id: true, name: true } },
        jobServiceType: { select: { id: true, name: true } },
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.driverPriceTariff.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Driver tariff "${id}" not found`);
    }
    return this.prisma.driverPriceTariff.delete({ where: { id } });
  }

  /**
   * Look up a tariff for a given route + vehicle type.
   * Returns null if no matching tariff exists.
   */
  async lookup(fromZoneId: string, toZoneId: string, vehicleTypeId: string) {
    return this.prisma.driverPriceTariff.findFirst({
      where: { fromZoneId, toZoneId, vehicleTypeId, isActive: true },
    });
  }

  // ─────────────────────────────────────────────────────
  // EXCEL TEMPLATE – generate downloadable template
  // ─────────────────────────────────────────────────────

  async generateTemplate(): Promise<Buffer> {
    // Load reference data for the Lookup sheets
    const [zones, vehicleTypes, serviceTypes] = await Promise.all([
      this.prisma.zone.findMany({
        select: { id: true, name: true, city: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.vehicleType.findMany({
        select: { id: true, name: true },
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.jobServiceType.findMany({
        select: { id: true, name: true },
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'iTour Transport';
    workbook.created = new Date();

    // ── Instructions sheet ──
    const inst = workbook.addWorksheet('Instructions');
    inst.columns = [{ width: 90 }];
    const title = inst.addRow(['Driver Tariffs – Bulk Import Template']);
    title.font = { bold: true, size: 14 };
    inst.addRow(['']);
    const h1 = inst.addRow(['How to fill the "Tariffs" sheet:']);
    h1.font = { bold: true };
    inst.addRow(['1. From Zone Name  – exact zone name as listed in the "Zones" sheet']);
    inst.addRow(['2. To Zone Name    – exact zone name as listed in the "Zones" sheet']);
    inst.addRow(['3. Vehicle Type    – exact vehicle type name as listed in the "VehicleTypes" sheet']);
    inst.addRow(['4. Amount          – numeric, e.g. 150  (required)']);
    inst.addRow(['5. Currency        – EGP, USD, EUR, GBP, or SAR  (default: EGP)']);
    inst.addRow(['6. Service Type    – optional; exact name as listed in the "ServiceTypes" sheet']);
    inst.addRow(['7. Notes           – optional free text']);
    inst.addRow(['']);
    const h2 = inst.addRow(['Rules:']);
    h2.font = { bold: true };
    inst.addRow(['- Duplicate route+vehicleType rows will UPDATE the existing tariff (upsert)']);
    inst.addRow(['- Sample rows (grey) are ignored on import']);
    inst.addRow(['- Do not modify column headers']);
    inst.addRow(['- Maximum 1 000 rows per import']);

    // ── Tariffs data sheet ──
    const sheet = workbook.addWorksheet('Tariffs');
    sheet.columns = [
      { header: 'From Zone Name',  key: 'fromZone',     width: 25 },
      { header: 'To Zone Name',    key: 'toZone',       width: 25 },
      { header: 'Vehicle Type',    key: 'vehicleType',  width: 20 },
      { header: 'Amount',          key: 'amount',       width: 14 },
      { header: 'Currency',        key: 'currency',     width: 12 },
      { header: 'Service Type',    key: 'serviceType',  width: 25 },
      { header: 'Notes',           key: 'notes',        width: 30 },
    ];

    // Style header
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 22;

    // Sample rows
    const samples = [
      { fromZone: zones[0]?.name ?? 'Zone A', toZone: zones[1]?.name ?? 'Zone B', vehicleType: vehicleTypes[0]?.name ?? 'Sedan', amount: 150, currency: 'EGP', serviceType: serviceTypes[0]?.name ?? '', notes: '' },
      { fromZone: zones[1]?.name ?? 'Zone B', toZone: zones[0]?.name ?? 'Zone A', vehicleType: vehicleTypes[0]?.name ?? 'Sedan', amount: 150, currency: 'EGP', serviceType: '', notes: 'Example note' },
    ];
    for (const s of samples) {
      const r = sheet.addRow(s);
      r.font = { italic: true, color: { argb: 'FF999999' } };
    }

    // ── Zones lookup sheet ──
    const zonesSheet = workbook.addWorksheet('Zones');
    zonesSheet.columns = [
      { header: 'Zone Name', key: 'name', width: 30 },
      { header: 'City',      key: 'city', width: 25 },
    ];
    zonesSheet.getRow(1).font = { bold: true };
    for (const z of zones) {
      zonesSheet.addRow({ name: z.name, city: z.city?.name ?? '' });
    }

    // ── VehicleTypes lookup sheet ──
    const vtSheet = workbook.addWorksheet('VehicleTypes');
    vtSheet.columns = [{ header: 'Vehicle Type Name', key: 'name', width: 30 }];
    vtSheet.getRow(1).font = { bold: true };
    for (const vt of vehicleTypes) {
      vtSheet.addRow({ name: vt.name });
    }

    // ── ServiceTypes lookup sheet ──
    const stSheet = workbook.addWorksheet('ServiceTypes');
    stSheet.columns = [{ header: 'Service Type Name', key: 'name', width: 30 }];
    stSheet.getRow(1).font = { bold: true };
    for (const st of serviceTypes) {
      stSheet.addRow({ name: st.name });
    }

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  // ─────────────────────────────────────────────────────
  // EXCEL IMPORT – parse & upsert tariffs
  // ─────────────────────────────────────────────────────

  async importFromExcel(fileBuffer: Buffer): Promise<{ imported: number; errors: string[] }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as ExcelJS.Buffer);

    const sheet = workbook.getWorksheet('Tariffs');
    if (!sheet) {
      throw new BadRequestException('Invalid file: "Tariffs" sheet not found. Use the downloaded template.');
    }

    // Load lookup maps (name → id)
    const [zones, vehicleTypes, serviceTypes] = await Promise.all([
      this.prisma.zone.findMany({ select: { id: true, name: true } }),
      this.prisma.vehicleType.findMany({ select: { id: true, name: true } }),
      this.prisma.jobServiceType.findMany({ select: { id: true, name: true } }),
    ]);

    const zoneMap = new Map(zones.map((z) => [z.name.trim().toLowerCase(), z.id]));
    const vtMap   = new Map(vehicleTypes.map((v) => [v.name.trim().toLowerCase(), v.id]));
    const stMap   = new Map(serviceTypes.map((s) => [s.name.trim().toLowerCase(), s.id]));

    const validCurrencies = new Set(['EGP', 'USD', 'EUR', 'GBP', 'SAR']);
    const SAMPLE_FROM = [
      zones[0]?.name?.toLowerCase(),
      zones[1]?.name?.toLowerCase(),
    ].filter(Boolean);

    const rows: UpsertTariffDto[] = [];
    const errors: string[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header

      const fromZoneName   = String(row.getCell(1).value ?? '').trim();
      const toZoneName     = String(row.getCell(2).value ?? '').trim();
      const vehicleTypeName = String(row.getCell(3).value ?? '').trim();
      const amountRaw      = row.getCell(4).value;
      const currencyRaw    = String(row.getCell(5).value ?? 'EGP').trim().toUpperCase();
      const serviceTypeName = String(row.getCell(6).value ?? '').trim();
      const notes          = String(row.getCell(7).value ?? '').trim();

      if (!fromZoneName && !toZoneName && !vehicleTypeName) return; // blank row

      // Skip sample rows
      if (SAMPLE_FROM.includes(fromZoneName.toLowerCase()) && row.getCell(1).font?.italic) return;

      if (!fromZoneName) { errors.push(`Row ${rowNumber}: "From Zone Name" is required`); return; }
      if (!toZoneName)   { errors.push(`Row ${rowNumber}: "To Zone Name" is required`); return; }
      if (!vehicleTypeName) { errors.push(`Row ${rowNumber}: "Vehicle Type" is required`); return; }

      const fromZoneId = zoneMap.get(fromZoneName.toLowerCase());
      if (!fromZoneId) { errors.push(`Row ${rowNumber}: Zone "${fromZoneName}" not found`); return; }

      const toZoneId = zoneMap.get(toZoneName.toLowerCase());
      if (!toZoneId) { errors.push(`Row ${rowNumber}: Zone "${toZoneName}" not found`); return; }

      const vehicleTypeId = vtMap.get(vehicleTypeName.toLowerCase());
      if (!vehicleTypeId) { errors.push(`Row ${rowNumber}: Vehicle type "${vehicleTypeName}" not found`); return; }

      const amount = parseFloat(String(amountRaw ?? ''));
      if (isNaN(amount) || amount < 0) { errors.push(`Row ${rowNumber}: Invalid amount "${amountRaw}"`); return; }

      const currency = currencyRaw || 'EGP';
      if (!validCurrencies.has(currency)) { errors.push(`Row ${rowNumber}: Invalid currency "${currency}"`); return; }

      let jobServiceTypeId: string | undefined;
      if (serviceTypeName) {
        jobServiceTypeId = stMap.get(serviceTypeName.toLowerCase());
        if (!jobServiceTypeId) { errors.push(`Row ${rowNumber}: Service type "${serviceTypeName}" not found`); return; }
      }

      rows.push({ fromZoneId, toZoneId, vehicleTypeId, amount, currency, notes: notes || undefined, jobServiceTypeId });
    });

    if (rows.length === 0 && errors.length === 0) {
      throw new BadRequestException('No data rows found in the "Tariffs" sheet');
    }
    if (rows.length > 1000) {
      throw new BadRequestException('Maximum 1 000 rows per import. Please split into multiple files.');
    }

    let imported = 0;
    for (const dto of rows) {
      try {
        await this.upsert(dto);
        imported++;
      } catch (err: any) {
        errors.push(`Row for ${dto.fromZoneId}→${dto.toZoneId}: ${err.message}`);
      }
    }

    return { imported, errors };
  }
}
