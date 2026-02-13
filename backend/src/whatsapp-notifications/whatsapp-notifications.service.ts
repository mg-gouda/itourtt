import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import twilio from 'twilio';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateWhatsappSettingsDto } from './dto/update-whatsapp-settings.dto.js';

const SETTINGS_DEFAULTS = {
  isEnabled: false,
  twilioAccountSid: null,
  twilioAuthToken: null,
  whatsappFrom: null,
  messageTemplate:
    'Hello {{clientName}}, this is a reminder for your {{serviceType}} service on {{serviceDate}} at {{pickupTime}}. Ref: {{internalRef}}. Pax: {{paxCount}}. From: {{origin}} To: {{destination}}.',
  mediaUrl: null,
  sendHour: 9,
};

function maskToken(token: string | null | undefined): string | null {
  if (!token) return null;
  if (token.length <= 4) return '****';
  return '****' + token.slice(-4);
}

@Injectable()
export class WhatsappNotificationsService {
  private readonly logger = new Logger(WhatsappNotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    const settings = await this.prisma.whatsappSettings.findFirst();
    if (!settings) {
      return { ...SETTINGS_DEFAULTS, id: null };
    }
    return {
      ...settings,
      twilioAuthToken: maskToken(settings.twilioAuthToken),
    };
  }

  async getRawSettings() {
    const settings = await this.prisma.whatsappSettings.findFirst();
    if (!settings) return null;
    return settings;
  }

  async updateSettings(dto: UpdateWhatsappSettingsDto) {
    const existing = await this.prisma.whatsappSettings.findFirst();

    const data: Record<string, unknown> = {};
    if (dto.isEnabled !== undefined) data.isEnabled = dto.isEnabled;
    if (dto.twilioAccountSid !== undefined) data.twilioAccountSid = dto.twilioAccountSid;
    if (dto.twilioAuthToken !== undefined) data.twilioAuthToken = dto.twilioAuthToken;
    if (dto.whatsappFrom !== undefined) data.whatsappFrom = dto.whatsappFrom;
    if (dto.messageTemplate !== undefined) data.messageTemplate = dto.messageTemplate;
    if (dto.mediaUrl !== undefined) data.mediaUrl = dto.mediaUrl;
    if (dto.sendHour !== undefined) data.sendHour = dto.sendHour;

    if (existing) {
      const updated = await this.prisma.whatsappSettings.update({
        where: { id: existing.id },
        data,
      });
      return { ...updated, twilioAuthToken: maskToken(updated.twilioAuthToken) };
    }

    const created = await this.prisma.whatsappSettings.create({
      data: {
        isEnabled: dto.isEnabled ?? SETTINGS_DEFAULTS.isEnabled,
        twilioAccountSid: dto.twilioAccountSid ?? SETTINGS_DEFAULTS.twilioAccountSid,
        twilioAuthToken: dto.twilioAuthToken ?? SETTINGS_DEFAULTS.twilioAuthToken,
        whatsappFrom: dto.whatsappFrom ?? SETTINGS_DEFAULTS.whatsappFrom,
        messageTemplate: dto.messageTemplate ?? SETTINGS_DEFAULTS.messageTemplate,
        mediaUrl: dto.mediaUrl ?? SETTINGS_DEFAULTS.mediaUrl,
        sendHour: dto.sendHour ?? SETTINGS_DEFAULTS.sendHour,
      },
    });
    return { ...created, twilioAuthToken: maskToken(created.twilioAuthToken) };
  }

  async updateMediaUrl(url: string) {
    const existing = await this.prisma.whatsappSettings.findFirst();
    if (existing) {
      return this.prisma.whatsappSettings.update({
        where: { id: existing.id },
        data: { mediaUrl: url },
      });
    }
    return this.prisma.whatsappSettings.create({
      data: { mediaUrl: url },
    });
  }

  async getLogs(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      this.prisma.whatsappNotificationLog.findMany({
        skip,
        take: limit,
        orderBy: { sentAt: 'desc' },
        include: {
          trafficJob: {
            select: { internalRef: true },
          },
        },
      }),
      this.prisma.whatsappNotificationLog.count(),
    ]);
    return { logs, total, page, limit };
  }

  async sendTestMessage(phone: string) {
    const settings = await this.getRawSettings();
    if (!settings?.twilioAccountSid || !settings?.twilioAuthToken || !settings?.whatsappFrom) {
      throw new Error('Twilio credentials not configured');
    }

    const client = twilio(settings.twilioAccountSid, settings.twilioAuthToken);
    const msgOptions: Record<string, unknown> = {
      body: 'This is a test message from iTour TT WhatsApp Notifications.',
      from: `whatsapp:${settings.whatsappFrom}`,
      to: `whatsapp:${phone}`,
    };
    if (settings.mediaUrl) {
      msgOptions.mediaUrl = [settings.mediaUrl];
    }
    const message = await client.messages.create(msgOptions as any);

    return { messageSid: message.sid, status: message.status };
  }

  /**
   * Generate a single-page client sign PDF for a job (landscape A4, company logo + client name).
   * Saves to uploads/whatsapp/signs/ and returns the relative URL path.
   */
  async generateJobSignPdf(job: { id: string; clientName: string | null }): Promise<string | null> {
    const clientName = job.clientName;
    if (!clientName) return null;

    const signsDir = path.join(process.cwd(), 'uploads', 'whatsapp', 'signs');
    if (!fs.existsSync(signsDir)) {
      fs.mkdirSync(signsDir, { recursive: true });
    }

    const companySettings = await this.prisma.companySettings.findFirst();
    const logoUrl = companySettings?.logoUrl;

    const pdfDoc = await PDFDocument.create();

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

    const pageWidth = 842;
    const pageHeight = 595;
    const margin = 30;

    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    page.drawRectangle({
      x: margin,
      y: margin,
      width: pageWidth - 2 * margin,
      height: pageHeight - 2 * margin,
      borderColor: rgb(0, 0, 0),
      borderWidth: 2,
    });

    let currentY = pageHeight - margin - 20;

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

    page.drawText('Mr/Mrs', {
      x: margin + 30,
      y: currentY,
      size: 18,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });

    currentY -= 30;

    let fontSize = 72;
    const maxTextWidth = pageWidth - 2 * margin - 60;
    let textWidth = helveticaBold.widthOfTextAtSize(clientName, fontSize);
    while (textWidth > maxTextWidth && fontSize > 24) {
      fontSize -= 2;
      textWidth = helveticaBold.widthOfTextAtSize(clientName, fontSize);
    }

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

    const pdfBytes = await pdfDoc.save();
    const filename = `sign-${job.id}.pdf`;
    const filePath = path.join(signsDir, filename);
    fs.writeFileSync(filePath, Buffer.from(pdfBytes));

    return `/uploads/whatsapp/signs/${filename}`;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron() {
    try {
      const settings = await this.getRawSettings();
      if (!settings?.isEnabled) return;
      if (!settings.twilioAccountSid || !settings.twilioAuthToken || !settings.whatsappFrom) return;

      // Check if current Cairo-timezone hour matches sendHour
      const cairoHour = new Date().toLocaleString('en-US', {
        timeZone: 'Africa/Cairo',
        hour: 'numeric',
        hour12: false,
      });
      if (parseInt(cairoHour, 10) !== settings.sendHour) return;

      this.logger.log('WhatsApp cron triggered — sending reminders');

      // Tomorrow in Cairo timezone
      const now = new Date();
      const cairoDate = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
      const tomorrow = new Date(cairoDate);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      // Query jobs for tomorrow
      const jobs = await this.prisma.trafficJob.findMany({
        where: {
          jobDate: new Date(tomorrowStr),
          clientMobile: { not: null },
          status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
          deletedAt: null,
        },
        include: {
          originAirport: true,
          originHotel: { include: { zone: true } },
          originZone: true,
          destinationAirport: true,
          destinationHotel: { include: { zone: true } },
          destinationZone: true,
          assignment: {
            include: {
              driver: { select: { name: true, mobileNumber: true } },
              rep: { select: { name: true, mobileNumber: true } },
            },
          },
        },
      });

      if (jobs.length === 0) return;

      const client = twilio(settings.twilioAccountSid, settings.twilioAuthToken);
      const template = settings.messageTemplate ?? SETTINGS_DEFAULTS.messageTemplate;

      for (const job of jobs) {
        const phone = job.clientMobile!;

        // Check if already sent (dedup)
        const existing = await this.prisma.whatsappNotificationLog.findUnique({
          where: {
            trafficJobId_recipientPhone: {
              trafficJobId: job.id,
              recipientPhone: phone,
            },
          },
        });
        if (existing?.status === 'SENT') continue;

        // Build origin/destination labels
        const origin =
          job.originAirport?.name ??
          job.originHotel?.name ??
          job.originZone?.name ??
          'N/A';
        const destination =
          job.destinationAirport?.name ??
          job.destinationHotel?.name ??
          job.destinationZone?.name ??
          'N/A';

        const pickupTime = job.pickUpTime
          ? new Date(job.pickUpTime).toLocaleTimeString('en-US', {
              timeZone: 'Africa/Cairo',
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'TBD';

        const body = template
          .replace(/\{\{clientName\}\}/g, job.clientName ?? 'Guest')
          .replace(/\{\{serviceDate\}\}/g, tomorrowStr)
          .replace(/\{\{pickupTime\}\}/g, pickupTime)
          .replace(/\{\{origin\}\}/g, origin)
          .replace(/\{\{destination\}\}/g, destination)
          .replace(/\{\{serviceType\}\}/g, job.serviceType)
          .replace(/\{\{internalRef\}\}/g, job.internalRef)
          .replace(/\{\{agentRef\}\}/g, job.agentRef ?? 'N/A')
          .replace(/\{\{repName\}\}/g, job.assignment?.rep?.name ?? 'N/A')
          .replace(/\{\{repNumber\}\}/g, job.assignment?.rep?.mobileNumber ?? 'N/A')
          .replace(/\{\{driverName\}\}/g, job.assignment?.driver?.name ?? 'N/A')
          .replace(/\{\{driverNumber\}\}/g, job.assignment?.driver?.mobileNumber ?? 'N/A')
          .replace(/\{\{paxCount\}\}/g, String(job.paxCount))
          .replace(/\{\{clientSign\}\}/g, job.printSign ? '(attached below)' : 'N/A');

        try {
          // Generate client sign PDF if printSign is enabled
          let signUrl: string | null = null;
          if (job.printSign && job.clientName) {
            try {
              signUrl = await this.generateJobSignPdf(job);
            } catch (signErr) {
              this.logger.warn(`Failed to generate sign PDF for job ${job.internalRef}: ${signErr}`);
            }
          }

          const msgOptions: Record<string, unknown> = {
            body,
            from: `whatsapp:${settings.whatsappFrom}`,
            to: `whatsapp:${phone}`,
          };

          // Build media URLs array: global media + per-job sign
          const mediaUrls: string[] = [];
          if (settings.mediaUrl) mediaUrls.push(settings.mediaUrl);
          if (signUrl) mediaUrls.push(signUrl);
          if (mediaUrls.length > 0) {
            msgOptions.mediaUrl = mediaUrls;
          }
          const message = await client.messages.create(msgOptions as any);

          await this.prisma.whatsappNotificationLog.upsert({
            where: {
              trafficJobId_recipientPhone: {
                trafficJobId: job.id,
                recipientPhone: phone,
              },
            },
            update: {
              messageSid: message.sid,
              status: 'SENT',
              errorMessage: null,
              sentAt: new Date(),
            },
            create: {
              trafficJobId: job.id,
              recipientPhone: phone,
              messageSid: message.sid,
              status: 'SENT',
            },
          });

          this.logger.log(`WhatsApp sent to ${phone} for job ${job.internalRef}`);
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          this.logger.error(`WhatsApp failed for ${phone}: ${errorMessage}`);

          await this.prisma.whatsappNotificationLog.upsert({
            where: {
              trafficJobId_recipientPhone: {
                trafficJobId: job.id,
                recipientPhone: phone,
              },
            },
            update: {
              status: 'FAILED',
              errorMessage,
              sentAt: new Date(),
            },
            create: {
              trafficJobId: job.id,
              recipientPhone: phone,
              status: 'FAILED',
              errorMessage,
            },
          });
        }
      }
    } catch (err) {
      this.logger.error('WhatsApp cron error', err);
    }
  }
}
