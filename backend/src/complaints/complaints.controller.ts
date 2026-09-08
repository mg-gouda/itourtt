import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { ComplaintsService } from './complaints.service.js';
import { CreateComplaintDto } from './dto/create-complaint.dto.js';
import { UpdateComplaintDto } from './dto/update-complaint.dto.js';
import { TransitionComplaintDto } from './dto/transition-complaint.dto.js';
import { ComplaintQueryDto } from './dto/complaint-query.dto.js';
import { ComplaintChargesService } from './complaint-charges.service.js';
import {
  CreateComplaintChargeDto,
  VoidComplaintChargeDto,
} from './dto/create-complaint-charge.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';

/** Each outcome move has its own permission key, so "may answer" ≠ "may decide". */
const TRANSITION_PERMISSIONS: Record<string, string> = {
  UNDER_REVIEW: 'complaints.transition.review',
  REPLIED: 'complaints.transition.reply',
  ESCALATED: 'complaints.transition.escalate',
  WON: 'complaints.transition.resolve',
  PARTIALLY_LOST: 'complaints.transition.resolve',
  LOST: 'complaints.transition.resolve',
  CANCELLED: 'complaints.transition.cancel',
};

@Controller('complaints')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ComplaintsController {
  constructor(
    private readonly complaintsService: ComplaintsService,
    private readonly chargesService: ComplaintChargesService,
    private readonly permissionsGuard: PermissionsGuard,
  ) {}

  @Get()
  @Permissions('complaints.view', 'complaints')
  async findAll(@Query() query: ComplaintQueryDto, @CurrentUser('id') userId: string) {
    return this.complaintsService.findAll(query, userId);
  }

  @Get('job/:jobId')
  @Permissions('complaints.view', 'complaints')
  async findByJob(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @CurrentUser('id') userId: string,
  ) {
    return new ApiResponse(await this.complaintsService.findByJob(jobId, userId));
  }

  @Get(':id')
  @Permissions('complaints.view', 'complaints')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return new ApiResponse(await this.complaintsService.findOne(id, userId));
  }

  @Post()
  @Permissions('complaints.addButton')
  async create(@Body() dto: CreateComplaintDto, @CurrentUser('id') userId: string) {
    const complaint = await this.complaintsService.create(dto, userId);
    return new ApiResponse(complaint, 'Complaint logged');
  }

  @Patch(':id')
  @Permissions('complaints.editButton')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateComplaintDto,
    @CurrentUser('id') userId: string,
  ) {
    await this.assertMayEditAmounts(dto, userId);
    const complaint = await this.complaintsService.update(id, dto);
    return new ApiResponse(complaint, 'Complaint updated');
  }

  /**
   * Status changes are gated per target state rather than by one blanket key,
   * so a role can be allowed to reply without being allowed to decide the outcome.
   */
  @Post(':id/transition')
  @Permissions(
    'complaints.transition.review',
    'complaints.transition.reply',
    'complaints.transition.escalate',
    'complaints.transition.resolve',
    'complaints.transition.cancel',
  )
  async transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionComplaintDto,
    @CurrentUser('id') userId: string,
  ) {
    const required = TRANSITION_PERMISSIONS[dto.status];
    const granted = await this.permissionsGuard.getUserPermissions(userId);
    if (!required || !granted.has(required)) {
      throw new ForbiddenException(
        `You do not have permission to move a complaint to ${dto.status}.`,
      );
    }

    const complaint = await this.complaintsService.transition(id, dto, userId);
    return new ApiResponse(complaint, `Complaint marked ${dto.status}`);
  }

  @Patch(':id/assign')
  @Permissions('complaints.assign')
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('assignedToId') assignedToId: string | null,
  ) {
    const complaint = await this.complaintsService.assign(id, assignedToId ?? null);
    return new ApiResponse(complaint, 'Complaint assigned');
  }

  // ─────────────────────────────────────────────
  // PARTY CHARGE — raise, approve, post, void
  //
  // Four separate keys on purpose: raising a deduction, agreeing to it and
  // actually writing it to someone's pay are different decisions.
  // ─────────────────────────────────────────────

  @Post(':id/charge')
  @Permissions('complaints.charge.create')
  async createCharge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateComplaintChargeDto,
    @CurrentUser('id') userId: string,
  ) {
    const charge = await this.chargesService.create(id, dto, userId);
    return new ApiResponse(charge, 'Charge raised');
  }

  @Post(':id/charge/approve')
  @Permissions('complaints.charge.approve')
  async approveCharge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const charge = await this.chargesService.approve(id, userId);
    return new ApiResponse(charge, 'Charge approved');
  }

  /** The only call that writes to a fee table. */
  @Post(':id/charge/post')
  @Permissions('complaints.charge.post')
  async postCharge(@Param('id', ParseUUIDPipe) id: string) {
    const charge = await this.chargesService.post(id);
    return new ApiResponse(charge, 'Charge posted to the party fee');
  }

  @Post(':id/charge/void')
  @Permissions('complaints.charge.void')
  async voidCharge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidComplaintChargeDto,
  ) {
    const charge = await this.chargesService.void(id, dto);
    return new ApiResponse(charge, 'Charge voided');
  }

  @Delete(':id')
  @Permissions('complaints.deleteButton')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return new ApiResponse(await this.complaintsService.remove(id), 'Complaint deleted');
  }

  /**
   * complaints.editButton alone must not let someone set the money. The amount
   * fields need financial.editAmounts on top of it.
   */
  private async assertMayEditAmounts(dto: UpdateComplaintDto, userId: string) {
    const touchesMoney =
      dto.claimedAmount !== undefined ||
      dto.lossAmount !== undefined ||
      dto.currency !== undefined ||
      dto.exchangeRate !== undefined;

    if (!touchesMoney) return;

    const granted = await this.permissionsGuard.getUserPermissions(userId);
    if (!granted.has('complaints.financial.editAmounts')) {
      throw new ForbiddenException(
        'You do not have permission to change the claimed or loss amount on a complaint.',
      );
    }
  }
}
