import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JobLocksService } from './job-locks.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';

@Controller('job-locks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class JobLocksController {
  constructor(private readonly jobLocksService: JobLocksService) {}

  // ─── DISPATCHER ───

  @Get('dispatcher')
  @Permissions('job-locks.dispatcher')
  async getDispatcherJobs(
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('search') search?: string,
  ) {
    const result = await this.jobLocksService.findJobs('dispatcher', dateFrom, dateTo, search);
    return new ApiResponse(result);
  }

  @Post('dispatcher/:id/unlock')
  @Permissions('job-locks.dispatcher')
  async unlockDispatcher(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.jobLocksService.unlockJob('dispatcher', id, userId);
    return new ApiResponse(result, 'Job unlocked for dispatcher');
  }

  @Post('dispatcher/:id/lock')
  @Permissions('job-locks.dispatcher')
  async lockDispatcher(@Param('id') id: string) {
    const result = await this.jobLocksService.lockJob('dispatcher', id);
    return new ApiResponse(result, 'Job locked for dispatcher');
  }

  // ─── DRIVER ───

  @Get('driver')
  @Permissions('job-locks.driver')
  async getDriverJobs(
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('search') search?: string,
  ) {
    const result = await this.jobLocksService.findJobs('driver', dateFrom, dateTo, search);
    return new ApiResponse(result);
  }

  @Post('driver/:id/unlock')
  @Permissions('job-locks.driver')
  async unlockDriver(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.jobLocksService.unlockJob('driver', id, userId);
    return new ApiResponse(result, 'Job unlocked for driver');
  }

  @Post('driver/:id/lock')
  @Permissions('job-locks.driver')
  async lockDriver(@Param('id') id: string) {
    const result = await this.jobLocksService.lockJob('driver', id);
    return new ApiResponse(result, 'Job locked for driver');
  }

  // ─── REP ───

  @Get('rep')
  @Permissions('job-locks.rep')
  async getRepJobs(
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('search') search?: string,
  ) {
    const result = await this.jobLocksService.findJobs('rep', dateFrom, dateTo, search);
    return new ApiResponse(result);
  }

  @Post('rep/:id/unlock')
  @Permissions('job-locks.rep')
  async unlockRep(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.jobLocksService.unlockJob('rep', id, userId);
    return new ApiResponse(result, 'Job unlocked for rep');
  }

  @Post('rep/:id/lock')
  @Permissions('job-locks.rep')
  async lockRep(@Param('id') id: string) {
    const result = await this.jobLocksService.lockJob('rep', id);
    return new ApiResponse(result, 'Job locked for rep');
  }

  // ─── SUPPLIER ───

  @Get('supplier')
  @Permissions('job-locks.supplier')
  async getSupplierJobs(
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('search') search?: string,
  ) {
    const result = await this.jobLocksService.findJobs('supplier', dateFrom, dateTo, search);
    return new ApiResponse(result);
  }

  @Post('supplier/:id/unlock')
  @Permissions('job-locks.supplier')
  async unlockSupplier(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.jobLocksService.unlockJob('supplier', id, userId);
    return new ApiResponse(result, 'Job unlocked for supplier');
  }

  @Post('supplier/:id/lock')
  @Permissions('job-locks.supplier')
  async lockSupplier(@Param('id') id: string) {
    const result = await this.jobLocksService.lockJob('supplier', id);
    return new ApiResponse(result, 'Job locked for supplier');
  }

  // ─── EDIT (B2B 1-week lock) ───

  @Get('edit')
  @Permissions('job-locks.edit')
  async getEditJobs(
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('search') search?: string,
  ) {
    const result = await this.jobLocksService.findJobs('edit', dateFrom, dateTo, search);
    return new ApiResponse(result);
  }

  @Post('edit/:id/unlock')
  @Permissions('job-locks.edit')
  async unlockEdit(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.jobLocksService.unlockJob('edit', id, userId);
    return new ApiResponse(result, 'Job unlocked for editing');
  }

  @Post('edit/:id/lock')
  @Permissions('job-locks.edit')
  async lockEdit(@Param('id') id: string) {
    const result = await this.jobLocksService.lockJob('edit', id);
    return new ApiResponse(result, 'Job locked for editing');
  }
}
