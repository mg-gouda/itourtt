import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { tap, switchMap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Sensitive fields stripped from logged request bodies */
const SENSITIVE_KEYS = new Set([
  // Credentials / tokens
  'password',
  'passwordHash',
  'refreshToken',
  'accessToken',
  'token',
  'secret',
  'passwordResetToken',
  'twoFactorSecret',
  'twoFactorRecoveryCodes',
  // PII — kept out of the (exportable, 90-day) activity_logs table
  'taxId',
  'nationalId',
  'address',
  'phone',
  'mobile',
  'clientMobile',
  'phoneNumber',
  'whatsapp',
  'email',
  'iban',
  'bankName',
  'bankAccount',
  'accountNumber',
]);

/** Map URL segment → human-readable entity name */
const ENTITY_MAP: Record<string, string> = {
  users: 'User',
  agents: 'Agent',
  customers: 'Customer',
  suppliers: 'Supplier',
  drivers: 'Driver',
  reps: 'Rep',
  vehicles: 'Vehicle',
  locations: 'Location',
  'traffic-jobs': 'TrafficJob',
  dispatch: 'Dispatch',
  finance: 'Finance',
  invoices: 'Invoice',
  'job-locks': 'JobLock',
  permissions: 'Permission',
  settings: 'Settings',
  'vehicle-types': 'VehicleType',
  reports: 'Report',
  whatsapp: 'Whatsapp',
  'activity-logs': 'ActivityLog',
  'driver-portal': 'DriverPortal',
  'rep-portal': 'RepPortal',
  'supplier-portal': 'SupplierPortal',
};

/** Map URL segment → Prisma model delegate, used to snapshot a record's state
 *  BEFORE an update/delete so the Activity Log can show an old → new diff. */
const MODEL_MAP: Record<string, string> = {
  users: 'user',
  agents: 'agent',
  customers: 'customer',
  suppliers: 'supplier',
  drivers: 'driver',
  reps: 'rep',
  vehicles: 'vehicle',
  'vehicle-types': 'vehicleType',
  'traffic-jobs': 'trafficJob',
  invoices: 'invoice',
};

/** UUID v4 regex */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AuditEntry = {
  userId: string;
  userName: string;
  action: string;
  entity: string;
  entityId: string | null;
  /** Traffic job this action touched, when one is resolvable. */
  jobId: string | null;
  /** The job's internal reference — denormalised so the Activity Log can show
   *  and search by Job ID without joining. Resolved at flush time. */
  jobRef: string | null;
  summary: string;
  details?: Record<string, unknown>;
  previousData?: Record<string, unknown>;
  ipAddress: string | null;
  /** Transient: a dispatch assignment id whose job is resolved at flush time.
   *  Stripped before the row is written. */
  assignmentId?: string | null;
};

const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_BATCH_SIZE = 200;

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AuditLog');
  private queue: AuditEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, ip } = request;
    const user = request.user;

    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    // Skip auth endpoints (login, refresh) and activity-log reads
    const path = url.split('?')[0];
    if (path.includes('/auth/')) {
      return next.handle();
    }

    const userId = user?.id || user?.sub;
    const userName = user?.email || 'anonymous';

    // Unauthenticated requests are never logged — skip the before-snapshot too.
    if (!userId) return next.handle();

    // For updates/deletes, snapshot the record's current state BEFORE the
    // handler mutates it, so the log can render an old → new comparison.
    return from(this.captureBefore(method, path)).pipe(
      switchMap((before) =>
        next.handle().pipe(
          tap((response) => {
            this.enqueue(
              method,
              path,
              userId,
              userName,
              body,
              ip,
              before,
              response,
            );
          }),
        ),
      ),
    );
  }

  /** Fetch the existing record for an UPDATE/DELETE so we can diff old → new.
   *  Only runs for top-level mapped entities addressed by a UUID (not
   *  sub-resources, where the addressed id is the parent, not the target). */
  private async captureBefore(
    method: string,
    path: string,
  ): Promise<Record<string, unknown> | null> {
    if (method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE')
      return null;

    const segments = path
      .replace(/^\/api\//, '')
      .split('/')
      .filter(Boolean);

    const model = MODEL_MAP[segments[0]];
    const id = segments[1];
    // Require a direct /<entity>/<uuid> target with no sub-resource.
    if (
      !model ||
      !id ||
      !UUID_RE.test(id) ||
      (segments[2] && !UUID_RE.test(segments[2]))
    ) {
      return null;
    }

    try {
      const delegate = (
        this.prisma as unknown as Record<
          string,
          { findUnique?: (args: unknown) => Promise<unknown> } | undefined
        >
      )[model];
      if (!delegate?.findUnique) return null;
      const record = await delegate.findUnique({ where: { id } });
      // Round-trip through JSON so Date/Decimal become plain serializable values.
      return record
        ? this.sanitizeBody(
            JSON.parse(JSON.stringify(record)) as Record<string, unknown>,
          )
        : null;
    } catch {
      return null;
    }
  }

  private enqueue(
    method: string,
    path: string,
    userId: string | undefined,
    userName: string,
    body: any,
    ip: string,
    before?: Record<string, unknown> | null,
    response?: unknown,
  ) {
    if (!userId) return;

    const action = this.methodToAction(method);
    const { entity, entityId } = this.parseEntityFromPath(path);
    const job = this.resolveJob(path, entity, entityId, body, before, response);
    const sanitized = this.sanitizeBody(body);

    this.queue.push({
      userId,
      userName,
      action,
      entity,
      entityId,
      jobId: job.jobId,
      jobRef: job.jobRef,
      assignmentId: job.assignmentId,
      // Finalised in flush(), once jobRef has been resolved for the batch.
      summary: '',
      details:
        sanitized && Object.keys(sanitized).length > 0 ? sanitized : undefined,
      previousData:
        before && Object.keys(before).length > 0 ? before : undefined,
      ipAddress: ip || null,
    });

    // Flush immediately if batch is full
    if (this.queue.length >= FLUSH_BATCH_SIZE) {
      this.flush();
      return;
    }

    // Schedule a flush if not already scheduled
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), FLUSH_INTERVAL_MS);
    }
  }

  private flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, FLUSH_BATCH_SIZE);
    void this.resolveJobRefs(batch)
      .catch(() => {
        // A failed lookup only costs the Job ID column — still write the rows.
      })
      .then(() => {
        // `assignmentId` is transient scaffolding — never persisted.
        const data = batch.map((row) => ({
          userId: row.userId,
          userName: row.userName,
          action: row.action,
          entity: row.entity,
          entityId: row.entityId,
          jobId: row.jobId,
          jobRef: row.jobRef,
          summary: this.buildSummary(row),
          details: row.details,
          previousData: row.previousData,
          ipAddress: row.ipAddress,
        }));
        return this.prisma.activityLog.createMany({ data: data as any });
      })
      .catch((err) =>
        this.logger.warn(`Failed to flush audit logs: ${err.message}`),
      );
  }

  /** "UPDATE TrafficJob (ITT-00123)" — falls back to a short record id. */
  private buildSummary(entry: Omit<AuditEntry, 'assignmentId'>): string {
    const ref =
      entry.jobRef ??
      (entry.entityId ? `${entry.entityId.slice(0, 8)}…` : null);
    return `${entry.action} ${entry.entity}${ref ? ` (${ref})` : ''}`;
  }

  /** Fill in `jobRef` for queued entries: one lookup per batch, resolving both
   *  direct job ids and dispatch assignment ids. */
  private async resolveJobRefs(batch: AuditEntry[]): Promise<void> {
    const assignmentIds = [
      ...new Set(
        batch
          .filter((e) => !e.jobId && e.assignmentId)
          .map((e) => e.assignmentId!),
      ),
    ];
    if (assignmentIds.length > 0) {
      const assignments = await this.prisma.trafficAssignment.findMany({
        where: { id: { in: assignmentIds } },
        select: { id: true, trafficJobId: true },
      });
      const byId = new Map(assignments.map((a) => [a.id, a.trafficJobId]));
      for (const entry of batch) {
        if (!entry.jobId && entry.assignmentId) {
          entry.jobId = byId.get(entry.assignmentId) ?? null;
        }
      }
    }

    const jobIds = [
      ...new Set(
        batch.filter((e) => e.jobId && !e.jobRef).map((e) => e.jobId!),
      ),
    ];
    if (jobIds.length === 0) return;

    const jobs = await this.prisma.trafficJob.findMany({
      where: { id: { in: jobIds } },
      select: { id: true, internalRef: true },
    });
    const refById = new Map(jobs.map((j) => [j.id, j.internalRef]));
    for (const entry of batch) {
      if (entry.jobId && !entry.jobRef) {
        entry.jobRef = refById.get(entry.jobId) ?? null;
        // Candidate ids come from URLs and request bodies — drop the ones that
        // turn out not to be traffic jobs rather than storing a bogus link.
        if (!entry.jobRef) entry.jobId = null;
      }
    }
  }

  /**
   * Work out which traffic job an audited request touched. Job ids reach us in
   * four shapes, checked in order of reliability:
   *   1. the response of a create (`POST /traffic-jobs` returns the new job)
   *   2. the URL — `/traffic-jobs/:id`, `.../jobs/:id/...`, `/job-locks/:scope/:id/...`
   *   3. the request body — `trafficJobId` / `jobId` (dispatch assign, fees, …)
   *   4. the before-snapshot of a traffic job row
   * `/dispatch/assignments/:id` addresses the assignment, not the job, so its
   * id is carried through and resolved at flush time.
   */
  private resolveJob(
    path: string,
    entity: string,
    entityId: string | null,
    body: unknown,
    before: Record<string, unknown> | null | undefined,
    response: unknown,
  ): {
    jobId: string | null;
    jobRef: string | null;
    assignmentId: string | null;
  } {
    const segments = path
      .replace(/^\/api\//, '')
      .split('/')
      .filter(Boolean);

    // 1. Response of a job create/update — carries both id and reference.
    const asRecord = (value: unknown): Record<string, unknown> | null =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    const resBody = asRecord(response);
    const resJob = asRecord(resBody?.job) ?? resBody;
    if (
      entity.startsWith('TrafficJob') &&
      resJob &&
      typeof resJob.internalRef === 'string' &&
      typeof resJob.id === 'string' &&
      UUID_RE.test(resJob.id)
    ) {
      return {
        jobId: resJob.id,
        jobRef: resJob.internalRef,
        assignmentId: null,
      };
    }

    // 2. URL-addressed job.
    const fromPath = (): string | null => {
      if (segments[0] === 'traffic-jobs' && UUID_RE.test(segments[1] ?? '')) {
        return segments[1];
      }
      // `<portal>/jobs/:jobId/...`
      const jobsAt = segments.indexOf('jobs');
      if (jobsAt !== -1 && UUID_RE.test(segments[jobsAt + 1] ?? '')) {
        return segments[jobsAt + 1];
      }
      // `job-locks/<scope>/:jobId/(lock|unlock)`
      if (segments[0] === 'job-locks' && UUID_RE.test(segments[2] ?? '')) {
        return segments[2];
      }
      return null;
    };
    const pathJobId = fromPath();
    if (pathJobId)
      return { jobId: pathJobId, jobRef: null, assignmentId: null };

    // 3. Job id in the request body.
    const bodyObj = asRecord(body);
    for (const key of ['trafficJobId', 'jobId']) {
      const value = bodyObj?.[key];
      if (typeof value === 'string' && UUID_RE.test(value)) {
        return { jobId: value, jobRef: null, assignmentId: null };
      }
    }

    // 4. Before-snapshot of the traffic job row itself.
    if (
      entity.startsWith('TrafficJob') &&
      typeof before?.internalRef === 'string' &&
      typeof before?.id === 'string'
    ) {
      return {
        jobId: before.id,
        jobRef: before.internalRef,
        assignmentId: null,
      };
    }
    if (entity.startsWith('TrafficJob') && entityId) {
      return { jobId: entityId, jobRef: null, assignmentId: null };
    }

    // Dispatch assignment — resolved to its job at flush time.
    if (
      segments[0] === 'dispatch' &&
      segments[1] === 'assignments' &&
      UUID_RE.test(segments[2] ?? '')
    ) {
      return { jobId: null, jobRef: null, assignmentId: segments[2] };
    }

    return { jobId: null, jobRef: null, assignmentId: null };
  }

  private methodToAction(method: string): string {
    switch (method) {
      case 'POST':
        return 'CREATE';
      case 'PUT':
      case 'PATCH':
        return 'UPDATE';
      case 'DELETE':
        return 'DELETE';
      default:
        return method;
    }
  }

  private parseEntityFromPath(path: string): {
    entity: string;
    entityId: string | null;
  } {
    // path: /api/agents/uuid, /api/agents/uuid/price-list,
    //       /api/dispatch/assignments/uuid, /api/driver-portal/jobs/uuid/completed
    const segments = path
      .replace(/^\/api\//, '')
      .split('/')
      .filter(Boolean);

    // Map first segment to friendly name
    let entity = ENTITY_MAP[segments[0]] || segments[0] || 'Unknown';

    // The addressed record id is the first UUID ANYWHERE in the path, not just
    // segment 1. `/dispatch/assignments/:id` and `/driver-portal/jobs/:id/...`
    // carry it deeper; recording it is what lets a row be traced back to its
    // assignment or job afterwards. Before this, every dispatch edit and every
    // portal action stored a null id and could never be linked to its job.
    const idAt = segments.findIndex((s) => UUID_RE.test(s));
    const entityId: string | null = idAt === -1 ? null : segments[idAt];

    // Sub-resource: the first non-UUID segment after the id — or segment 2 when
    // the path carries no id at all. `/agents/:id/price-list` → "Agent.PriceList",
    // `/driver-portal/jobs/:id/completed` → "DriverPortal.Completed".
    const sub = segments[idAt === -1 ? 2 : idAt + 1];
    if (sub && !UUID_RE.test(sub)) {
      const subEntity = sub
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
      entity = `${entity}.${subEntity}`;
    }

    return { entity, entityId };
  }

  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') return null;
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
      if (SENSITIVE_KEYS.has(key)) {
        clean[key] = '***';
      } else {
        clean[key] = value;
      }
    }
    return clean;
  }
}
