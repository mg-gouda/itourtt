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
import { RepsService } from './reps.service.js';
import { CreateRepDto } from './dto/create-rep.dto.js';
import { UpdateRepDto } from './dto/update-rep.dto.js';
import { AssignZoneDto } from './dto/assign-zone.dto.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';

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

@Controller('reps')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RepsController {
  constructor(private readonly repsService: RepsService) {}

  @Get()
  async findAll(@Query() query: PaginationDto) {
    return this.repsService.findAll(query);
  }

  @Post()
  @Roles('ADMIN', 'DISPATCHER')
  async create(@Body() dto: CreateRepDto) {
    const rep = await this.repsService.create(dto);
    return new ApiResponse(rep, 'Rep created successfully');
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const rep = await this.repsService.findOne(id);
    return new ApiResponse(rep);
  }

  @Patch(':id')
  @Roles('ADMIN', 'DISPATCHER')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRepDto,
  ) {
    const rep = await this.repsService.update(id, dto);
    return new ApiResponse(rep, 'Rep updated successfully');
  }

  @Post(':id/zones')
  @Roles('ADMIN', 'DISPATCHER')
  async assignZone(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignZoneDto,
  ) {
    const assignment = await this.repsService.assignZone(id, dto);
    return new ApiResponse(assignment, 'Zone assigned to rep successfully');
  }

  @Delete(':repId/zones/:zoneId')
  @Roles('ADMIN', 'DISPATCHER')
  async unassignZone(
    @Param('repId', ParseUUIDPipe) repId: string,
    @Param('zoneId', ParseUUIDPipe) zoneId: string,
  ) {
    const result = await this.repsService.unassignZone(repId, zoneId);
    return new ApiResponse(result, 'Zone unassigned from rep successfully');
  }

  @Post(':id/attachment')
  @Roles('ADMIN', 'DISPATCHER')
  @UseInterceptors(FileInterceptor('file', { storage: uploadStorage }))
  async uploadAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: any,
  ) {
    const url = '/uploads/' + file.filename;
    await this.repsService.updateAttachment(id, url);
    return { url };
  }

  @Post(':id/account')
  @Roles('ADMIN')
  async createAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { email: string; password: string },
  ) {
    const result = await this.repsService.createUserAccount(id, dto);
    return new ApiResponse(result, 'Rep account created successfully');
  }

  @Patch(':id/account/password')
  @Roles('ADMIN')
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { password: string },
  ) {
    const result = await this.repsService.resetPassword(id, dto.password);
    return new ApiResponse(result, 'Password reset successfully');
  }
}
