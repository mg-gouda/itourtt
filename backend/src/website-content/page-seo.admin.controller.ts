import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { PageSeoService } from './page-seo.service.js';
import { UpsertPageSeoDto } from './dto/page-seo.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';

@Controller('page-seo')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Permissions('website-content.pageSeo')
export class PageSeoAdminController {
  constructor(private readonly service: PageSeoService) {}

  @Get()
  async list() {
    return new ApiResponse(await this.service.listForAdmin());
  }

  @Put(':pageKey')
  async upsert(@Param('pageKey') pageKey: string, @Body() dto: UpsertPageSeoDto) {
    return new ApiResponse(await this.service.upsert(pageKey, dto), 'Saved.');
  }
}
