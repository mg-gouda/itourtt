import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Prisma } from '../../generated/prisma/client.js';
import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service.js';
import { GoogleDriveService, isDriveFileId } from '../google-drive/google-drive.service.js';
import { todayCairo } from '../common/utils/service-date.util.js';

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
/** Failed AI reads before the driver may type the number (owner rule: retake once, then type). */
const AI_TRIES_BEFORE_TYPING = 2;
/** A jump bigger than this between two readings of one car is flagged for checking. */
const MAX_PLAUSIBLE_JUMP_KM = 1500;
const uploadsDir = path.join(process.cwd(), 'uploads', 'odometer');

export interface TripKmRow {
  id: string;
  jobId: string;
  jobRef: string;
  jobDate: string;
  serviceType: string;
  driverId: string;
  driverName: string;
  vehicleId: string;
  plateNumber: string;
  vehicleName: string;
  readingKm: number;
  previousKm: number | null;
  previousJobRef: string | null;
  previousDriverName: string | null;
  distanceKm: number | null;
  source: string;
  aiReadingKm: number | null;
  flagged: boolean;
  flagNote: string | null;
  confirmedAt: string;
  exportedAt: string | null;
  hasPhoto: boolean;
}

/** Cairo calendar day → [start, end) UTC instants. */
function cairoDayRange(from: string, to: string): [Date, Date] {
  // Cairo is UTC+2 / +3 (DST). Use the offset of each boundary day.
  const at = (day: string) => {
    const probe = new Date(`${day}T12:00:00Z`);
    const local = new Date(probe.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
    const offsetMs = local.getTime() - new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
    return new Date(new Date(`${day}T00:00:00Z`).getTime() - offsetMs);
  };
  const end = new Date(at(to).getTime() + 24 * 3600 * 1000);
  return [at(from), end];
}

const cairoDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
const cairoTime = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });

/**
 * Trip kilometres (business rules › Trip kilometres / odometer):
 * - On completing a job in an **owned** car, the driver photographs the odometer; Gemini reads the
 *   total-km value into a read-only field. Unreadable twice → the driver types it (flagged).
 * - The reading belongs to the job's car (drivers and cars are freely paired), so a trip's distance
 *   is this reading minus the previous reading **of the same car**, whoever drove it.
 * - Finance exports readings for Odoo Fleet (Vehicle / Date / Odometer Value / Driver).
 */
@Injectable()
export class TripKmService {
  private readonly logger = new Logger(TripKmService.name);
  private genAI: GoogleGenerativeAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly drive: GoogleDriveService,
    config: ConfigService,
  ) {
    const key = config.get<string>('GEMINI_API_KEY');
    if (key) this.genAI = new GoogleGenerativeAI(key);
  }

  // ── Reading the photo ───────────────────────────────────────────────────────

  /** Gemini reads the total odometer (ODO) in km from a dashboard photo; null when not legible. */
  async readOdometer(buffer: Buffer, mimeType: string): Promise<number | null> {
    if (!this.genAI) throw new BadRequestException('Odometer reading is not configured (GEMINI_API_KEY missing)');
    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    });
    const prompt =
      'This photo should show a car dashboard odometer. Read the TOTAL odometer (ODO) value — ' +
      'not a trip meter (TRIP A/B), not speed, not fuel range, not the clock. ' +
      'If the unit shown is miles, convert to kilometres. Ignore decimals (tenths). ' +
      'Reply only with JSON: {"odometerKm": <integer or null>, "legible": <true|false>}. ' +
      'Use null and legible=false when the total odometer cannot be read with certainty.';
    try {
      const res = await model.generateContent([
        { text: prompt },
        { inlineData: { mimeType, data: buffer.toString('base64') } },
      ]);
      const text = res.response.text().trim().replace(/^```json\s*|```$/g, '');
      const parsed = JSON.parse(text) as { odometerKm?: number | string | null; legible?: boolean };
      const n = parsed.odometerKm == null ? NaN : Math.round(Number(String(parsed.odometerKm).replace(/[^\d.]/g, '')));
      if (!parsed.legible || !Number.isFinite(n) || n <= 0 || n > 3_000_000) return null;
      return n;
    } catch (e: any) {
      this.logger.warn(`Odometer read failed: ${e?.message}`);
      return null;
    }
  }

  // ── Driver side ─────────────────────────────────────────────────────────────

  /** The job's assignment for this driver, and whether its car needs a reading (owned fleet). */
  private async jobContext(driverId: string, jobId: string) {
    const a = await this.prisma.trafficAssignment.findFirst({
      where: { driverId, trafficJobId: jobId },
      select: { vehicleId: true, vehicle: { select: { ownership: true, plateNumber: true } } },
    });
    if (!a) throw new NotFoundException('Job not found or not assigned to you');
    return { vehicleId: a.vehicleId, plate: a.vehicle?.plateNumber ?? null, required: !!a.vehicleId && a.vehicle?.ownership === 'OWNED' };
  }

  /** What the completion dialog needs: required?, the read value, and whether typing is allowed. */
  async statusForDriver(driverId: string, jobId: string) {
    const ctx = await this.jobContext(driverId, jobId);
    const row = ctx.required ? await this.prisma.tripOdometer.findUnique({ where: { trafficJobId: jobId } }) : null;
    return {
      required: ctx.required,
      plateNumber: ctx.plate,
      readingKm: row?.readingKm ?? null,
      source: row?.source ?? null,
      aiAttempts: row?.aiAttempts ?? 0,
      hasPhoto: !!row?.photoUrl,
      canType: !!row && row.readingKm == null && row.aiAttempts >= AI_TRIES_BEFORE_TYPING,
    };
  }

  /** Driver uploads the odometer photo: stored as the job's draft reading, AI value returned. */
  async capture(driverId: string, jobId: string, file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('Take a photo of the odometer');
    if (!/^image\//.test(file.mimetype)) throw new BadRequestException('The odometer photo must be an image');
    if (file.size > MAX_PHOTO_BYTES) throw new BadRequestException('The photo is larger than 15 MB');
    const ctx = await this.jobContext(driverId, jobId);
    if (!ctx.required || !ctx.vehicleId) throw new BadRequestException('This car does not need an odometer reading');
    const existing = await this.prisma.tripOdometer.findUnique({ where: { trafficJobId: jobId } });
    if (existing?.confirmedAt) throw new BadRequestException('This job is already completed');

    const km = await this.readOdometer(file.buffer, file.mimetype);
    const name = `odometer-${jobId}-${Date.now()}.jpg`;
    let photoUrl = await this.drive.uploadFile(file.buffer, name, file.mimetype, jobId, 'driver').catch(() => null);
    if (!photoUrl) {
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(path.join(uploadsDir, name), file.buffer);
      photoUrl = `/uploads/odometer/${name}`;
    }
    await this.prisma.tripOdometer.upsert({
      where: { trafficJobId: jobId },
      create: {
        trafficJobId: jobId, driverId, vehicleId: ctx.vehicleId, photoUrl,
        readingKm: km, aiReadingKm: km, source: 'AI', aiAttempts: 1,
      },
      update: {
        driverId, vehicleId: ctx.vehicleId, photoUrl,
        readingKm: km, aiReadingKm: km, source: 'AI', aiAttempts: { increment: 1 },
      },
    });
    return this.statusForDriver(driverId, jobId);
  }

  /**
   * Gate before a COMPLETED submission: an owned car needs a reading (AI, or typed after two failed
   * reads). Returns the row to confirm once completion succeeds, or null when no reading applies.
   */
  async assertForCompletion(driverId: string, jobId: string, typedKm?: string | number | null) {
    const ctx = await this.jobContext(driverId, jobId);
    if (!ctx.required) return null;
    const row = await this.prisma.tripOdometer.findUnique({ where: { trafficJobId: jobId } });
    if (!row?.photoUrl) throw new BadRequestException('Take a photo of the car odometer before completing the job');
    if (row.readingKm != null) return row;
    const typed = typedKm == null || typedKm === '' ? NaN : Math.round(Number(typedKm));
    if (row.aiAttempts < AI_TRIES_BEFORE_TYPING) {
      throw new BadRequestException('The odometer could not be read — retake the photo');
    }
    if (!Number.isFinite(typed) || typed <= 0 || typed > 3_000_000) {
      throw new BadRequestException('Type the odometer kilometres shown in the photo');
    }
    return this.prisma.tripOdometer.update({ where: { id: row.id }, data: { readingKm: typed, source: 'MANUAL' } });
  }

  /** The job was completed: the reading counts from now; flag anything that needs a human look. */
  async confirm(id: string) {
    const row = await this.prisma.tripOdometer.update({ where: { id }, data: { confirmedAt: new Date() } });
    const prev = await this.prisma.tripOdometer.findFirst({
      where: { vehicleId: row.vehicleId, confirmedAt: { not: null, lt: row.confirmedAt! }, readingKm: { not: null }, id: { not: row.id } },
      orderBy: { confirmedAt: 'desc' },
      select: { readingKm: true },
    });
    const notes: string[] = [];
    if (row.source === 'MANUAL') notes.push('typed by driver — check the photo');
    if (prev?.readingKm != null && row.readingKm != null) {
      if (row.readingKm < prev.readingKm) notes.push(`lower than the car's previous reading (${prev.readingKm})`);
      else if (row.readingKm - prev.readingKm > MAX_PLAUSIBLE_JUMP_KM) notes.push(`jump of ${row.readingKm - prev.readingKm} km since the previous reading`);
    }
    if (notes.length) {
      await this.prisma.tripOdometer.update({ where: { id }, data: { flagged: true, flagNote: notes.join('; ') } });
    }
  }

  // ── Office side ─────────────────────────────────────────────────────────────

  /**
   * Confirmed readings in a Cairo date range (by completion time), optionally one driver / flagged
   * only. previous / distance come from the same car's previous reading (any driver).
   */
  async list(q: { from: string; to: string; driverId?: string; vehicleId?: string; flaggedOnly?: boolean }): Promise<TripKmRow[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.from) || !/^\d{4}-\d{2}-\d{2}$/.test(q.to)) throw new BadRequestException('from / to must be YYYY-MM-DD');
    const [start, end] = cairoDayRange(q.from, q.to);
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT x.* FROM (
        SELECT t.id, t.traffic_job_id, t.driver_id, t.vehicle_id, t.reading_km, t.ai_reading_km, t.source,
               t.flagged, t.flag_note, t.confirmed_at, t.exported_at, (t.photo_url IS NOT NULL) AS has_photo,
               LAG(t.reading_km) OVER w AS previous_km,
               LAG(t.traffic_job_id) OVER w AS previous_job_id,
               LAG(t.driver_id) OVER w AS previous_driver_id
        FROM trip_odometers t
        WHERE t.confirmed_at IS NOT NULL AND t.reading_km IS NOT NULL
        WINDOW w AS (PARTITION BY t.vehicle_id ORDER BY t.confirmed_at)
      ) x
      WHERE x.confirmed_at >= ${start} AND x.confirmed_at < ${end}
        ${q.driverId ? Prisma.sql`AND x.driver_id = ${q.driverId}` : Prisma.empty}
        ${q.vehicleId ? Prisma.sql`AND x.vehicle_id = ${q.vehicleId}` : Prisma.empty}
        ${q.flaggedOnly ? Prisma.sql`AND x.flagged = true` : Prisma.empty}
      ORDER BY x.confirmed_at DESC
      LIMIT 5000`);
    if (!rows.length) return [];

    const jobIds = [...new Set(rows.flatMap((r) => [r.traffic_job_id, r.previous_job_id].filter(Boolean)))];
    const driverIds = [...new Set(rows.flatMap((r) => [r.driver_id, r.previous_driver_id].filter(Boolean)))];
    const vehicleIds = [...new Set(rows.map((r) => r.vehicle_id))];
    const [jobs, drivers, vehicles] = await Promise.all([
      this.prisma.trafficJob.findMany({ where: { id: { in: jobIds } }, select: { id: true, internalRef: true, jobDate: true, serviceType: true } }),
      this.prisma.driver.findMany({ where: { id: { in: driverIds } }, select: { id: true, name: true } }),
      this.prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, plateNumber: true, carBrand: true, carModel: true } }),
    ]);
    const J = new Map(jobs.map((j) => [j.id, j]));
    const D = new Map(drivers.map((d) => [d.id, d.name]));
    const V = new Map(vehicles.map((v) => [v.id, v]));
    return rows.map((r) => {
      const v = V.get(r.vehicle_id);
      const prev = r.previous_km == null ? null : Number(r.previous_km);
      return {
        id: r.id,
        jobId: r.traffic_job_id,
        jobRef: J.get(r.traffic_job_id)?.internalRef ?? '',
        jobDate: J.get(r.traffic_job_id)?.jobDate.toISOString().slice(0, 10) ?? '',
        serviceType: J.get(r.traffic_job_id)?.serviceType ?? '',
        driverId: r.driver_id,
        driverName: D.get(r.driver_id) ?? '',
        vehicleId: r.vehicle_id,
        plateNumber: v?.plateNumber ?? '',
        vehicleName: this.odooVehicleName(v),
        readingKm: Number(r.reading_km),
        previousKm: prev,
        previousJobRef: r.previous_job_id ? J.get(r.previous_job_id)?.internalRef ?? null : null,
        previousDriverName: r.previous_driver_id && r.previous_driver_id !== r.driver_id ? D.get(r.previous_driver_id) ?? null : null,
        distanceKm: prev == null ? null : Number(r.reading_km) - prev,
        source: r.source,
        aiReadingKm: r.ai_reading_km == null ? null : Number(r.ai_reading_km),
        flagged: r.flagged,
        flagNote: r.flag_note,
        confirmedAt: new Date(r.confirmed_at).toISOString(),
        exportedAt: r.exported_at ? new Date(r.exported_at).toISOString() : null,
        hasPhoto: r.has_photo,
      };
    });
  }

  /** Odoo Fleet shows a vehicle as "Brand/Model/Plate" — the name its import matches on. */
  private odooVehicleName(v?: { plateNumber: string; carBrand: string | null; carModel: string | null }) {
    if (!v) return '';
    return v.carBrand && v.carModel ? `${v.carBrand}/${v.carModel}/${v.plateNumber}` : v.plateNumber;
  }

  /** Office correction of a reading (e.g. AI misread): re-flags as checked by the office. */
  async correct(id: string, readingKm: number, note: string | undefined, userId: string) {
    if (!Number.isFinite(readingKm) || readingKm <= 0) throw new BadRequestException('Enter a valid kilometre reading');
    const row = await this.prisma.tripOdometer.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Reading not found');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const userName = user?.name ?? 'office';
    return this.prisma.tripOdometer.update({
      where: { id },
      data: { readingKm: Math.round(readingKm), flagged: false, flagNote: `corrected by ${userName}${note ? `: ${note}` : ''}` },
    });
  }

  /**
   * Excel for Odoo Fleet › Odometers import. Sheet 1 "Odometer" holds exactly the import columns
   * (Vehicle, Date, Odometer Value, Driver); sheet 2 "Details" is the check list. Marks the rows exported.
   */
  async exportXlsx(q: { from: string; to: string; driverId?: string; vehicleId?: string }): Promise<{ buffer: Buffer; filename: string; count: number }> {
    const rows = (await this.list(q)).slice().reverse(); // oldest first, as Odoo logs them
    const wb = new ExcelJS.Workbook();
    const odo = wb.addWorksheet('Odometer');
    odo.columns = [
      { header: 'Vehicle', key: 'vehicle', width: 34 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Odometer Value', key: 'value', width: 16 },
      { header: 'Driver', key: 'driver', width: 26 },
    ];
    for (const r of rows) {
      odo.addRow({ vehicle: r.vehicleName, date: cairoDate(new Date(r.confirmedAt)), value: r.readingKm, driver: r.driverName });
    }
    const det = wb.addWorksheet('Details');
    det.columns = [
      { header: 'Completed', key: 'date', width: 12 },
      { header: 'Time', key: 'time', width: 8 },
      { header: 'Job', key: 'job', width: 12 },
      { header: 'Job date', key: 'jobDate', width: 12 },
      { header: 'Driver', key: 'driver', width: 24 },
      { header: 'Plate', key: 'plate', width: 14 },
      { header: 'Reading (km)', key: 'km', width: 13 },
      { header: 'Previous (km)', key: 'prev', width: 13 },
      { header: 'Distance (km)', key: 'dist', width: 13 },
      { header: 'Previous job', key: 'prevJob', width: 12 },
      { header: 'Previous driver', key: 'prevDriver', width: 22 },
      { header: 'Source', key: 'source', width: 9 },
      { header: 'Check', key: 'flag', width: 44 },
    ];
    for (const r of rows) {
      const d = new Date(r.confirmedAt);
      det.addRow({
        date: cairoDate(d), time: cairoTime(d), job: r.jobRef, jobDate: r.jobDate, driver: r.driverName, plate: r.plateNumber,
        km: r.readingKm, prev: r.previousKm ?? '', dist: r.distanceKm ?? '', prevJob: r.previousJobRef ?? '',
        prevDriver: r.previousDriverName ?? '', source: r.source === 'MANUAL' ? 'Typed' : 'AI', flag: r.flagged ? r.flagNote ?? 'check' : '',
      });
    }
    for (const ws of [odo, det]) ws.getRow(1).font = { bold: true };
    const ids = rows.filter((r) => !r.exportedAt).map((r) => r.id);
    if (ids.length) await this.prisma.tripOdometer.updateMany({ where: { id: { in: ids } }, data: { exportedAt: new Date() } });
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const filename = `odoo-odometer_${q.from}${q.to !== q.from ? `_${q.to}` : ''}.xlsx`;
    return { buffer, filename, count: rows.length };
  }

  /** The morning reminder: yesterday's (or a given day's) readings and own-fleet completions missing one. */
  async summary(day?: string) {
    const date = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : this.yesterday();
    const rows = await this.list({ from: date, to: date });
    const completedOwnFleet = await this.prisma.trafficAssignment.count({
      where: {
        driverStatus: 'COMPLETED',
        vehicle: { ownership: 'OWNED' },
        trafficJob: { jobDate: new Date(`${date}T00:00:00Z`), deletedAt: null },
      },
    });
    const withReading = await this.prisma.tripOdometer.count({
      where: { confirmedAt: { not: null }, trafficJob: { jobDate: new Date(`${date}T00:00:00Z`) } },
    });
    return {
      date,
      trips: rows.length,
      flagged: rows.filter((r) => r.flagged).length,
      notExported: rows.filter((r) => !r.exportedAt).length,
      totalKm: rows.reduce((s, r) => s + (r.distanceKm && r.distanceKm > 0 ? r.distanceKm : 0), 0),
      missingReadings: Math.max(0, completedOwnFleet - withReading),
    };
  }

  private yesterday() {
    const t = new Date(`${todayCairo()}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() - 1);
    return t.toISOString().slice(0, 10);
  }

  /** The odometer photo (Drive or local). */
  async photo(id: string) {
    const row = await this.prisma.tripOdometer.findUnique({ where: { id }, select: { photoUrl: true } });
    if (!row?.photoUrl) throw new NotFoundException('No photo');
    if (isDriveFileId(row.photoUrl)) {
      const r = await this.drive.getFileStream(row.photoUrl);
      if (!r) throw new NotFoundException('Photo not available (Drive not reachable)');
      return { stream: r.stream as Readable, mimeType: r.mimeType };
    }
    const local = path.join(process.cwd(), row.photoUrl.replace(/^\/+/, ''));
    if (!local.startsWith(path.join(process.cwd(), 'uploads')) || !fs.existsSync(local)) throw new NotFoundException('No photo');
    return { stream: fs.createReadStream(local) as unknown as Readable, mimeType: 'image/jpeg' };
  }
}
