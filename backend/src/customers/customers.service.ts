import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { PaginatedResponse } from '../common/dto/api-response.dto.js';
import type { Currency, ServiceType } from '../../generated/prisma/enums.js';
import { SELECTABLE_SERVICE_TYPES, SERVICE_TYPE_LABEL_PAIRS } from '../common/utils/service-type.util.js';

const VALID_SERVICE_TYPES = new Set<string>(SELECTABLE_SERVICE_TYPES);

const SERVICE_TYPE_LABELS: [string, string][] = SERVICE_TYPE_LABEL_PAIRS;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(pagination: PaginationDto, search?: string) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { deletedAt: null };

    if (search) {
      where.OR = [
        { legalName: { contains: search, mode: 'insensitive' } },
        { tradeName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return new PaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID "${id}" not found`);
    }

    return customer;
  }

  async create(dto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: {
        legalName: dto.legalName,
        tradeName: dto.tradeName,
        taxId: dto.taxId,
        address: dto.address,
        city: dto.city,
        country: dto.country,
        phone: dto.phone,
        email: dto.email,
        contactPerson: dto.contactPerson,
        ...(dto.currency && { currency: dto.currency as Currency }),
        ...(dto.creditLimit !== undefined && { creditLimit: dto.creditLimit }),
        ...(dto.creditDays !== undefined && { creditDays: dto.creditDays }),
      },
    });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.findOne(id);

    return this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.legalName !== undefined && { legalName: dto.legalName }),
        ...(dto.tradeName !== undefined && { tradeName: dto.tradeName }),
        ...(dto.taxId !== undefined && { taxId: dto.taxId }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.contactPerson !== undefined && { contactPerson: dto.contactPerson }),
        ...(dto.currency !== undefined && { currency: dto.currency as Currency }),
        ...(dto.creditLimit !== undefined && { creditLimit: dto.creditLimit }),
        ...(dto.creditDays !== undefined && { creditDays: dto.creditDays }),
      },
    });
  }

  async toggleStatus(id: string) {
    const customer = await this.findOne(id);

    return this.prisma.customer.update({
      where: { id },
      data: { isActive: !customer.isActive },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async bulkDelete(ids: string[]) {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('No customer IDs provided');
    }

    const result = await this.prisma.customer.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    return { deleted: result.count };
  }

  // Price List Methods

  // Excel Template & Import Methods

  // ──────────────────────────────────────────────
  // EXPORT – all customers to Excel
  // ──────────────────────────────────────────────

  async exportToExcel(): Promise<Buffer> {
    const customers = await this.prisma.customer.findMany({
      where: { deletedAt: null },
      orderBy: { legalName: 'asc' },
    });

    const rows = customers.map((c) => ({
      'Legal Name': c.legalName,
      'Trade Name': c.tradeName || '',
      'Tax ID': c.taxId || '',
      Address: c.address || '',
      City: c.city || '',
      Country: c.country || '',
      Phone: c.phone || '',
      Email: c.email || '',
      'Contact Person': c.contactPerson || '',
      Currency: c.currency,
      'Credit Limit': c.creditLimit ? Number(c.creditLimit) : '',
      'Credit Days': c.creditDays ?? '',
      Status: c.isActive ? 'Active' : 'Inactive',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const colWidths = Object.keys(rows[0] || {}).map((key) => {
      const maxLen = Math.max(key.length, ...rows.map((r) => String((r as any)[key] || '').length));
      return { wch: Math.min(maxLen + 2, 40) };
    });
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Customers');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.from(buf);
  }

  async generateImportTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'iTour GO';
    workbook.created = new Date();

    const instructionsSheet = workbook.addWorksheet('Instructions');
    instructionsSheet.columns = [{ width: 80 }];
    instructionsSheet.addRow(['Customer Bulk Import Template']);
    instructionsSheet.addRow(['']);
    instructionsSheet.addRow(['Instructions:']);
    instructionsSheet.addRow(['1. Fill in customer data in the "Customers" sheet']);
    instructionsSheet.addRow(['2. Legal Name is the only required field']);
    instructionsSheet.addRow(['3. Currency must be one of: EGP, USD, EUR, GBP, SAR (defaults to EGP)']);
    instructionsSheet.addRow(['4. Credit Limit and Credit Days are optional numeric values']);
    instructionsSheet.addRow(['5. Do not modify column headers']);
    instructionsSheet.addRow(['6. Save the file and upload it via the import button']);
    instructionsSheet.addRow(['']);
    instructionsSheet.addRow(['Notes:']);
    instructionsSheet.addRow(['- All imported customers will be set to Active status']);
    instructionsSheet.addRow(['- Maximum 500 customers per import']);
    instructionsSheet.getRow(1).font = { bold: true, size: 14 };
    instructionsSheet.getRow(3).font = { bold: true };
    instructionsSheet.getRow(11).font = { bold: true };

    const customersSheet = workbook.addWorksheet('Customers');
    customersSheet.columns = [
      { header: 'Legal Name', key: 'legalName', width: 30 },
      { header: 'Trade Name', key: 'tradeName', width: 25 },
      { header: 'Tax ID', key: 'taxId', width: 20 },
      { header: 'Address', key: 'address', width: 30 },
      { header: 'City', key: 'city', width: 20 },
      { header: 'Country', key: 'country', width: 20 },
      { header: 'Phone', key: 'phone', width: 20 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Contact Person', key: 'contactPerson', width: 20 },
      { header: 'Currency', key: 'currency', width: 12 },
      { header: 'Credit Limit', key: 'creditLimit', width: 15 },
      { header: 'Credit Days', key: 'creditDays', width: 15 },
    ];

    const headerRow = customersSheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    customersSheet.addRow({
      legalName: 'Cairo Tours Agency', tradeName: 'Cairo Tours', taxId: '987-654-321',
      address: '5 Tahrir St', city: 'Cairo', country: 'Egypt',
      phone: '+20 2 9876 5432', email: 'info@cairotours.com',
      contactPerson: 'Ahmed Mahmoud', currency: 'EGP', creditLimit: 100000, creditDays: 45,
    });
    customersSheet.addRow({
      legalName: 'Desert Safari Co', tradeName: '', taxId: '', address: '', city: '', country: '',
      phone: '', email: '', contactPerson: '', currency: 'USD', creditLimit: '', creditDays: '',
    });

    for (let i = 2; i <= 3; i++) {
      customersSheet.getRow(i).font = { italic: true, color: { argb: 'FF999999' } };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async importFromExcel(fileBuffer: Buffer): Promise<{ imported: number; errors: string[] }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as ExcelJS.Buffer);

    const customersSheet = workbook.getWorksheet('Customers');
    if (!customersSheet) {
      throw new BadRequestException('Invalid template: "Customers" sheet not found');
    }

    const validCurrencies = new Set(['EGP', 'USD', 'EUR', 'GBP', 'SAR']);
    const items: {
      legalName: string; tradeName?: string; taxId?: string; address?: string;
      city?: string; country?: string; phone?: string; email?: string;
      contactPerson?: string; currency: string; creditLimit?: number; creditDays?: number;
    }[] = [];
    const errors: string[] = [];

    customersSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const legalName = String(row.getCell(1).value || '').trim();
      if (!legalName) return;

      // Skip sample rows
      if (legalName === 'Cairo Tours Agency' || legalName === 'Desert Safari Co') return;

      const tradeName = String(row.getCell(2).value || '').trim();
      const taxId = String(row.getCell(3).value || '').trim();
      const address = String(row.getCell(4).value || '').trim();
      const city = String(row.getCell(5).value || '').trim();
      const country = String(row.getCell(6).value || '').trim();
      const phone = String(row.getCell(7).value || '').trim();
      const email = String(row.getCell(8).value || '').trim();
      const contactPerson = String(row.getCell(9).value || '').trim();
      const currency = String(row.getCell(10).value || 'EGP').trim().toUpperCase();
      const creditLimitRaw = row.getCell(11).value;
      const creditDaysRaw = row.getCell(12).value;

      if (!validCurrencies.has(currency)) {
        errors.push(`Row ${rowNumber}: Invalid currency "${currency}"`);
        return;
      }

      let creditLimit: number | undefined;
      if (creditLimitRaw !== null && creditLimitRaw !== undefined && String(creditLimitRaw).trim() !== '') {
        creditLimit = parseFloat(String(creditLimitRaw));
        if (isNaN(creditLimit) || creditLimit < 0) {
          errors.push(`Row ${rowNumber}: Invalid credit limit`);
          return;
        }
      }

      let creditDays: number | undefined;
      if (creditDaysRaw !== null && creditDaysRaw !== undefined && String(creditDaysRaw).trim() !== '') {
        creditDays = parseInt(String(creditDaysRaw), 10);
        if (isNaN(creditDays) || creditDays < 0) {
          errors.push(`Row ${rowNumber}: Invalid credit days`);
          return;
        }
      }

      items.push({
        legalName,
        ...(tradeName && { tradeName }),
        ...(taxId && { taxId }),
        ...(address && { address }),
        ...(city && { city }),
        ...(country && { country }),
        ...(phone && { phone }),
        ...(email && { email }),
        ...(contactPerson && { contactPerson }),
        currency,
        ...(creditLimit !== undefined && { creditLimit }),
        ...(creditDays !== undefined && { creditDays }),
      });
    });

    if (items.length === 0 && errors.length === 0) {
      throw new BadRequestException('No data found in the Customers sheet');
    }

    if (items.length > 500) {
      throw new BadRequestException('Maximum 500 customers per import.');
    }

    let imported = 0;
    for (const item of items) {
      try {
        await this.prisma.customer.create({
          data: {
            legalName: item.legalName,
            tradeName: item.tradeName,
            taxId: item.taxId,
            address: item.address,
            city: item.city,
            country: item.country,
            phone: item.phone,
            email: item.email,
            contactPerson: item.contactPerson,
            currency: item.currency as Currency,
            creditLimit: item.creditLimit,
            creditDays: item.creditDays,
          },
        });
        imported++;
      } catch (err: any) {
        errors.push(`Failed "${item.legalName}": ${err.message}`);
      }
    }

    return { imported, errors };
  }

}
