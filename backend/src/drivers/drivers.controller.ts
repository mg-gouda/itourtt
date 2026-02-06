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
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { DriversService } from './drivers.service.js';
import { CreateDriverDto } from './dto/create-driver.dto.js';
import { UpdateDriverDto } from './dto/update-driver.dto.js';
import { AssignVehicleDto } from './dto/assign-vehicle.dto.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const uploadStorage = diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  },
});

class DriverListQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;
}

@Controller('drivers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get()
  async findAll(@Query() query: DriverListQueryDto) {
    const { isActive, ...pagination } = query;
    return this.driversService.findAll(pagination, isActive);
  }

  @Post()
  @Roles('ADMIN', 'DISPATCHER')
  async create(@Body() dto: CreateDriverDto) {
    const driver = await this.driversService.create(dto);
    return new ApiResponse(driver, 'Driver created successfully');
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const driver = await this.driversService.findOne(id);
    return new ApiResponse(driver);
  }

  @Patch(':id')
  @Roles('ADMIN', 'DISPATCHER')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverDto,
  ) {
    const driver = await this.driversService.update(id, dto);
    return new ApiResponse(driver, 'Driver updated successfully');
  }

  @Post(':id/vehicles')
  @Roles('ADMIN', 'DISPATCHER')
  async assignVehicle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignVehicleDto,
  ) {
    const assignment = await this.driversService.assignVehicle(id, dto);
    return new ApiResponse(assignment, 'Vehicle assigned to driver successfully');
  }

  @Delete(':driverId/vehicles/:vehicleId')
  @Roles('ADMIN', 'DISPATCHER')
  async unassignVehicle(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ) {
    const result = await this.driversService.unassignVehicle(driverId, vehicleId);
    return new ApiResponse(result, 'Vehicle unassigned from driver successfully');
  }

  @Post(':id/attachment')
  @Roles('ADMIN', 'DISPATCHER')
  @UseInterceptors(FileInterceptor('file', { storage: uploadStorage }))
  async uploadAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: any,
  ) {
    const url = '/uploads/' + file.filename;
    await this.driversService.updateAttachment(id, url);
    return { url };
  }
}
