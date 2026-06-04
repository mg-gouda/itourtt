import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { CityPagesService } from './city-pages.service.js';
import { UpsertCityPageDto } from './dto/city-page.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';

@Controller('city-pages')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Permissions('website-content.cityPages')
export class CityPagesAdminController {
  constructor(private readonly service: CityPagesService) {}

  @Get()
  async list() {
    return new ApiResponse(await this.service.listForAdmin());
  }

  @Get(':cityId')
  async get(@Param('cityId') cityId: string) {
    return new ApiResponse(await this.service.getByCityId(cityId));
  }

  @Put(':cityId')
  async upsert(@Param('cityId') cityId: string, @Body() dto: UpsertCityPageDto) {
    return new ApiResponse(await this.service.upsert(cityId, dto), 'Saved.');
  }

  @Delete(':cityId')
  async remove(@Param('cityId') cityId: string) {
    return new ApiResponse(await this.service.remove(cityId), 'Deleted.');
  }
}
