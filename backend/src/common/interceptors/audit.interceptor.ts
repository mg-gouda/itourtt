import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Sensitive fields stripped from logged request bodies */
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'refreshToken',
  'accessToken',
  'token',
  'secret',
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
  summary: string;
  details?: Record<string, unknown>;
  ipAddress: string | null;
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

    return next.handle().pipe(
      tap(() => {
        this.enqueue(method, path, userId, userName, body, ip);
      }),
    );
  }

  private enqueue(
    method: string,
    path: string,
    userId: string | undefined,
    userName: string,
    body: any,
    ip: string,
  ) {
    if (!userId) return;

    const action = this.methodToAction(method);
    const { entity, entityId } = this.parseEntityFromPath(path);
    const summary = `${action} ${entity}${entityId ? ` (${entityId.slice(0, 8)}…)` : ''}`;
    const sanitized = this.sanitizeBody(body);

    this.queue.push({
      userId,
      userName,
      action,
      entity,
      entityId,
      summary,
      details: sanitized && Object.keys(sanitized).length > 0 ? sanitized : undefined,
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
    this.prisma.activityLog
      .createMany({ data: batch as any })
      .catch((err) => this.logger.warn(`Failed to flush audit logs: ${err.message}`));
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
    // path: /api/agents/uuid or /api/agents/uuid/price-list
    const segments = path
      .replace(/^\/api\//, '')
      .split('/')
      .filter(Boolean);

    let entity = segments[0] || 'Unknown';
    let entityId: string | null = null;

    // Map first segment to friendly name
    entity = ENTITY_MAP[entity] || entity;

    // Look for UUID in second segment
    if (segments[1] && UUID_RE.test(segments[1])) {
      entityId = segments[1];
    }

    // If there's a sub-resource (e.g. /agents/uuid/price-list), append it
    if (segments[2] && !UUID_RE.test(segments[2])) {
      const subEntity = segments[2]
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
