import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { SettingsService } from './settings.service.js';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto.js';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto.js';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto.js';
import { EmailService } from '../email/email.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';

/** Ensure the uploads directory exists at startup. */
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/** Shared multer storage config for file uploads. */
const uploadStorage = diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  },
});

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly emailService: EmailService,
  ) {}

  // ──────────────────────────────────────────────
  // GET /settings/system — retrieve system settings
  // ──────────────────────────────────────────────

  @Get('system')
  async getSystemSettings() {
    return this.settingsService.getSystemSettings();
  }

  // ──────────────────────────────────────────────
  // PATCH /settings/system — update system settings (ADMIN only)
  // ──────────────────────────────────────────────

  @Patch('system')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @Permissions('company.editSettings')
  async updateSystemSettings(@Body() dto: UpdateSystemSettingsDto) {
    return this.settingsService.updateSystemSettings(dto);
  }

  // ──────────────────────────────────────────────
  // GET /settings/license-status — check license validity (authenticated)
  // ──────────────────────────────────────────────

  @Get('license-status')
  async getLicenseStatus() {
    return this.settingsService.getLicenseStatus();
  }

  // ──────────────────────────────────────────────
  // GET /settings/company — retrieve company settings
  // ──────────────────────────────────────────────

  @Get('company')
  async getCompanySettings() {
    return this.settingsService.getCompanySettings();
  }

  // ──────────────────────────────────────────────
  // PATCH /settings/company — update company settings (ADMIN only)
  // ──────────────────────────────────────────────

  @Patch('company')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @Permissions('company.editSettings')
  async updateCompanySettings(@Body() dto: UpdateCompanySettingsDto) {
    return this.settingsService.updateCompanySettings(dto);
  }

  // ──────────────────────────────────────────────
  // POST /settings/company/logo — upload company logo (ADMIN only)
  // ──────────────────────────────────────────────

  @Post('company/logo')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @Permissions('company.uploadLogo')
  @UseInterceptors(FileInterceptor('file', { storage: uploadStorage }))
  async uploadLogo(@UploadedFile() file: any /* Express.Multer.File */) {
    const url = '/uploads/' + file.filename;
    await this.settingsService.updateLogo(url);
    return { url };
  }

  // ──────────────────────────────────────────────
  // POST /settings/company/favicon — upload favicon (ADMIN only)
  // ──────────────────────────────────────────────

  @Post('company/favicon')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @Permissions('company.uploadFavicon')
  @UseInterceptors(FileInterceptor('file', { storage: uploadStorage }))
  async uploadFavicon(@UploadedFile() file: any /* Express.Multer.File */) {
    const url = '/uploads/' + file.filename;
    await this.settingsService.updateFavicon(url);
    return { url };
  }

  // ──────────────────────────────────────────────
  // GET /settings/email — retrieve email/SMTP settings
  // ──────────────────────────────────────────────

  @Get('email')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @Permissions('company.editSettings')
  async getEmailSettings() {
    return this.settingsService.getEmailSettings();
  }

  // ──────────────────────────────────────────────
  // PATCH /settings/email — update email/SMTP settings (ADMIN only)
  // ──────────────────────────────────────────────

  @Patch('email')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @Permissions('company.editSettings')
  async updateEmailSettings(@Body() dto: UpdateEmailSettingsDto) {
    const result = await this.settingsService.updateEmailSettings(dto);
    // Force reload the SMTP transporter with new settings
    this.emailService.reloadTransporter();
    return result;
  }

  // ──────────────────────────────────────────────
  // POST /settings/email/test — send a test email (ADMIN only)
  // ──────────────────────────────────────────────

  @Post('email/test')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @Permissions('company.editSettings')
  async sendTestEmail(@Body() body: { email: string }) {
    await this.emailService.sendTestEmail(body.email);
    return { success: true };
  }
}
