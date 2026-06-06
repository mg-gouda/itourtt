import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { StaticPagesService } from './static-pages.service.js';
import {
  CreateStaticPageDto,
  UpdateStaticPageDto,
} from './dto/static-page.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';

@Controller('admin/pages')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Permissions('website-content.pages')
export class StaticPagesAdminController {
  constructor(private readonly service: StaticPagesService) {}

  @Get()
  async list() {
    return new ApiResponse(await this.service.listForAdmin());
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return new ApiResponse(await this.service.getForAdmin(id));
  }

  @Post()
  async create(@Body() dto: CreateStaticPageDto) {
    return new ApiResponse(await this.service.create(dto), 'Created.');
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateStaticPageDto) {
    return new ApiResponse(await this.service.update(id, dto), 'Saved.');
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return new ApiResponse(await this.service.remove(id), 'Deleted.');
  }
}
