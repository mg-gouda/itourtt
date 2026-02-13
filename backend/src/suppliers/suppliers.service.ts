import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
import { CreateTripPriceDto } from './dto/create-trip-price.dto.js';
import { CreateSupplierVehicleDto, UpdateSupplierVehicleDto } from './dto/create-vehicle.dto.js';
import { CreateSupplierDriverDto, UpdateSupplierDriverDto } from './dto/create-driver.dto.js';
import { BulkPriceListDto, PriceItemDto } from './dto/supplier-price-list.dto.js';
import type { Currency, ServiceType, VehicleOwnership } from '../../generated/prisma/enums.js';

const VALID_SERVICE_TYPES = new Set([
  'ARR', 'DEP', 'EXCURSION', 'ROUND_TRIP', 'ONE_WAY_GOING', 'ONE_WAY_RETURN',
  'OVER_DAY', 'TRANSFER', 'CITY_TOUR', 'COLLECTING_ONE_WAY',
  'COLLECTING_ROUND_TRIP', 'EXPRESS_SHOPPING',
]);

const SERVICE_TYPE_LABELS: [string, string][] = [
  ['ARR', 'Airport Arrival'],
  ['DEP', 'Airport Departure'],
  ['EXCURSION', 'Excursion'],
  ['ROUND_TRIP', 'Round Trip (2-Way)'],
  ['ONE_WAY_GOING', 'One Way Going'],
  ['ONE_WAY_RETURN', 'One Way Return'],
  ['OVER_DAY', 'Over Day Trip'],
  ['TRANSFER', 'Long Distance Transfer'],
  ['CITY_TOUR', 'City Tour'],
  ['COLLECTING_ONE_WAY', 'Collecting One Way'],
  ['COLLECTING_ROUND_TRIP', 'Collecting Round Trip'],
  ['EXPRESS_SHOPPING', 'Express Shopping'],
];

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Supplier CRUD ──────────────────────────────────────────

  async findAll(page: number, limit: number, isActive?: boolean) {
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { deletedAt: null };
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
        tripPrices: {
          orderBy: { effectiveFrom: 'desc' },
          include: {
            fromZone: true,
            toZone: true,
            vehicleType: true,
          },
        },
      },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with id ${id} not found`);
    }

    return supplier;
  }

  async create(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({
      data: {
        legalName: dto.legalName,
        tradeName: dto.tradeName,
        taxId: dto.taxId,
        address: dto.address,
        city: dto.city,
        country: dto.country,
        phone: dto.phone,
        email: dto.email,
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
        legalName: dto.legalName,
        tradeName: dto.tradeName,
        taxId: dto.taxId,
        address: dto.address,
        city: dto.city,
        country: dto.country,
        phone: dto.phone,
        email: dto.email,
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

  // ─── Trip Prices ────────────────────────────────────────────

  async findTripPrices(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with id ${supplierId} not found`);
    }

    return this.prisma.supplierTripPrice.findMany({
      where: { supplierId },
      orderBy: [
        { serviceType: 'asc' },
        { effectiveFrom: 'desc' },
      ],
      include: {
        fromZone: true,
        toZone: true,
        vehicleType: true,
      },
    });
  }

  async createTripPrice(supplierId: string, dto: CreateTripPriceDto) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with id ${supplierId} not found`);
    }

    return this.prisma.supplierTripPrice.create({
      data: {
        supplierId,
        serviceType: ((dto as unknown as Record<string, unknown>).serviceType as ServiceType) ?? 'ARR',
        fromZoneId: dto.fromZoneId,
        toZoneId: dto.toZoneId,
        vehicleTypeId: dto.vehicleTypeId,
        price: dto.price,
        driverTip: ((dto as unknown as Record<string, unknown>).driverTip as number) ?? 0,
        currency: (dto.currency as Currency) ?? undefined,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      },
      include: {
        fromZone: true,
        toZone: true,
        vehicleType: true,
      },
    });
  }

  async updateTripPrice(priceId: string, dto: CreateTripPriceDto) {
    const tripPrice = await this.prisma.supplierTripPrice.findUnique({
      where: { id: priceId },
    });

    if (!tripPrice) {
      throw new NotFoundException(`Trip price with id ${priceId} not found`);
    }

    return this.prisma.supplierTripPrice.update({
      where: { id: priceId },
      data: {
        serviceType: ((dto as unknown as Record<string, unknown>).serviceType as ServiceType) ?? undefined,
        fromZoneId: dto.fromZoneId,
        toZoneId: dto.toZoneId,
        vehicleTypeId: dto.vehicleTypeId,
        price: dto.price,
        driverTip: ((dto as unknown as Record<string, unknown>).driverTip as number) ?? undefined,
        currency: (dto.currency as Currency) ?? undefined,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
      },
      include: {
        fromZone: true,
        toZone: true,
        vehicleType: true,
      },
    });
  }

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

  async getPriceList(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with id ${supplierId} not found`);
    }

    return this.prisma.supplierTripPrice.findMany({
      where: { supplierId },
      include: {
        fromZone: { select: { id: true, name: true } },
        toZone: { select: { id: true, name: true } },
        vehicleType: { select: { id: true, name: true, seatCapacity: true } },
      },
      orderBy: [
        { serviceType: 'asc' },
        { fromZone: { name: 'asc' } },
        { toZone: { name: 'asc' } },
        { vehicleType: { seatCapacity: 'asc' } },
      ],
    });
  }

  async upsertPriceItems(supplierId: string, dto: BulkPriceListDto) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with id ${supplierId} not found`);
    }

    const results = await this.prisma.$transaction(
      dto.items.map((item: PriceItemDto) =>
        this.prisma.supplierTripPrice.upsert({
          where: {
            supplierId_serviceType_fromZoneId_toZoneId_vehicleTypeId: {
              supplierId,
              serviceType: item.serviceType as ServiceType,
              fromZoneId: item.fromZoneId,
              toZoneId: item.toZoneId,
              vehicleTypeId: item.vehicleTypeId,
            },
          },
          create: {
            supplierId,
            serviceType: item.serviceType as ServiceType,
            fromZoneId: item.fromZoneId,
            toZoneId: item.toZoneId,
            vehicleTypeId: item.vehicleTypeId,
            price: item.price,
            driverTip: item.driverTip,
            effectiveFrom: item.effectiveFrom ? new Date(item.effectiveFrom) : null,
            effectiveTo: item.effectiveTo ? new Date(item.effectiveTo) : null,
          },
          update: {
            price: item.price,
            driverTip: item.driverTip,
            effectiveFrom: item.effectiveFrom ? new Date(item.effectiveFrom) : null,
            effectiveTo: item.effectiveTo ? new Date(item.effectiveTo) : null,
          },
        }),
      ),
    );

    return results;
  }

  async deletePriceItem(supplierId: string, priceItemId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId, deletedAt: null },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with id ${supplierId} not found`);
    }

    const priceItem = await this.prisma.supplierTripPrice.findFirst({
      where: { id: priceItemId, supplierId },
    });

    if (!priceItem) {
      throw new NotFoundException(`Price item with id "${priceItemId}" not found for this supplier`);
    }

    return this.prisma.supplierTripPrice.delete({
      where: { id: priceItemId },
    });
  }

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
      data: { passwordHash, refreshToken: null },
    });

    return { success: true };
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

  async importVehiclesFromExcel(supplierId: string, fileBuffer: Buffer): Promise<{ imported: number; errors: string[] }> {
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
    for (const item of items) {
      try {
        const existing = await this.prisma.vehicle.findUnique({ where: { plateNumber: item.plateNumber } });
        if (existing) { errors.push(`Skipped "${item.plateNumber}": plate number already exists`); continue; }

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

    return { imported, errors };
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

  async exportPriceListToExcel(supplierId: string): Promise<Buffer> {
    const prices = await this.getPriceList(supplierId);

    const rows = prices.map((p: any) => ({
      'Service Type': p.serviceType,
      'From Zone': p.fromZone?.name || '',
      'To Zone': p.toZone?.name || '',
      'Vehicle Type': p.vehicleType?.name || '',
      Price: Number(p.price),
      'Driver Tip': Number(p.driverTip),
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
    XLSX.utils.book_append_sheet(wb, ws, 'Price List');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.from(buf);
  }

  async generatePriceListTemplate(supplierId: string): Promise<Buffer> {
    await this.findOne(supplierId);

    const [zones, vehicleTypes] = await Promise.all([
      this.prisma.zone.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.vehicleType.findMany({ where: { isActive: true }, select: { id: true, name: true, seatCapacity: true }, orderBy: { seatCapacity: 'asc' } }),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'iTour Transport';

    const priceSheet = workbook.addWorksheet('Price List');
    priceSheet.columns = [
      { header: 'Service Type', key: 'serviceType', width: 25 },
      { header: 'From Zone', key: 'fromZone', width: 25 },
      { header: 'To Zone', key: 'toZone', width: 25 },
      { header: 'Vehicle Type', key: 'vehicleType', width: 20 },
      { header: 'Price', key: 'price', width: 15 },
      { header: 'Driver Tip', key: 'driverTip', width: 15 },
    ];

    priceSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    priceSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

    // Reference sheets
    const zonesSheet = workbook.addWorksheet('Zones');
    zonesSheet.columns = [{ header: 'Zone Name', key: 'name', width: 30 }];
    zonesSheet.getRow(1).font = { bold: true };
    zones.forEach((z) => zonesSheet.addRow({ name: z.name }));

    const vtSheet = workbook.addWorksheet('Vehicle Types');
    vtSheet.columns = [{ header: 'Vehicle Type', key: 'name', width: 25 }, { header: 'Seats', key: 'seats', width: 10 }];
    vtSheet.getRow(1).font = { bold: true };
    vehicleTypes.forEach((vt) => vtSheet.addRow({ name: vt.name, seats: vt.seatCapacity }));

    const stSheet = workbook.addWorksheet('Service Types');
    stSheet.columns = [{ header: 'Code', key: 'code', width: 25 }, { header: 'Description', key: 'desc', width: 35 }];
    stSheet.getRow(1).font = { bold: true };
    SERVICE_TYPE_LABELS.forEach(([code, desc]) => stSheet.addRow({ code, desc }));

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async importPriceListFromExcel(supplierId: string, fileBuffer: Buffer): Promise<{ imported: number; errors: string[] }> {
    await this.findOne(supplierId);

    const [zones, vehicleTypes] = await Promise.all([
      this.prisma.zone.findMany({ select: { id: true, name: true } }),
      this.prisma.vehicleType.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    ]);

    const zoneMap = new Map(zones.map((z) => [z.name.toLowerCase(), z.id]));
    const vtMap = new Map(vehicleTypes.map((vt) => [vt.name.toLowerCase(), vt.id]));

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as ExcelJS.Buffer);

    const sheet = workbook.getWorksheet('Price List');
    if (!sheet) throw new BadRequestException('Invalid template: "Price List" sheet not found');

    const items: PriceItemDto[] = [];
    const errors: string[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const serviceType = String(row.getCell(1).value || '').trim().toUpperCase();
      const fromZoneName = String(row.getCell(2).value || '').trim();
      const toZoneName = String(row.getCell(3).value || '').trim();
      const vehicleTypeName = String(row.getCell(4).value || '').trim();
      const price = Number(row.getCell(5).value) || 0;
      const driverTip = Number(row.getCell(6).value) || 0;

      if (!serviceType && !fromZoneName && !toZoneName && !vehicleTypeName) return;

      if (!serviceType || !fromZoneName || !toZoneName || !vehicleTypeName) {
        errors.push(`Row ${rowNumber}: Missing required fields`); return;
      }
      if (!VALID_SERVICE_TYPES.has(serviceType)) {
        errors.push(`Row ${rowNumber}: Unknown service type "${serviceType}"`); return;
      }

      const fromZoneId = zoneMap.get(fromZoneName.toLowerCase());
      const toZoneId = zoneMap.get(toZoneName.toLowerCase());
      const vehicleTypeId = vtMap.get(vehicleTypeName.toLowerCase());

      if (!fromZoneId) { errors.push(`Row ${rowNumber}: Unknown zone "${fromZoneName}"`); return; }
      if (!toZoneId) { errors.push(`Row ${rowNumber}: Unknown zone "${toZoneName}"`); return; }
      if (!vehicleTypeId) { errors.push(`Row ${rowNumber}: Unknown vehicle type "${vehicleTypeName}"`); return; }

      if (price > 0 || driverTip > 0) {
        items.push({ serviceType, fromZoneId, toZoneId, vehicleTypeId, price, driverTip });
      }
    });

    if (items.length > 0) {
      await this.upsertPriceItems(supplierId, { items });
    }

    return { imported: items.length, errors };
  }
}
