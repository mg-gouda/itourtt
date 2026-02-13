import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { DispatchService } from './dispatch.service.js';
import { DispatchDayDto } from './dto/dispatch-day.dto.js';
import { AssignJobDto } from './dto/assign-job.dto.js';
import { ReassignJobDto } from './dto/reassign-job.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';

@Controller('dispatch')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'MANAGER', 'DISPATCHER')
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  @Get('day')
  async getDayView(@Query() query: DispatchDayDto) {
    const result = await this.dispatchService.getDayView(query.date);
    return new ApiResponse(result);
  }

  @Post('assign')
  async assignJob(
    @Body() dto: AssignJobDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
    @CurrentUser('roleSlug') roleSlug: string,
  ) {
    const assignment = await this.dispatchService.assignJob(dto, userId, userRole, roleSlug);
    return new ApiResponse(assignment, 'Job assigned successfully');
  }

  @Patch('assignments/:id')
  async reassignJob(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReassignJobDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
    @CurrentUser('roleSlug') roleSlug: string,
  ) {
    const assignment = await this.dispatchService.reassignJob(id, dto, userId, userRole, roleSlug);
    return new ApiResponse(assignment, 'Job reassigned successfully');
  }

  @Delete('assignments/:id')
  async unassignJob(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('role') userRole: string,
    @CurrentUser('roleSlug') roleSlug: string,
  ) {
    const result = await this.dispatchService.unassignJob(id, userRole, roleSlug);
    return new ApiResponse(result, 'Job unassigned successfully');
  }

  @Get('available-suppliers')
  async getAvailableSuppliers() {
    const suppliers = await this.dispatchService.getAvailableSuppliers();
    return new ApiResponse(suppliers);
  }

  @Get('available-vehicles')
  async getAvailableVehicles(
    @Query() query: DispatchDayDto,
    @Query('supplierId') supplierId?: string,
  ) {
    const vehicles = await this.dispatchService.getAvailableVehicles(query.date, supplierId);
    return new ApiResponse(vehicles);
  }

  @Get('available-drivers')
  async getAvailableDrivers(
    @Query() query: DispatchDayDto,
    @Query('jobId') jobId?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    const drivers = await this.dispatchService.getAvailableDrivers(query.date, jobId, supplierId);
    return new ApiResponse(drivers);
  }

  @Get('available-reps')
  async getAvailableReps(
    @Query() query: DispatchDayDto,
    @Query('jobId') jobId?: string,
  ) {
    const reps = await this.dispatchService.getAvailableReps(query.date, jobId);
    return new ApiResponse(reps);
  }

  @Post('jobs/:id/unlock')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('dispatch.assignment.unlock48h')
  async unlockJob(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.dispatchService.unlockJob(id, userId);
    return new ApiResponse(result, 'Job unlocked for dispatch editing');
  }

  @Post('jobs/:id/lock')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('dispatch.assignment.unlock48h')
  async lockJob(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.dispatchService.lockJob(id);
    return new ApiResponse(result, 'Job locked for dispatch editing');
  }
}
