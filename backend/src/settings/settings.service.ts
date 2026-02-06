import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto.js';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto.js';

/** Default values returned when no row exists yet. */
const SYSTEM_DEFAULTS = {
  theme: 'dark',
  primaryColor: '#3b82f6',
  accentColor: '#8b5cf6',
  fontFamily: 'Geist',
  language: 'en',
};

const COMPANY_DEFAULTS = {
  companyName: 'iTour TT',
  logoUrl: null,
  faviconUrl: null,
  reportHeaderHtml: null,
  reportFooterHtml: null,
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────
  // SYSTEM SETTINGS
  // ──────────────────────────────────────────────

  async getSystemSettings() {
    const settings = await this.prisma.systemSettings.findFirst();
    if (!settings) {
      return SYSTEM_DEFAULTS;
    }
    return settings;
  }

  async updateSystemSettings(dto: UpdateSystemSettingsDto) {
    const existing = await this.prisma.systemSettings.findFirst();

    if (existing) {
      return this.prisma.systemSettings.update({
        where: { id: existing.id },
        data: {
          ...(dto.theme !== undefined && { theme: dto.theme }),
          ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }),
          ...(dto.accentColor !== undefined && { accentColor: dto.accentColor }),
          ...(dto.fontFamily !== undefined && { fontFamily: dto.fontFamily }),
          ...(dto.language !== undefined && { language: dto.language }),
        },
      });
    }

    return this.prisma.systemSettings.create({
      data: {
        theme: dto.theme ?? SYSTEM_DEFAULTS.theme,
        primaryColor: dto.primaryColor ?? SYSTEM_DEFAULTS.primaryColor,
        accentColor: dto.accentColor ?? SYSTEM_DEFAULTS.accentColor,
        fontFamily: dto.fontFamily ?? SYSTEM_DEFAULTS.fontFamily,
        language: dto.language ?? SYSTEM_DEFAULTS.language,
      },
    });
  }

  // ──────────────────────────────────────────────
  // COMPANY SETTINGS
  // ──────────────────────────────────────────────

  async getCompanySettings() {
    const settings = await this.prisma.companySettings.findFirst();
    if (!settings) {
      return COMPANY_DEFAULTS;
    }
    return settings;
  }

  async updateCompanySettings(dto: UpdateCompanySettingsDto) {
    const existing = await this.prisma.companySettings.findFirst();

    if (existing) {
      return this.prisma.companySettings.update({
        where: { id: existing.id },
        data: {
          ...(dto.companyName !== undefined && { companyName: dto.companyName }),
          ...(dto.reportHeaderHtml !== undefined && { reportHeaderHtml: dto.reportHeaderHtml }),
          ...(dto.reportFooterHtml !== undefined && { reportFooterHtml: dto.reportFooterHtml }),
        },
      });
    }

    return this.prisma.companySettings.create({
      data: {
        companyName: dto.companyName ?? COMPANY_DEFAULTS.companyName,
        reportHeaderHtml: dto.reportHeaderHtml ?? COMPANY_DEFAULTS.reportHeaderHtml,
        reportFooterHtml: dto.reportFooterHtml ?? COMPANY_DEFAULTS.reportFooterHtml,
      },
    });
  }

  // ──────────────────────────────────────────────
  // FILE UPLOADS (logo / favicon)
  // ──────────────────────────────────────────────

  async updateLogo(fileUrl: string) {
    const existing = await this.prisma.companySettings.findFirst();

    if (existing) {
      return this.prisma.companySettings.update({
        where: { id: existing.id },
        data: { logoUrl: fileUrl },
      });
    }

    return this.prisma.companySettings.create({
      data: {
        companyName: COMPANY_DEFAULTS.companyName,
        logoUrl: fileUrl,
      },
    });
  }

  async updateFavicon(fileUrl: string) {
    const existing = await this.prisma.companySettings.findFirst();

    if (existing) {
      return this.prisma.companySettings.update({
        where: { id: existing.id },
        data: { faviconUrl: fileUrl },
      });
    }

    return this.prisma.companySettings.create({
      data: {
        companyName: COMPANY_DEFAULTS.companyName,
        faviconUrl: fileUrl,
      },
    });
  }
}
