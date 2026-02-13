import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { ReportsService } from './reports.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { IsOptional, IsString } from 'class-validator';

class DateRangeQueryDto {
  @IsString()
  from!: string;

  @IsString()
  to!: string;
}

class DayQueryDto {
  @IsString()
  date!: string;
}

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('ADMIN', 'MANAGER', 'ACCOUNTANT', 'DISPATCHER')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('daily-dispatch')
  @Permissions('reports.dailyDispatch')
  async dailyDispatchSummary(@Query() query: DayQueryDto) {
    if (!query.date) {
      throw new BadRequestException('date query parameter is required');
    }
    const result = await this.reportsService.dailyDispatchSummary(query.date);
    return new ApiResponse(result);
  }

  @Get('rep-fees')
  @Permissions('reports.repFees')
  async repFeeReport(@Query() query: DayQueryDto) {
    if (!query.date) {
      throw new BadRequestException('date query parameter is required');
    }
    const result = await this.reportsService.repFeeReport(query.date);
    return new ApiResponse(result);
  }

  @Get('driver-trips')
  @Permissions('reports.driverTrips')
  async driverTripReport(@Query() query: DateRangeQueryDto) {
    if (!query.from || !query.to) {
      throw new BadRequestException(
        'from and to query parameters are required',
      );
    }
    const result = await this.reportsService.driverTripReport(
      query.from,
      query.to,
    );
    return new ApiResponse(result);
  }

  @Get('agent-statement/:agentId')
  @Permissions('reports.agentStatement')
  async agentStatement(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query() query: DateRangeQueryDto,
  ) {
    if (!query.from || !query.to) {
      throw new BadRequestException(
        'from and to query parameters are required',
      );
    }
    const result = await this.reportsService.agentStatement(
      agentId,
      query.from,
      query.to,
    );
    return new ApiResponse(result);
  }

  @Get('revenue')
  @Permissions('reports.revenue')
  async revenueReport(@Query() query: DateRangeQueryDto) {
    if (!query.from || !query.to) {
      throw new BadRequestException(
        'from and to query parameters are required',
      );
    }
    const result = await this.reportsService.revenueReport(
      query.from,
      query.to,
    );
    return new ApiResponse(result);
  }
}
