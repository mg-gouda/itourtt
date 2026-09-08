import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { AgentAdjustmentsService } from './agent-adjustments.service.js';
import {
  AgentAdjustmentQueryDto,
  AdjustmentDispositionDto,
  AttachAdjustmentDto,
} from './dto/agent-adjustment.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';

@Controller('agent-adjustments')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class AgentAdjustmentsController {
  constructor(
    private readonly adjustmentsService: AgentAdjustmentsService,
    private readonly permissionsGuard: PermissionsGuard,
  ) {}

  @Get()
  @Permissions('finance.agentAdjustments.view')
  async findAll(@Query() query: AgentAdjustmentQueryDto) {
    return this.adjustmentsService.findAll(query);
  }

  @Get('agent/:agentId/pending')
  @Permissions('finance.agentAdjustments.view')
  async pendingForAgent(@Param('agentId', ParseUUIDPipe) agentId: string) {
    return new ApiResponse(await this.adjustmentsService.pendingForAgent(agentId));
  }

  @Get(':id')
  @Permissions('finance.agentAdjustments.view')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return new ApiResponse(await this.adjustmentsService.findOne(id));
  }

  @Post(':id/attach')
  @Permissions('finance.agentAdjustments.onInvoice')
  async attach(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachAdjustmentDto,
  ) {
    const adjustment = await this.adjustmentsService.attachToInvoice(id, dto);
    return new ApiResponse(adjustment, 'Adjustment added to the invoice');
  }

  /**
   * Credit note and waive share one endpoint but not one permission — each
   * disposition is checked against its own key before anything happens.
   */
  @Post(':id/disposition')
  @Permissions('finance.agentAdjustments.creditNote', 'finance.agentAdjustments.waive')
  async disposition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustmentDispositionDto,
    @CurrentUser('id') userId: string,
  ) {
    const required =
      dto.disposition === 'CREDIT_NOTE'
        ? 'finance.agentAdjustments.creditNote'
        : 'finance.agentAdjustments.waive';

    const granted = await this.permissionsGuard.getUserPermissions(userId);
    if (!granted.has(required)) {
      throw new ForbiddenException(
        dto.disposition === 'CREDIT_NOTE'
          ? 'You do not have permission to issue credit notes.'
          : 'You do not have permission to waive adjustments.',
      );
    }

    if (dto.disposition === 'CREDIT_NOTE') {
      const adjustment = await this.adjustmentsService.issueCreditNote(id, dto, userId);
      return new ApiResponse(adjustment, 'Credit note issued');
    }

    const adjustment = await this.adjustmentsService.waive(id, dto);
    return new ApiResponse(adjustment, 'Adjustment waived');
  }
}
