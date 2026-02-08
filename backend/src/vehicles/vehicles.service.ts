import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateVehicleTypeDto } from './dto/create-vehicle-type.dto.js';
import { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import { UpsertVehicleComplianceDto } from './dto/upsert-vehicle-compliance.dto.js';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Vehicle Types ────────────────────────────────────────

  async findAllVehicleTypes() {
    return this.prisma.vehicleType.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createVehicleType(dto: CreateVehicleTypeDto) {
    return this.prisma.vehicleType.create({
      data: {
        name: dto.name,
        seatCapacity: dto.seatCapacity,
      },
    });
  }

  // ─── Vehicles ─────────────────────────────────────────────

  async findAllVehicles(page: number, limit: number, vehicleTypeId?: string) {
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { deletedAt: null };
    if (vehicleTypeId) {
      where.vehicleTypeId = vehicleTypeId;
    }

    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        orderBy: { plateNumber: 'asc' },
        skip,
        take: limit,
        include: { vehicleType: true, compliance: true },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findVehicleById(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id, deletedAt: null },
      include: { vehicleType: true, compliance: true },
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle with id ${id} not found`);
    }

    return vehicle;
  }

  async createVehicle(dto: CreateVehicleDto) {
    const vehicleType = await this.prisma.vehicleType.findUnique({
      where: { id: dto.vehicleTypeId },
    });
    if (!vehicleType) {
      throw new NotFoundException(`VehicleType with id ${dto.vehicleTypeId} not found`);
    }

    return this.prisma.vehicle.create({
      data: {
        plateNumber: dto.plateNumber,
        vehicleTypeId: dto.vehicleTypeId,
        ownership: dto.ownership,
        color: dto.color,
        carBrand: dto.carBrand,
        carModel: dto.carModel,
        makeYear: dto.makeYear,
        luggageCapacity: dto.luggageCapacity,
      },
      include: { vehicleType: true },
    });
  }

  async toggleStatus(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id, deletedAt: null },
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with id ${id} not found`);
    }

    return this.prisma.vehicle.update({
      where: { id },
      data: { isActive: !vehicle.isActive },
    });
  }

  async softDelete(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id, deletedAt: null },
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with id ${id} not found`);
    }

    return this.prisma.vehicle.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async updateVehicle(id: string, dto: Partial<CreateVehicleDto>) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id, deletedAt: null },
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with id ${id} not found`);
    }

    if (dto.vehicleTypeId) {
      const vehicleType = await this.prisma.vehicleType.findUnique({
        where: { id: dto.vehicleTypeId },
      });
      if (!vehicleType) {
        throw new NotFoundException(`VehicleType with id ${dto.vehicleTypeId} not found`);
      }
    }

    return this.prisma.vehicle.update({
      where: { id },
      data: {
        ...(dto.plateNumber !== undefined && { plateNumber: dto.plateNumber }),
        ...(dto.vehicleTypeId !== undefined && { vehicleTypeId: dto.vehicleTypeId }),
        ...(dto.ownership !== undefined && { ownership: dto.ownership }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.carBrand !== undefined && { carBrand: dto.carBrand }),
        ...(dto.carModel !== undefined && { carModel: dto.carModel }),
        ...(dto.makeYear !== undefined && { makeYear: dto.makeYear }),
        ...(dto.luggageCapacity !== undefined && { luggageCapacity: dto.luggageCapacity }),
      },
      include: { vehicleType: true },
    });
  }

  // ─── Export to Excel ──────────────────────────────────────

  async exportToExcel(): Promise<Buffer> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { deletedAt: null },
      orderBy: { plateNumber: 'asc' },
      include: { vehicleType: true },
    });

    const rows = vehicles.map((v) => ({
      'Plate Number': v.plateNumber,
      'Vehicle Type': v.vehicleType?.name || '',
      Ownership: v.ownership || '',
      Color: v.color || '',
      'Car Brand': v.carBrand || '',
      'Car Model': v.carModel || '',
      'Make Year': v.makeYear ?? '',
      'Luggage Capacity': v.luggageCapacity ?? '',
      Status: v.deletedAt ? 'Inactive' : 'Active',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    const colWidths = Object.keys(rows[0] || {}).map((key) => {
      const maxLen = Math.max(
        key.length,
        ...rows.map((r) => String((r as any)[key] || '').length),
      );
      return { wch: Math.min(maxLen + 2, 40) };
    });
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vehicles');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.from(buf);
  }

  // ─── Import Template ──────────────────────────────────────

  async generateImportTemplate(): Promise<Buffer> {
    const vehicleTypes = await this.prisma.vehicleType.findMany({
      orderBy: { name: 'asc' },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'iTour Transport';
    workbook.created = new Date();

    // Instructions sheet
    const instructionsSheet = workbook.addWorksheet('Instructions');
    instructionsSheet.columns = [{ width: 80 }];
    instructionsSheet.addRow(['Vehicle Bulk Import Template']);
    instructionsSheet.addRow(['']);
    instructionsSheet.addRow(['Instructions:']);
    instructionsSheet.addRow(['1. Fill in vehicle data in the "Vehicles" sheet']);
    instructionsSheet.addRow(['2. Plate Number and Vehicle Type are required fields']);
    instructionsSheet.addRow(['3. Vehicle Type must match one of the existing types exactly (see list below)']);
    instructionsSheet.addRow(['4. Ownership must be one of: OWNED, RENTED, CONTRACTED (defaults to OWNED)']);
    instructionsSheet.addRow(['5. Car Brand, Car Model, Make Year, and Luggage Capacity are optional']);
    instructionsSheet.addRow(['6. Do not modify column headers']);
    instructionsSheet.addRow(['7. Save the file and upload it via the import button']);
    instructionsSheet.addRow(['']);
    instructionsSheet.addRow(['Notes:']);
    instructionsSheet.addRow(['- Duplicate plate numbers will be skipped with an error']);
    instructionsSheet.addRow(['- Maximum 500 vehicles per import']);
    instructionsSheet.addRow(['']);
    instructionsSheet.addRow(['Available Vehicle Types:']);
    for (const vt of vehicleTypes) {
      instructionsSheet.addRow([`  - ${vt.name} (${vt.seatCapacity} seats)`]);
    }
    instructionsSheet.getRow(1).font = { bold: true, size: 14 };
    instructionsSheet.getRow(3).font = { bold: true };
    instructionsSheet.getRow(12).font = { bold: true };
    instructionsSheet.getRow(16).font = { bold: true };

    // Vehicles data sheet
    const vehiclesSheet = workbook.addWorksheet('Vehicles');
    vehiclesSheet.columns = [
      { header: 'Plate Number', key: 'plateNumber', width: 20 },
      { header: 'Vehicle Type', key: 'vehicleType', width: 20 },
      { header: 'Ownership', key: 'ownership', width: 15 },
      { header: 'Color', key: 'color', width: 15 },
      { header: 'Car Brand', key: 'carBrand', width: 20 },
      { header: 'Car Model', key: 'carModel', width: 20 },
      { header: 'Make Year', key: 'makeYear', width: 12 },
      { header: 'Luggage Capacity', key: 'luggageCapacity', width: 18 },
    ];

    // Style header row
    const headerRow = vehiclesSheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add sample rows
    const sampleType = vehicleTypes[0]?.name || 'Sedan';
    vehiclesSheet.addRow({
      plateNumber: 'ABC-1234',
      vehicleType: sampleType,
      ownership: 'OWNED',
      color: 'White',
      carBrand: 'Toyota',
      carModel: 'Hiace',
      makeYear: 2023,
      luggageCapacity: 6,
    });
    vehiclesSheet.addRow({
      plateNumber: 'XYZ-5678',
      vehicleType: sampleType,
      ownership: 'RENTED',
      color: 'Black',
      carBrand: 'Mercedes',
      carModel: 'Sprinter',
      makeYear: 2022,
      luggageCapacity: 8,
    });

    // Style sample rows in italic gray
    for (let i = 2; i <= 3; i++) {
      const row = vehiclesSheet.getRow(i);
      row.font = { italic: true, color: { argb: 'FF999999' } };
    }

    // Add data validation for Ownership column
    for (let i = 2; i <= 1000; i++) {
      (vehiclesSheet.getCell(`C${i}`) as any).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"OWNED,RENTED,CONTRACTED"'],
      };
    }

    // Add data validation for Color column
    const colorOptions = 'White,Black,Silver,Gray,Red,Blue,Green,Yellow,Orange,Brown,Beige,Gold,Maroon,Navy,Burgundy';
    for (let i = 2; i <= 1000; i++) {
      (vehiclesSheet.getCell(`D${i}`) as any).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${colorOptions}"`],
      };
    }

    // Add data validation for Vehicle Type column
    if (vehicleTypes.length > 0) {
      const typeNames = vehicleTypes.map((vt) => vt.name).join(',');
      for (let i = 2; i <= 1000; i++) {
        (vehiclesSheet.getCell(`B${i}`) as any).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`"${typeNames}"`],
        };
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ─── Bulk Import ──────────────────────────────────────────

  async importFromExcel(fileBuffer: Buffer): Promise<{ imported: number; errors: string[] }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as ExcelJS.Buffer);

    const vehiclesSheet = workbook.getWorksheet('Vehicles');
    if (!vehiclesSheet) {
      throw new BadRequestException('Invalid template: "Vehicles" sheet not found');
    }

    // Pre-load vehicle types for name → id lookup
    const vehicleTypes = await this.prisma.vehicleType.findMany();
    const typeNameMap = new Map(vehicleTypes.map((vt) => [vt.name.toLowerCase(), vt.id]));

    const items: {
      plateNumber: string;
      vehicleTypeId: string;
      ownership?: 'OWNED' | 'RENTED' | 'CONTRACTED';
      color?: string;
      carBrand?: string;
      carModel?: string;
      makeYear?: number;
      luggageCapacity?: number;
    }[] = [];
    const errors: string[] = [];

    vehiclesSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      const plateNumber = String(row.getCell(1).value || '').trim();
      const vehicleTypeName = String(row.getCell(2).value || '').trim();
      const ownershipRaw = String(row.getCell(3).value || '').trim().toUpperCase();
      const color = String(row.getCell(4).value || '').trim();
      const carBrand = String(row.getCell(5).value || '').trim();
      const carModel = String(row.getCell(6).value || '').trim();
      const makeYearRaw = row.getCell(7).value;
      const luggageCapRaw = row.getCell(8).value;

      // Skip empty rows
      if (!plateNumber && !vehicleTypeName) return;

      // Skip sample rows
      if (plateNumber === 'ABC-1234' || plateNumber === 'XYZ-5678') return;

      // Validate required fields
      if (!plateNumber) {
        errors.push(`Row ${rowNumber}: Plate Number is required`);
        return;
      }
      if (!vehicleTypeName) {
        errors.push(`Row ${rowNumber}: Vehicle Type is required`);
        return;
      }

      // Resolve vehicle type
      const vehicleTypeId = typeNameMap.get(vehicleTypeName.toLowerCase());
      if (!vehicleTypeId) {
        errors.push(`Row ${rowNumber}: Vehicle Type "${vehicleTypeName}" not found`);
        return;
      }

      // Validate ownership
      let ownership: 'OWNED' | 'RENTED' | 'CONTRACTED' | undefined;
      if (ownershipRaw && ['OWNED', 'RENTED', 'CONTRACTED'].includes(ownershipRaw)) {
        ownership = ownershipRaw as 'OWNED' | 'RENTED' | 'CONTRACTED';
      } else if (ownershipRaw && ownershipRaw.length > 0) {
        errors.push(`Row ${rowNumber}: Invalid ownership "${ownershipRaw}" (must be OWNED, RENTED, or CONTRACTED)`);
        return;
      }

      // Parse make year
      let makeYear: number | undefined;
      if (makeYearRaw !== null && makeYearRaw !== undefined && String(makeYearRaw).trim() !== '') {
        const parsed = parseInt(String(makeYearRaw), 10);
        if (isNaN(parsed) || parsed < 1900 || parsed > 2100) {
          errors.push(`Row ${rowNumber}: Invalid make year "${makeYearRaw}" (must be 1900-2100)`);
          return;
        }
        makeYear = parsed;
      }

      // Parse luggage capacity
      let luggageCapacity: number | undefined;
      if (luggageCapRaw !== null && luggageCapRaw !== undefined && String(luggageCapRaw).trim() !== '') {
        const parsed = parseInt(String(luggageCapRaw), 10);
        if (isNaN(parsed) || parsed < 0) {
          errors.push(`Row ${rowNumber}: Invalid luggage capacity "${luggageCapRaw}"`);
          return;
        }
        luggageCapacity = parsed;
      }

      items.push({
        plateNumber,
        vehicleTypeId,
        ...(ownership && { ownership }),
        ...(color && { color }),
        ...(carBrand && { carBrand }),
        ...(carModel && { carModel }),
        ...(makeYear !== undefined && { makeYear }),
        ...(luggageCapacity !== undefined && { luggageCapacity }),
      });
    });

    if (items.length === 0 && errors.length === 0) {
      throw new BadRequestException('No data found in the Vehicles sheet');
    }

    if (items.length > 500) {
      throw new BadRequestException('Maximum 500 vehicles per import. Please split into multiple files.');
    }

    // Check for duplicates within the import batch
    const platesSeen = new Set<string>();
    const deduped: typeof items = [];
    for (const item of items) {
      const key = item.plateNumber.toLowerCase();
      if (platesSeen.has(key)) {
        errors.push(`Duplicate plate "${item.plateNumber}" in import file — skipped`);
        continue;
      }
      platesSeen.add(key);
      deduped.push(item);
    }

    // Check for existing plate numbers in database
    const existingVehicles = await this.prisma.vehicle.findMany({
      where: {
        plateNumber: { in: deduped.map((v) => v.plateNumber) },
        deletedAt: null,
      },
      select: { plateNumber: true },
    });

    const existingPlates = new Set(existingVehicles.map((v) => v.plateNumber.toLowerCase()));
    const toCreate: typeof deduped = [];

    for (const item of deduped) {
      if (existingPlates.has(item.plateNumber.toLowerCase())) {
        errors.push(`Plate "${item.plateNumber}" already exists — skipped`);
        continue;
      }
      toCreate.push(item);
    }

    // Bulk create in a transaction
    if (toCreate.length > 0) {
      await this.prisma.$transaction(
        toCreate.map((v) =>
          this.prisma.vehicle.create({
            data: {
              plateNumber: v.plateNumber,
              vehicleTypeId: v.vehicleTypeId,
              ownership: v.ownership,
              color: v.color,
              carBrand: v.carBrand,
              carModel: v.carModel,
              makeYear: v.makeYear,
              luggageCapacity: v.luggageCapacity,
            },
          }),
        ),
      );
    }

    return { imported: toCreate.length, errors };
  }

  // ─── Vehicle Compliance ─────────────────────────────────

  async getCompliance(vehicleId: string) {
    await this.findVehicleById(vehicleId);
    return this.prisma.vehicleCompliance.findUnique({
      where: { vehicleId },
    });
  }

  async upsertCompliance(vehicleId: string, dto: UpsertVehicleComplianceDto) {
    await this.findVehicleById(vehicleId);

    const data: Record<string, unknown> = {};
    if (dto.licenseExpiryDate !== undefined) data.licenseExpiryDate = new Date(dto.licenseExpiryDate);
    if (dto.hasInsurance !== undefined) data.hasInsurance = dto.hasInsurance;
    if (dto.insuranceExpiryDate !== undefined) data.insuranceExpiryDate = new Date(dto.insuranceExpiryDate);
    if (dto.annualPayment !== undefined) data.annualPayment = dto.annualPayment;
    if (dto.annualPaymentCurrency !== undefined) data.annualPaymentCurrency = dto.annualPaymentCurrency;
    if (dto.gpsSubscription !== undefined) data.gpsSubscription = dto.gpsSubscription;
    if (dto.gpsSubscriptionCurrency !== undefined) data.gpsSubscriptionCurrency = dto.gpsSubscriptionCurrency;
    if (dto.tourismSupportFund !== undefined) data.tourismSupportFund = dto.tourismSupportFund;
    if (dto.tourismSupportFundCurrency !== undefined) data.tourismSupportFundCurrency = dto.tourismSupportFundCurrency;
    if (dto.temporaryPermitDate !== undefined) data.temporaryPermitDate = new Date(dto.temporaryPermitDate);
    if (dto.depositPayment !== undefined) data.depositPayment = dto.depositPayment;
    if (dto.depositPaymentCurrency !== undefined) data.depositPaymentCurrency = dto.depositPaymentCurrency;

    return this.prisma.vehicleCompliance.upsert({
      where: { vehicleId },
      create: { vehicleId, ...data },
      update: data,
    });
  }

  async updateComplianceFile(
    vehicleId: string,
    field: 'licenseCopyUrl' | 'insuranceDocUrl',
    url: string,
  ) {
    await this.findVehicleById(vehicleId);
    return this.prisma.vehicleCompliance.upsert({
      where: { vehicleId },
      create: { vehicleId, [field]: url },
      update: { [field]: url },
    });
  }

  async getComplianceReport() {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { deletedAt: null },
      include: { vehicleType: true, compliance: true },
      orderBy: { plateNumber: 'asc' },
    });

    return vehicles.map((v) => {
      const c = v.compliance;
      const permitExpiry = c?.temporaryPermitDate
        ? new Date(new Date(c.temporaryPermitDate).setMonth(new Date(c.temporaryPermitDate).getMonth() + 3))
        : null;
      const annual = c?.annualPayment ? Number(c.annualPayment) : null;
      const deposit = c?.depositPayment ? Number(c.depositPayment) : null;

      return {
        id: v.id,
        plateNumber: v.plateNumber,
        vehicleType: v.vehicleType?.name,
        ownership: v.ownership,
        isActive: v.isActive,
        licenseExpiryDate: c?.licenseExpiryDate,
        hasInsurance: c?.hasInsurance ?? false,
        insuranceExpiryDate: c?.insuranceExpiryDate,
        gpsSubscription: c?.gpsSubscription ? Number(c.gpsSubscription) : null,
        gpsSubscriptionCurrency: c?.gpsSubscriptionCurrency,
        tourismSupportFund: c?.tourismSupportFund ? Number(c.tourismSupportFund) : null,
        tourismSupportFundCurrency: c?.tourismSupportFundCurrency,
        temporaryPermitDate: c?.temporaryPermitDate,
        temporaryPermitExpiryDate: permitExpiry,
        annualPayment: annual,
        annualPaymentCurrency: c?.annualPaymentCurrency,
        depositPayment: deposit,
        depositPaymentCurrency: c?.depositPaymentCurrency,
        balanceRemaining: annual != null && deposit != null ? annual - deposit : null,
      };
    });
  }
}
