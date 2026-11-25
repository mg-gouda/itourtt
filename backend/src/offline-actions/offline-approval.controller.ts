import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { runAt } from '../common/utils/request-clock.js';
import { RepPortalService } from '../rep-portal/rep-portal.service.js';
import { DriverPortalService } from '../driver-portal/driver-portal.service.js';
import { OfflineActionsService } from './offline-actions.service.js';

/**
 * Job Control › Offline actions (6.9.0): rep / driver actions done offline that arrived more than
 * 2 hours late. Approve = apply it now, at the time it was really done (same rules as live:
 * status order, geofence on the recorded GPS, time windows at that time); Reject = drop it.
 */
@Controller('offline-actions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('job-control', 'dispatch', 'traffic-jobs')
export class OfflineApprovalController {
  constructor(
    private readonly offline: OfflineActionsService,
    private readonly reps: RepPortalService,
    private readonly drivers: DriverPortalService,
  ) {}

  @Get()
  async list(@Query('status') status?: string) {
    return new ApiResponse(await this.offline.list(status || 'PENDING'));
  }

  @Post(':id/approve')
  async approve(@Param('id') id: string, @CurrentUser('id') officeUserId: string) {
    const r = await this.offline.get(id);
    const p = (r.payload ?? {}) as { status?: string; collected?: boolean };
    const lat = r.latitude ?? null;
    const lng = r.longitude ?? null;
    try {
      await runAt(r.occurredAt, true, async () => {
        if (r.role === 'REP') {
          if (r.kind === 'IN_PLACE') return this.reps.submitInPlace(r.userId, r.trafficJobId, r.imageUrls, lat, lng);
          if (r.kind === 'COMPLETED') return this.reps.submitCompleted(r.userId, r.trafficJobId, r.imageUrls, lat, lng);
          if (r.kind === 'NO_SHOW') return this.reps.submitNoShow(r.userId, r.trafficJobId, r.imageUrls, lat, lng);
          if (r.kind === 'STATUS' && p.status) return this.reps.updateJobStatus(r.userId, r.trafficJobId, p.status as never, lat, lng);
        } else {
          if (r.kind === 'IN_PROGRESS') return this.drivers.submitInProgress(r.userId, r.trafficJobId, r.imageUrls, lat, lng);
          if (r.kind === 'COMPLETED') return this.drivers.submitCompleted(r.userId, r.trafficJobId, r.imageUrls, lat, lng);
          if (r.kind === 'NO_SHOW') return this.drivers.submitNoShow(r.userId, r.trafficJobId, r.imageUrls, lat, lng);
          if (r.kind === 'STATUS' && p.status) return this.drivers.updateJobStatus(r.userId, r.trafficJobId, p.status as never, lat, lng);
          if (r.kind === 'COLLECTED') return this.drivers.markCollected(r.userId, r.trafficJobId, p.collected !== false);
        }
        throw new BadRequestException(`Cannot apply ${r.kind}`);
      });
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? 'Could not apply';
      await this.offline.decide(id, 'FAILED', officeUserId, msg);
      throw new BadRequestException(`Could not apply: ${msg}`);
    }
    return new ApiResponse(await this.offline.decide(id, 'APPROVED', officeUserId), 'Applied at the time it was done');
  }

  @Post(':id/reject')
  async reject(@Param('id') id: string, @CurrentUser('id') officeUserId: string, @Body() body: { note?: string }) {
    await this.offline.get(id);
    return new ApiResponse(await this.offline.decide(id, 'REJECTED', officeUserId, body?.note), 'Rejected');
  }
}
