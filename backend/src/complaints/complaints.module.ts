import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ComplaintsController } from './complaints.controller.js';
import { ComplaintsService } from './complaints.service.js';
import { ComplaintCategoriesController } from './complaint-categories.controller.js';
import { ComplaintCategoriesService } from './complaint-categories.service.js';
import { ComplaintChargesService } from './complaint-charges.service.js';
import { AgentAdjustmentsController } from './agent-adjustments.controller.js';
import { AgentAdjustmentsService } from './agent-adjustments.service.js';
import { ComplaintScoringService } from './complaint-scoring.service.js';
import { ComplaintSlaService } from './complaint-sla.service.js';
import { ComplaintAnalyticsService } from './complaint-analytics.service.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';

@Module({
  controllers: [
    ComplaintsController,
    ComplaintCategoriesController,
    AgentAdjustmentsController,
  ],
  // PermissionsGuard is provided here as well as globally: the service and
  // controller resolve permission keys through it to gate the money fields,
  // and it shares the same static 5-minute cache either way.
  providers: [
    ComplaintsService,
    ComplaintCategoriesService,
    ComplaintChargesService,
    AgentAdjustmentsService,
    ComplaintScoringService,
    ComplaintSlaService,
    ComplaintAnalyticsService,
    PermissionsGuard,
    Reflector,
  ],
  exports: [ComplaintsService, ComplaintCategoriesService, AgentAdjustmentsService],
})
export class ComplaintsModule {}
