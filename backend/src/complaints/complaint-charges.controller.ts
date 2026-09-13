import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ComplaintChargesService } from './complaint-charges.service.js';
import {
  CreateComplaintChargeDto,
  UpdateComplaintChargeDto,
  VoidComplaintChargeDto,
} from './dto/create-complaint-charge.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';

/**
 * Deductions, addressed by the job they are on rather than by a complaint.
 *
 * A deduction is raised where it is noticed — usually the dispatch grid, before
 * anyone has written the complaint up — so these routes never require one. Four
 * separate keys on purpose: raising a deduction, agreeing to it and actually
 * writing it to someone's pay are different decisions, and
 * `dispatch.deductionButton` is what puts the button on the grid at all.
 */
@Controller('complaint-charges')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ComplaintChargesController {
  constructor(private readonly chargesService: ComplaintChargesService) {}

  /** Every deduction standing on one job — what the grid dialog opens with. */
  @Get()
  @Permissions('dispatch.deductionButton', 'complaints.charge.create')
  async findByJob(@Query('trafficJobId', ParseUUIDPipe) trafficJobId: string) {
    return new ApiResponse(await this.chargesService.findByJob(trafficJobId));
  }

  @Post()
  @Permissions('dispatch.deductionButton', 'complaints.charge.create')
  async create(
    @Body() dto: CreateComplaintChargeDto,
    @CurrentUser('id') userId: string,
  ) {
    const charge = await this.chargesService.create(dto, userId);
    return new ApiResponse(charge, 'Deduction recorded');
  }

  /** Overriding the amount a dispatcher typed, while it is still PENDING. */
  @Patch(':id')
  @Permissions('dispatch.deductionButton', 'complaints.charge.create')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateComplaintChargeDto,
  ) {
    const charge = await this.chargesService.update(id, dto);
    return new ApiResponse(charge, 'Deduction updated');
  }

  @Post(':id/approve')
  @Permissions('complaints.charge.approve')
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const charge = await this.chargesService.approve(id, userId);
    return new ApiResponse(charge, 'Charge approved');
  }

  /** The only call that writes to a fee table. */
  @Post(':id/post')
  @Permissions('complaints.charge.post')
  async post(@Param('id', ParseUUIDPipe) id: string) {
    const charge = await this.chargesService.post(id);
    return new ApiResponse(charge, 'Charge posted to the party fee');
  }

  @Post(':id/void')
  @Permissions('complaints.charge.void')
  async void(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidComplaintChargeDto,
  ) {
    const charge = await this.chargesService.void(id, dto);
    return new ApiResponse(charge, 'Charge voided');
  }
}
