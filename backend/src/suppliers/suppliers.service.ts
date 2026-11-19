import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
import { CreateSupplierVehicleDto, UpdateSupplierVehicleDto } from './dto/create-vehicle.dto.js';
import { CreateSupplierDriverDto, UpdateSupplierDriverDto } from './dto/create-driver.dto.js';
import type { Currency, ServiceType, VehicleOwnership } from '../../generated/prisma/enums.js';
import { SELECTABLE_SERVICE_TYPES, SERVICE_TYPE_LABEL_PAIRS } from '../common/utils/service-type.util.js';

const VALID_SERVICE_TYPES = new Set<string>(SELECTABLE_SERVICE_TYPES);

const SERVICE_TYPE_LABELS: [string, string][] = SERVICE_TYPE_LABEL_PAIRS;

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Supplier CRUD ──────────────────────────────────────────

  async findAll(page: number, limit: number, isActive?: boolean) {
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { deletedAt: null, isActive: true };
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        orderBy: { legalName: 'asc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, email: true, name: true, role: true, isActive: true } },
        },
      }),
      this.prisma.supplier.count({ where }),
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

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id, deletedAt: null },
      include: {
        vehicles: {
          where: { deletedAt: null },
          include: { vehicleType: true },
          orderBy: { plateNumber: 'asc' },
        },
        priceList: { select: { id: true, name: true } },
        carTypes: {
          include: { vehicleType: true },
          orderBy: { vehicleType: { name: 'asc' } },
        },
      },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with id ${id} not found`);
    }

    return supplier;
  }

  async create(dto: CreateSupplierDto) {
    // New suppliers start on the given list or the one flagged "default for new" (List D), from today.
    const listId =
      dto.priceListId !== undefined
        ? dto.priceListId
        : (await this.prisma.supplierPriceList.findFirst({ where: { isDefaultForNew: true }, select: { id: true } }))?.id ?? null;
    const today = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })}T00:00:00Z`);
    return this.prisma.supplier.create({
      data: {
        ...(listId && { priceListAssignments: { create: { priceListId: listId, validFrom: today } } }),
        supplierType: (dto.supplierType as any) || 'COMPANY',
        legalName: dto.legalName,
        tradeName: dto.tradeName,
        taxId: dto.taxId,
        address: dto.address,
        city: dto.city,
        country: dto.country,
        phone: dto.phone,
        email: dto.email,
        mobileNumber: dto.mobileNumber,
        nationalIdImage: dto.nationalIdImage,
        priceListId: listId,
      },
    });
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with id ${id} not found`);
    }

    return this.prisma.supplier.update({
      where: { id },
      data: {
        ...(dto.supplierType !== undefined && { supplierType: dto.supplierType as any }),
        legalName: dto.legalName,
        tradeName: dto.tradeName,
        taxId: dto.taxId,
        address: dto.address,
        city: dto.city,
        country: dto.country,
        phone: dto.phone,
        email: dto.email,
        mobileNumber: dto.mobileNumber,
        nationalIdImage: dto.nationalIdImage,
        // The list is a dated history: change it with POST /supplier-price-lists/move (from a date).
      },
    });
  }

  async toggleStatus(id: string) {
    const supplier = await this.findOne(id);

    return this.prisma.supplier.update({
      where: { id },
      data: { isActive: !supplier.isActive },
    });
  }

  async delete(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with id ${id} not found`);
    }

    return this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async bulkDelete(ids: string[]) {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('No supplier IDs provided');
    }

    const result = await this.prisma.supplier.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    return { deleted: result.count };
  }

  // ─── Trip Prices ────────────────────────────────────────────

  // ─── Vehicles (Supplier-scoped) ─────────────────────────────

  async findVehicles(supplierId: string, page: number, limit: number, vehicleTypeId?: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with id ${supplierId} not found`);
    }

    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      supplierId,
      deletedAt: null,
      isActive: true,
    };

    if (vehicleTypeId) {
      where.vehicleTypeId = vehicleTypeId;
    }

    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        skip,
        take: limit,
        orderBy: { plateNumber: 'asc' },
        include: { vehicleType: true },
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

  async createVehicle(supplierId: string, dto: CreateSupplierVehicleDto) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with id ${supplierId} not found`);
    }

    const existing = await this.prisma.vehicle.findUnique({
      where: { plateNumber: dto.plateNumber },
    });

    if (existing) {
      throw new ConflictException(`A vehicle with plate number "${dto.plateNumber}" already exists`);
    }

    return this.prisma.vehicle.create({
      data: {
        supplierId,
        plateNumber: dto.plateNumber,
        vehicleTypeId: dto.vehicleTypeId,
        ownership: (dto.ownership as VehicleOwnership) ?? 'OWNED',
        color: dto.color,
        carBrand: dto.carBrand,
        carModel: dto.carModel,
        makeYear: dto.makeYear,
        luggageCapacity: dto.luggageCapacity,
      },
      include: { vehicleType: true },
    });
  }

  async updateVehicle(supplierId: string, vehicleId: string, dto: UpdateSupplierVehicleDto) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, supplierId, deletedAt: null },
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle with id ${vehicleId} not found for this supplier`);
    }

    if (dto.plateNumber && dto.plateNumber !== vehicle.plateNumber) {
      const existing = await this.prisma.vehicle.findUnique({
        where: { plateNumber: dto.plateNumber },
      });
      if (existing && existing.id !== vehicleId) {
        throw new ConflictException(`A vehicle with plate number "${dto.plateNumber}" already exists`);
      }
    }

    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        plateNumber: dto.plateNumber,
        vehicleTypeId: dto.vehicleTypeId,
        ownership: (dto.ownership as VehicleOwnership) ?? undefined,
        color: dto.color,
        carBrand: dto.carBrand,
        carModel: dto.carModel,
        makeYear: dto.makeYear,
        luggageCapacity: dto.luggageCapacity,
      },
      include: { vehicleType: true },
    });
  }

  async deleteVehicle(supplierId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, supplierId, deletedAt: null },
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle with id ${vehicleId} not found for this supplier`);
    }

    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { deletedAt: new Date() },
    });
  }

  async toggleVehicleStatus(supplierId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, supplierId, deletedAt: null },
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle with id ${vehicleId} not found for this supplier`);
    }

    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { isActive: !vehicle.isActive },
      include: { vehicleType: true },
    });
  }

  // ─── Drivers (Supplier-scoped) ─────────────────────────────

  async findDrivers(supplierId: string, page: number, limit: number) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with id ${supplierId} not found`);
    }

    const skip = (page - 1) * limit;

    const where = {
      supplierId,
      deletedAt: null,
      isActive: true,
    };

    const [data, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.driver.count({ where }),
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

  async createDriver(supplierId: string, dto: CreateSupplierDriverDto) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with id ${supplierId} not found`);
    }

    return this.prisma.driver.create({
      data: {
        supplierId,
        name: dto.name,
        mobileNumber: dto.mobileNumber,
        licenseNumber: dto.licenseNumber,
        licenseExpiryDate: dto.licenseExpiryDate ? new Date(dto.licenseExpiryDate) : null,
      },
    });
  }

  async updateDriver(supplierId: string, driverId: string, dto: UpdateSupplierDriverDto) {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, supplierId, deletedAt: null },
    });

    if (!driver) {
      throw new NotFoundException(`Driver with id ${driverId} not found for this supplier`);
    }

    return this.prisma.driver.update({
      where: { id: driverId },
      data: {
        name: dto.name,
        mobileNumber: dto.mobileNumber,
        licenseNumber: dto.licenseNumber,
        licenseExpiryDate: dto.licenseExpiryDate ? new Date(dto.licenseExpiryDate) : undefined,
      },
    });
  }

  async deleteDriver(supplierId: string, driverId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, supplierId, deletedAt: null },
    });

    if (!driver) {
      throw new NotFoundException(`Driver with id ${driverId} not found for this supplier`);
    }

    return this.prisma.driver.update({
      where: { id: driverId },
      data: { deletedAt: new Date() },
    });
  }

  async toggleDriverStatus(supplierId: string, driverId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, supplierId, deletedAt: null },
    });

    if (!driver) {
      throw new NotFoundException(`Driver with id ${driverId} not found for this supplier`);
    }

    return this.prisma.driver.update({
      where: { id: driverId },
      data: { isActive: !driver.isActive },
    });
  }

  // ─── Price List (Bulk Upsert Pattern) ───────────────────────

  // ─── Supplier Account ────────────────────────────────────────

  async createUserAccount(supplierId: string, dto: { password: string }) {
    const supplier = await this.findOne(supplierId);

    if (supplier.userId) {
      throw new ConflictException('This supplier already has a user account');
    }

    if (!supplier.phone) {
      throw new BadRequestException('Supplier must have a phone number to create an account');
    }

    const existingPhone = await this.prisma.user.findUnique({
      where: { phone: supplier.phone },
    });
    if (existingPhone) {
      throw new ConflictException('A user with this phone number already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const portalEmail = `supplier.${supplier.phone}@portal.itour.local`;

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: portalEmail,
          phone: supplier.phone!,
          passwordHash,
          name: supplier.legalName,
          role: 'SUPPLIER',
        },
      });

      await tx.supplier.update({
        where: { id: supplierId },
        data: { userId: user.id },
      });

      return {
        userId: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
      };
    });
  }

  async resetPassword(supplierId: string, newPassword: string) {
    const supplier = await this.findOne(supplierId);

    if (!supplier.userId) {
      throw new BadRequestException('This supplier does not have a user account');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: supplier.userId },
      data: {
        passwordHash,
        refreshToken: null,
        sessionId: null,
        sessionExpiresAt: null,
      },
    });

    return { success: true };
  }

  // ──────────────────────────────────────────────
  // EXPORT – all suppliers to Excel
  // ──────────────────────────────────────────────

  async exportToExcel(): Promise<Buffer> {
    const suppliers = await this.prisma.supplier.findMany({
      where: { deletedAt: null },
      orderBy: { legalName: 'asc' },
    });

    const rows = suppliers.map((s) => ({
      'Legal Name': s.legalName,
      'Trade Name': s.tradeName || '',
      'Tax ID': s.taxId || '',
      Address: s.address || '',
      City: s.city || '',
      Country: s.country || '',
      Phone: s.phone || '',
      Email: s.email || '',
      Status: s.isActive ? 'Active' : 'Inactive',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const colWidths = Object.keys(rows[0] || {}).map((key) => {
      const maxLen = Math.max(key.length, ...rows.map((r) => String((r as any)[key] || '').length));
      return { wch: Math.min(maxLen + 2, 40) };
    });
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Suppliers');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.from(buf);
  }

  async generateImportTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'iTour Transport';
    workbook.created = new Date();

    const instructionsSheet = workbook.addWorksheet('Instructions');
    instructionsSheet.columns = [{ width: 80 }];
    instructionsSheet.addRow(['Supplier Bulk Import Template']);
    instructionsSheet.addRow(['']);
    instructionsSheet.addRow(['Instructions:']);
    instructionsSheet.addRow(['1. Fill in supplier data in the "Suppliers" sheet']);
    instructionsSheet.addRow(['2. Legal Name is the only required field']);
    instructionsSheet.addRow(['3. Do not modify column headers']);
    instructionsSheet.addRow(['4. Save the file and upload it via the import button']);
    instructionsSheet.addRow(['']);
    instructionsSheet.addRow(['Notes:']);
    instructionsSheet.addRow(['- All imported suppliers will be set to Active status']);
    instructionsSheet.addRow(['- Maximum 500 suppliers per import']);
    instructionsSheet.getRow(1).font = { bold: true, size: 14 };
    instructionsSheet.getRow(3).font = { bold: true };
    instructionsSheet.getRow(9).font = { bold: true };

    const suppliersSheet = workbook.addWorksheet('Suppliers');
    suppliersSheet.columns = [
      { header: 'Legal Name', key: 'legalName', width: 30 },
      { header: 'Trade Name', key: 'tradeName', width: 25 },
      { header: 'Tax ID', key: 'taxId', width: 20 },
      { header: 'Address', key: 'address', width: 30 },
      { header: 'City', key: 'city', width: 20 },
      { header: 'Country', key: 'country', width: 20 },
      { header: 'Phone', key: 'phone', width: 20 },
      { header: 'Email', key: 'email', width: 25 },
    ];

    const headerRow = suppliersSheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    suppliersSheet.addRow({
      legalName: 'Cairo Fleet Services', tradeName: 'CFS', taxId: '111-222-333',
      address: '15 Fleet St', city: 'Cairo', country: 'Egypt',
      phone: '+20 2 1111 2222', email: 'info@cairofleet.com',
    });
    suppliersSheet.addRow({
      legalName: 'Luxor Transport Co', tradeName: '', taxId: '',
      address: '', city: 'Luxor', country: 'Egypt', phone: '', email: '',
    });

    for (let i = 2; i <= 3; i++) {
      suppliersSheet.getRow(i).font = { italic: true, color: { argb: 'FF999999' } };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async importFromExcel(fileBuffer: Buffer): Promise<{ imported: number; errors: string[] }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as ExcelJS.Buffer);

    const suppliersSheet = workbook.getWorksheet('Suppliers');
    if (!suppliersSheet) {
      throw new BadRequestException('Invalid template: "Suppliers" sheet not found');
    }

    const items: {
      legalName: string; tradeName?: string; taxId?: string; address?: string;
      city?: string; country?: string; phone?: string; email?: string;
    }[] = [];
    const errors: string[] = [];

    suppliersSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const legalName = String(row.getCell(1).value || '').trim();
      if (!legalName) return;

      // Skip sample rows
      if (legalName === 'Cairo Fleet Services' || legalName === 'Luxor Transport Co') return;

      const tradeName = String(row.getCell(2).value || '').trim();
      const taxId = String(row.getCell(3).value || '').trim();
      const address = String(row.getCell(4).value || '').trim();
      const city = String(row.getCell(5).value || '').trim();
      const country = String(row.getCell(6).value || '').trim();
      const phone = String(row.getCell(7).value || '').trim();
      const email = String(row.getCell(8).value || '').trim();

      items.push({
        legalName,
        ...(tradeName && { tradeName }),
        ...(taxId && { taxId }),
        ...(address && { address }),
        ...(city && { city }),
        ...(country && { country }),
        ...(phone && { phone }),
        ...(email && { email }),
      });
    });

    if (items.length === 0 && errors.length === 0) {
      throw new BadRequestException('No data found in the Suppliers sheet');
    }

    if (items.length > 500) {
      throw new BadRequestException('Maximum 500 suppliers per import.');
    }

    let imported = 0;
    for (const item of items) {
      try {
        await this.prisma.supplier.create({ data: item });
        imported++;
      } catch (err: any) {
        errors.push(`Failed "${item.legalName}": ${err.message}`);
      }
    }

    return { imported, errors };
  }

  // ─── Vehicle Excel Export ─────────────────────────────────────

  async exportVehiclesToExcel(supplierId: string): Promise<Buffer> {
    await this.findOne(supplierId);

    const vehicles = await this.prisma.vehicle.findMany({
      where: { supplierId, deletedAt: null },
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
      Status: v.isActive ? 'Active' : 'Inactive',
    }));

    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{}]);
    if (rows.length > 0) {
      const colWidths = Object.keys(rows[0]).map((key) => {
        const maxLen = Math.max(key.length, ...rows.map((r) => String((r as any)[key] || '').length));
        return { wch: Math.min(maxLen + 2, 40) };
      });
      ws['!cols'] = colWidths;
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vehicles');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.from(buf);
  }

  async generateVehicleImportTemplate(supplierId: string): Promise<Buffer> {
    await this.findOne(supplierId);

    const vehicleTypes = await this.prisma.vehicleType.findMany({ orderBy: { name: 'asc' } });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'iTour Transport';

    const sheet = workbook.addWorksheet('Vehicles');
    sheet.columns = [
      { header: 'Plate Number', key: 'plateNumber', width: 20 },
      { header: 'Vehicle Type', key: 'vehicleType', width: 20 },
      { header: 'Ownership', key: 'ownership', width: 15 },
      { header: 'Color', key: 'color', width: 15 },
      { header: 'Car Brand', key: 'carBrand', width: 20 },
      { header: 'Car Model', key: 'carModel', width: 20 },
      { header: 'Make Year', key: 'makeYear', width: 12 },
      { header: 'Luggage Capacity', key: 'luggageCapacity', width: 18 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

    if (vehicleTypes.length > 0) {
      const typeNames = vehicleTypes.map((vt) => vt.name).join(',');
      for (let i = 2; i <= 500; i++) {
        (sheet.getCell(`B${i}`) as any).dataValidation = {
          type: 'list', allowBlank: false, formulae: [`"${typeNames}"`],
        };
        (sheet.getCell(`C${i}`) as any).dataValidation = {
          type: 'list', allowBlank: true, formulae: ['"OWNED,RENTED,CONTRACTED"'],
        };
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async importVehiclesFromExcel(supplierId: string, fileBuffer: Buffer): Promise<{ imported: number; updated: number; errors: string[] }> {
    await this.findOne(supplierId);

    const vehicleTypes = await this.prisma.vehicleType.findMany();
    const typeNameMap = new Map(vehicleTypes.map((vt) => [vt.name.toLowerCase(), vt.id]));

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as ExcelJS.Buffer);

    const sheet = workbook.getWorksheet('Vehicles');
    if (!sheet) throw new BadRequestException('Invalid template: "Vehicles" sheet not found');

    const items: { plateNumber: string; vehicleTypeId: string; ownership?: string; color?: string; carBrand?: string; carModel?: string; makeYear?: number; luggageCapacity?: number }[] = [];
    const errors: string[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const plateNumber = String(row.getCell(1).value || '').trim();
      const vehicleTypeName = String(row.getCell(2).value || '').trim();
      if (!plateNumber && !vehicleTypeName) return;

      if (!plateNumber) { errors.push(`Row ${rowNumber}: Plate Number is required`); return; }
      if (!vehicleTypeName) { errors.push(`Row ${rowNumber}: Vehicle Type is required`); return; }

      const vehicleTypeId = typeNameMap.get(vehicleTypeName.toLowerCase());
      if (!vehicleTypeId) { errors.push(`Row ${rowNumber}: Unknown vehicle type "${vehicleTypeName}"`); return; }

      const ownership = String(row.getCell(3).value || '').trim().toUpperCase() || 'OWNED';
      if (!['OWNED', 'RENTED', 'CONTRACTED'].includes(ownership)) {
        errors.push(`Row ${rowNumber}: Invalid ownership "${ownership}"`); return;
      }

      items.push({
        plateNumber,
        vehicleTypeId,
        ownership,
        color: String(row.getCell(4).value || '').trim() || undefined,
        carBrand: String(row.getCell(5).value || '').trim() || undefined,
        carModel: String(row.getCell(6).value || '').trim() || undefined,
        makeYear: Number(row.getCell(7).value) || undefined,
        luggageCapacity: Number(row.getCell(8).value) || undefined,
      });
    });

    let imported = 0;
    let updated = 0;
    for (const item of items) {
      try {
        const existing = await this.prisma.vehicle.findUnique({ where: { plateNumber: item.plateNumber } });
        if (existing) {
          await this.prisma.vehicle.update({
            where: { id: existing.id },
            data: {
              supplierId,
              vehicleTypeId: item.vehicleTypeId,
              ownership: (item.ownership as VehicleOwnership) ?? existing.ownership,
              ...(item.color && { color: item.color }),
              ...(item.carBrand && { carBrand: item.carBrand }),
              ...(item.carModel && { carModel: item.carModel }),
              ...(item.makeYear !== undefined && { makeYear: item.makeYear }),
              ...(item.luggageCapacity !== undefined && { luggageCapacity: item.luggageCapacity }),
            },
          });
          updated++;
          continue;
        }

        await this.prisma.vehicle.create({
          data: {
            supplierId,
            plateNumber: item.plateNumber,
            vehicleTypeId: item.vehicleTypeId,
            ownership: (item.ownership as VehicleOwnership) ?? 'OWNED',
            color: item.color,
            carBrand: item.carBrand,
            carModel: item.carModel,
            makeYear: item.makeYear,
            luggageCapacity: item.luggageCapacity,
          },
        });
        imported++;
      } catch (err: any) {
        errors.push(`Failed "${item.plateNumber}": ${err.message}`);
      }
    }

    return { imported, updated, errors };
  }

  // ─── Driver Excel Export ──────────────────────────────────────

  async exportDriversToExcel(supplierId: string): Promise<Buffer> {
    await this.findOne(supplierId);

    const drivers = await this.prisma.driver.findMany({
      where: { supplierId, deletedAt: null },
      orderBy: { name: 'asc' },
    });

    const formatDate = (d: Date | null | undefined) => d ? new Date(d).toISOString().split('T')[0] : '';

    const rows = drivers.map((d) => ({
      Name: d.name,
      'Mobile Number': d.mobileNumber,
      'License Number': d.licenseNumber || '',
      'License Expiry': formatDate(d.licenseExpiryDate),
      Status: d.isActive ? 'Active' : 'Inactive',
    }));

    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{}]);
    if (rows.length > 0) {
      const colWidths = Object.keys(rows[0]).map((key) => {
        const maxLen = Math.max(key.length, ...rows.map((r) => String((r as any)[key] || '').length));
        return { wch: Math.min(maxLen + 2, 40) };
      });
      ws['!cols'] = colWidths;
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Drivers');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.from(buf);
  }

  async generateDriverImportTemplate(supplierId: string): Promise<Buffer> {
    await this.findOne(supplierId);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'iTour Transport';

    const sheet = workbook.addWorksheet('Drivers');
    sheet.columns = [
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Mobile Number', key: 'mobileNumber', width: 20 },
      { header: 'License Number', key: 'licenseNumber', width: 20 },
      { header: 'License Expiry (YYYY-MM-DD)', key: 'licenseExpiry', width: 28 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async importDriversFromExcel(supplierId: string, fileBuffer: Buffer): Promise<{ imported: number; errors: string[] }> {
    await this.findOne(supplierId);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as ExcelJS.Buffer);

    const sheet = workbook.getWorksheet('Drivers');
    if (!sheet) throw new BadRequestException('Invalid template: "Drivers" sheet not found');

    const items: { name: string; mobileNumber: string; licenseNumber?: string; licenseExpiryDate?: Date }[] = [];
    const errors: string[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const name = String(row.getCell(1).value || '').trim();
      const mobile = String(row.getCell(2).value || '').trim();
      if (!name && !mobile) return;

      if (!name) { errors.push(`Row ${rowNumber}: Name is required`); return; }
      if (!mobile) { errors.push(`Row ${rowNumber}: Mobile Number is required`); return; }

      const licenseNumber = String(row.getCell(3).value || '').trim() || undefined;
      const expiryRaw = String(row.getCell(4).value || '').trim();
      const licenseExpiryDate = expiryRaw ? new Date(expiryRaw) : undefined;

      items.push({ name, mobileNumber: mobile, licenseNumber, licenseExpiryDate });
    });

    let imported = 0;
    for (const item of items) {
      try {
        await this.prisma.driver.create({
          data: {
            supplierId,
            name: item.name,
            mobileNumber: item.mobileNumber,
            licenseNumber: item.licenseNumber,
            licenseExpiryDate: item.licenseExpiryDate ?? null,
          },
        });
        imported++;
      } catch (err: any) {
        errors.push(`Failed "${item.name}": ${err.message}`);
      }
    }

    return { imported, errors };
  }

  // ─── Price List Excel Export ───────────────────────────────────

  // ── Supplier Car Types ──

  async getCarTypes(supplierId: string) {
    const rows = await this.prisma.supplierCarType.findMany({
      where: { supplierId },
      include: { vehicleType: true },
      orderBy: { vehicleType: { name: 'asc' } },
    });
    return rows.map((r) => r.vehicleType);
  }

  async setCarTypes(supplierId: string, vehicleTypeIds: string[]) {
    // Verify supplier exists
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    // Replace all car types in a transaction
    await this.prisma.$transaction([
      this.prisma.supplierCarType.deleteMany({ where: { supplierId } }),
      ...vehicleTypeIds.map((vehicleTypeId) =>
        this.prisma.supplierCarType.create({
          data: { supplierId, vehicleTypeId },
        }),
      ),
    ]);

    return this.getCarTypes(supplierId);
  }
}
