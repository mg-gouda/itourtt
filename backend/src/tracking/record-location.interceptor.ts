import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, finalize } from 'rxjs';
import { TrackingService, TrackedRole, isValidCoord } from './tracking.service.js';

/**
 * Applied to the rep/driver portal controllers: any request whose body carries
 * `latitude`/`longitude` (status updates, evidence submissions — JSON or
 * multipart) also refreshes the sender's last-known position for the tracking
 * maps.
 *
 * Runs in `finalize`, i.e. after the handler, because multipart bodies are only
 * parsed by the method-level FilesInterceptor. It records on failure too: a
 * submission refused by the geofence still tells us where the phone really is.
 */
@Injectable()
export class RecordLocationInterceptor implements NestInterceptor {
  constructor(private readonly tracking: TrackingService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    return next.handle().pipe(
      finalize(() => {
        const user = req.user;
        const role = user?.role as string | undefined;
        if (role !== 'REP' && role !== 'DRIVER') return;
        const userId = user?.sub || user?.id;
        const lat = req.body?.latitude;
        const lng = req.body?.longitude;
        if (!userId || lat == null || lng == null || !isValidCoord(lat, lng)) return;
        void this.tracking.record(userId, role as TrackedRole, Number(lat), Number(lng), 'STATUS');
      }),
    );
  }
}
