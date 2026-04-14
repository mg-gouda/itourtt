import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service.js';

/** Drive file IDs are alphanumeric+underscore+hyphen, no slashes — used to detect new vs legacy URLs */
export function isDriveFileId(value: string): boolean {
  return /^[A-Za-z0-9_-]{20,}$/.test(value);
}

interface DriveConfig {
  enabled: boolean;
  serviceAccountJson: string;
  rootFolderId: string;
}

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);

  /** In-process folder ID cache: key → Drive folder ID */
  private folderCache = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Config helpers
  // ──────────────────────────────────────────────────────────────────────────

  async getConfig(): Promise<DriveConfig | null> {
    const row = await this.prisma.googleDriveSettings.findFirst();
    if (!row || !row.enabled || !row.serviceAccountJson || !row.rootFolderId) {
      return null;
    }
    return {
      enabled: row.enabled,
      serviceAccountJson: row.serviceAccountJson,
      rootFolderId: row.rootFolderId,
    };
  }

  /** Invalidate folder cache — call after settings update */
  clearCache() {
    this.folderCache.clear();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Drive client factory (lazy import — googleapis is optional)
  // ──────────────────────────────────────────────────────────────────────────

  private async getDrive(config: DriveConfig) {
    const { google } = await import('googleapis');
    const credentials = JSON.parse(config.serviceAccountJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    return google.drive({ version: 'v3', auth });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Folder management
  // ──────────────────────────────────────────────────────────────────────────

  private async getOrCreateFolder(drive: any, name: string, parentId: string): Promise<string> {
    const cacheKey = `${parentId}::${name}`;
    if (this.folderCache.has(cacheKey)) return this.folderCache.get(cacheKey)!;

    // Search for existing folder with this name under parent
    const search = await drive.files.list({
      q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
      fields: 'files(id)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    if (search.data.files?.length) {
      const id = search.data.files[0].id as string;
      this.folderCache.set(cacheKey, id);
      return id;
    }

    // Create it
    const created = await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id',
    });

    const id = created.data.id as string;
    this.folderCache.set(cacheKey, id);
    return id;
  }

  /**
   * Resolves (and creates if needed) the target folder for a job's evidence type.
   * Structure: rootFolder / {jobRef} / {type label}
   */
  async resolveEvidenceFolder(
    drive: any,
    rootFolderId: string,
    jobRef: string,
    type: 'Rep Evidence' | 'Driver Evidence' | 'No-Show Evidence',
  ): Promise<string> {
    const jobFolder = await this.getOrCreateFolder(drive, jobRef, rootFolderId);
    return this.getOrCreateFolder(drive, type, jobFolder);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Upload
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Upload a file buffer to Drive. Returns the Drive file ID.
   * Falls back gracefully (returns null) if Drive is not configured.
   */
  async uploadFile(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    jobId: string,
    type: 'rep' | 'driver' | 'no-show',
  ): Promise<string | null> {
    const config = await this.getConfig();
    if (!config) return null;

    try {
      const drive = await this.getDrive(config);

      // Resolve job internalRef for the folder name
      const job = await this.prisma.trafficJob.findUnique({
        where: { id: jobId },
        select: { internalRef: true },
      });
      const jobRef = job?.internalRef ?? jobId;

      const folderLabel =
        type === 'rep' ? 'Rep Evidence' :
        type === 'driver' ? 'Driver Evidence' :
        'No-Show Evidence';

      const folderId = await this.resolveEvidenceFolder(
        drive,
        config.rootFolderId,
        jobRef,
        folderLabel as any,
      );

      const stream = Readable.from(buffer);
      const res = await drive.files.create({
        supportsAllDrives: true,
        requestBody: {
          name: filename,
          parents: [folderId],
        },
        media: {
          mimeType,
          body: stream,
        },
        fields: 'id',
      });

      return res.data.id as string;
    } catch (err) {
      this.logger.error('Drive upload failed', err);
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Download (for PDF embed + proxy)
  // ──────────────────────────────────────────────────────────────────────────

  /** Download a Drive file as a Buffer. Used by export service for PDF embed. */
  async getFileBuffer(fileId: string): Promise<Buffer | null> {
    const config = await this.getConfig();
    if (!config) return null;

    try {
      const drive = await this.getDrive(config);
      const res = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer' },
      );
      return Buffer.from(res.data as ArrayBuffer);
    } catch (err) {
      this.logger.error(`Drive download failed for ${fileId}`, err);
      return null;
    }
  }

  /** Stream a Drive file. Used by the proxy endpoint. */
  async getFileStream(fileId: string): Promise<{ stream: Readable; mimeType: string } | null> {
    const config = await this.getConfig();
    if (!config) return null;

    try {
      const drive = await this.getDrive(config);

      // Get mime type first
      const meta = await drive.files.get({ fileId, fields: 'mimeType', supportsAllDrives: true });
      const mimeType = (meta.data.mimeType as string) || 'application/octet-stream';

      const res = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' },
      );

      return { stream: res.data as Readable, mimeType };
    } catch (err) {
      this.logger.error(`Drive stream failed for ${fileId}`, err);
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Test connection
  // ──────────────────────────────────────────────────────────────────────────

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const config = await this.getConfig();
    if (!config) {
      return { ok: false, message: 'Google Drive is not configured or not enabled.' };
    }

    try {
      const drive = await this.getDrive(config);
      const res = await drive.files.get({
        fileId: config.rootFolderId,
        fields: 'id,name,mimeType',
        supportsAllDrives: true,
      });

      if (res.data.mimeType !== 'application/vnd.google-apps.folder') {
        return { ok: false, message: `"${res.data.name}" is not a folder. Check the Root Folder ID.` };
      }

      return { ok: true, message: `Connected. Root folder: "${res.data.name}"` };
    } catch (err: any) {
      const msg = err?.errors?.[0]?.message || err?.message || 'Unknown error';
      return { ok: false, message: `Connection failed: ${msg}` };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Migration — move existing /uploads/ records to Drive
  // ──────────────────────────────────────────────────────────────────────────

  async migrateLocalFilesToDrive(): Promise<{
    total: number;
    migrated: number;
    skipped: number;
    errors: number;
    details: string[];
  }> {
    const config = await this.getConfig();
    if (!config) {
      return { total: 0, migrated: 0, skipped: 0, errors: 0, details: ['Drive not configured or not enabled.'] };
    }

    const drive = await this.getDrive(config);
    const fs = await import('fs');
    const path = await import('path');

    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    const details: string[] = [];

    type EvidenceModel = 'noShowEvidence' | 'inPlaceEvidence' | 'completedEvidence';

    const models: { model: EvidenceModel; type: 'rep' | 'driver' | 'no-show' }[] = [
      { model: 'noShowEvidence', type: 'no-show' },
      { model: 'inPlaceEvidence', type: 'rep' },
      { model: 'completedEvidence', type: 'driver' },
    ];

    for (const { model, type } of models) {
      const records = await (this.prisma[model] as any).findMany({
        include: { trafficJob: { select: { internalRef: true } } },
      });

      for (const record of records) {
        const oldUrls: string[] = record.imageUrls ?? [];
        const newUrls: string[] = [];
        let changed = false;

        for (const url of oldUrls) {
          if (!url.startsWith('/uploads/')) {
            // Already a Drive ID or unknown — keep as-is
            newUrls.push(url);
            continue;
          }

          const localPath = path.default.join(process.cwd(), url.replace(/^\//, ''));
          if (!fs.default.existsSync(localPath)) {
            details.push(`MISSING: ${url}`);
            newUrls.push(url);
            errors++;
            continue;
          }

          try {
            const buffer = fs.default.readFileSync(localPath);
            const filename = path.default.basename(localPath);
            const mimeType = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

            const folderLabel =
              type === 'rep' ? 'Rep Evidence' :
              type === 'driver' ? 'Driver Evidence' :
              'No-Show Evidence';

            const folderId = await this.resolveEvidenceFolder(
              drive,
              config.rootFolderId,
              record.trafficJob.internalRef,
              folderLabel as any,
            );

            const stream = Readable.from(buffer);
            const res = await drive.files.create({
              supportsAllDrives: true,
              requestBody: { name: filename, parents: [folderId] },
              media: { mimeType, body: stream },
              fields: 'id',
            });

            newUrls.push(res.data.id as string);
            changed = true;
            migrated++;
            details.push(`OK: ${url} → ${res.data.id}`);
          } catch (err: any) {
            details.push(`ERROR: ${url} — ${err?.message}`);
            newUrls.push(url);
            errors++;
          }
        }

        if (changed) {
          await (this.prisma[model] as any).update({
            where: { id: record.id },
            data: { imageUrls: newUrls },
          });
        } else {
          skipped++;
        }
      }
    }

    return { total: migrated + skipped + errors, migrated, skipped, errors, details };
  }
}
