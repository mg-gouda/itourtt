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
import { BlogService } from './blog.service.js';
import { UpsertBlogPostDto, UpsertBlogCategoryDto } from './dto/blog.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';

@Controller('blog')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Permissions('website-content.blog')
export class BlogAdminController {
  constructor(private readonly service: BlogService) {}

  // ── Categories (declared before :id to avoid route clash) ──
  @Get('categories')
  async listCategories() {
    return new ApiResponse(await this.service.listCategories());
  }

  @Post('categories')
  async createCategory(@Body() dto: UpsertBlogCategoryDto) {
    return new ApiResponse(await this.service.createCategory(dto), 'Created.');
  }

  @Put('categories/:id')
  async updateCategory(@Param('id') id: string, @Body() dto: UpsertBlogCategoryDto) {
    return new ApiResponse(await this.service.updateCategory(id, dto), 'Saved.');
  }

  @Delete('categories/:id')
  async removeCategory(@Param('id') id: string) {
    return new ApiResponse(await this.service.removeCategory(id), 'Deleted.');
  }

  // ── Posts ──
  @Get()
  async list() {
    return new ApiResponse(await this.service.listForAdmin());
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return new ApiResponse(await this.service.getForAdmin(id));
  }

  @Post()
  async create(@Body() dto: UpsertBlogPostDto) {
    return new ApiResponse(await this.service.create(dto), 'Created.');
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpsertBlogPostDto) {
    return new ApiResponse(await this.service.update(id, dto), 'Saved.');
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return new ApiResponse(await this.service.remove(id), 'Deleted.');
  }
}
