import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ComplaintCategoriesService } from './complaint-categories.service.js';
import { UpsertComplaintCategoryDto } from './dto/upsert-complaint-category.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';

@Controller('complaint-categories')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ComplaintCategoriesController {
  constructor(private readonly categoriesService: ComplaintCategoriesService) {}

  // Readable by anyone who can see complaints — the complaint form needs the list.
  @Get()
  @Permissions('complaint-categories', 'complaints')
  async findAll(@Query('includeInactive') includeInactive?: string) {
    const data = await this.categoriesService.findAll(includeInactive === 'true');
    return new ApiResponse(data);
  }

  @Get(':id')
  @Permissions('complaint-categories', 'complaints')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return new ApiResponse(await this.categoriesService.findOne(id));
  }

  @Post()
  @Permissions('complaint-categories.addButton')
  async create(@Body() dto: UpsertComplaintCategoryDto) {
    return new ApiResponse(await this.categoriesService.create(dto), 'Category created');
  }

  @Put(':id')
  @Permissions('complaint-categories.editButton')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertComplaintCategoryDto,
  ) {
    return new ApiResponse(await this.categoriesService.update(id, dto), 'Category updated');
  }

  @Delete(':id')
  @Permissions('complaint-categories.deleteButton')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return new ApiResponse(await this.categoriesService.remove(id), 'Category deleted');
  }
}
