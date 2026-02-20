import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto.js';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto.js';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto.js';
import { validateLicenseKey, type LicenseStatus } from '../common/license.util.js';

/** Default values returned when no row exists yet. */
const SYSTEM_DEFAULTS = {
  theme: 'dark',
  primaryColor: '#3b82f6',
  accentColor: '#8b5cf6',
  fontFamily: 'Geist',
  language: 'en',
};

const EMAIL_DEFAULTS = {
  smtpHost: null as string | null,
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: null as string | null,
  smtpPass: null as string | null,
  fromAddress: 'noreply@itour.local',
  notifyDispatchEmail: null as string | null,
  notifyTrafficEmail: null as string | null,
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

    const data: Record<string, unknown> = {};
    if (dto.companyName !== undefined) data.companyName = dto.companyName;
    if (dto.reportHeaderHtml !== undefined) data.reportHeaderHtml = dto.reportHeaderHtml;
    if (dto.reportFooterHtml !== undefined) data.reportFooterHtml = dto.reportFooterHtml;
    if (dto.licenseKey !== undefined) data.licenseKey = dto.licenseKey || null;

    if (existing) {
      return this.prisma.companySettings.update({
        where: { id: existing.id },
        data,
      });
    }

    return this.prisma.companySettings.create({
      data: {
        companyName: dto.companyName ?? COMPANY_DEFAULTS.companyName,
        reportHeaderHtml: dto.reportHeaderHtml ?? COMPANY_DEFAULTS.reportHeaderHtml,
        reportFooterHtml: dto.reportFooterHtml ?? COMPANY_DEFAULTS.reportFooterHtml,
        licenseKey: dto.licenseKey ?? null,
      },
    });
  }

  // ──────────────────────────────────────────────
  // LICENSE STATUS
  // ──────────────────────────────────────────────

  async getLicenseStatus(): Promise<LicenseStatus> {
    const settings = await this.prisma.companySettings.findFirst();
    return validateLicenseKey(settings?.licenseKey);
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

  // ──────────────────────────────────────────────
  // EMAIL SETTINGS
  // ──────────────────────────────────────────────

  async getEmailSettings() {
    const settings = await this.prisma.emailSettings.findFirst();
    if (!settings) {
      return EMAIL_DEFAULTS;
    }
    // Mask password for frontend display
    return {
      ...settings,
      smtpPass: settings.smtpPass ? '••••••••' : null,
    };
  }

  async updateEmailSettings(dto: UpdateEmailSettingsDto) {
    const existing = await this.prisma.emailSettings.findFirst();

    // Don't overwrite password if masked placeholder is sent
    const data: Record<string, unknown> = {};
    if (dto.smtpHost !== undefined) data.smtpHost = dto.smtpHost || null;
    if (dto.smtpPort !== undefined) data.smtpPort = dto.smtpPort;
    if (dto.smtpSecure !== undefined) data.smtpSecure = dto.smtpSecure;
    if (dto.smtpUser !== undefined) data.smtpUser = dto.smtpUser || null;
    if (dto.smtpPass !== undefined && dto.smtpPass !== '••••••••') {
      data.smtpPass = dto.smtpPass || null;
    }
    if (dto.fromAddress !== undefined) data.fromAddress = dto.fromAddress;
    if (dto.notifyDispatchEmail !== undefined) data.notifyDispatchEmail = dto.notifyDispatchEmail || null;
    if (dto.notifyTrafficEmail !== undefined) data.notifyTrafficEmail = dto.notifyTrafficEmail || null;

    if (existing) {
      return this.prisma.emailSettings.update({
        where: { id: existing.id },
        data,
      });
    }

    return this.prisma.emailSettings.create({
      data: {
        smtpHost: dto.smtpHost ?? EMAIL_DEFAULTS.smtpHost,
        smtpPort: dto.smtpPort ?? EMAIL_DEFAULTS.smtpPort,
        smtpSecure: dto.smtpSecure ?? EMAIL_DEFAULTS.smtpSecure,
        smtpUser: dto.smtpUser ?? EMAIL_DEFAULTS.smtpUser,
        smtpPass: dto.smtpPass ?? EMAIL_DEFAULTS.smtpPass,
        fromAddress: dto.fromAddress ?? EMAIL_DEFAULTS.fromAddress,
        notifyDispatchEmail: dto.notifyDispatchEmail ?? EMAIL_DEFAULTS.notifyDispatchEmail,
        notifyTrafficEmail: dto.notifyTrafficEmail ?? EMAIL_DEFAULTS.notifyTrafficEmail,
      },
    });
  }

  /** Raw settings (with real password) for the email transporter. */
  async getEmailSettingsRaw() {
    const settings = await this.prisma.emailSettings.findFirst();
    return settings ?? EMAIL_DEFAULTS;
  }
}
