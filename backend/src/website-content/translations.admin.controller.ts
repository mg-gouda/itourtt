import {
  Controller,
  Get,
  Put,
  Delete,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { TranslationsService } from './translations.service.js';
import { TranslateService } from './translate.service.js';
import {
  UpsertCityPageTranslationDto,
  UpsertBlogPostTranslationDto,
  UpsertPageSeoTranslationDto,
  UpsertStaticPageTranslationDto,
  TranslateRequestDto,
} from './dto/translation.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';

/**
 * Admin CRUD for B2C content translations + the Claude-backed auto-translate
 * endpoint. Routes hang off each resource's existing identifier:
 *   city pages → cityId, blog posts → post id, page SEO → pageKey.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class TranslationsAdminController {
  constructor(
    private readonly service: TranslationsService,
    private readonly translate: TranslateService,
  ) {}

  // ── City pages ──
  @Get('city-pages/:cityId/translations')
  @Permissions('website-content.cityPages')
  async listCity(@Param('cityId') cityId: string) {
    return new ApiResponse(await this.service.listCityPageTranslations(cityId));
  }

  @Put('city-pages/:cityId/translations/:locale')
  @Permissions('website-content.cityPages')
  async putCity(
    @Param('cityId') cityId: string,
    @Param('locale') locale: string,
    @Body() dto: UpsertCityPageTranslationDto,
  ) {
    return new ApiResponse(
      await this.service.upsertCityPageTranslation(cityId, locale, dto),
      'Saved.',
    );
  }

  @Delete('city-pages/:cityId/translations/:locale')
  @Permissions('website-content.cityPages')
  async deleteCity(
    @Param('cityId') cityId: string,
    @Param('locale') locale: string,
  ) {
    return new ApiResponse(
      await this.service.deleteCityPageTranslation(cityId, locale),
      'Deleted.',
    );
  }

  // ── Blog posts ──
  @Get('blog/:id/translations')
  @Permissions('website-content.blog')
  async listBlog(@Param('id') id: string) {
    return new ApiResponse(await this.service.listBlogTranslations(id));
  }

  @Put('blog/:id/translations/:locale')
  @Permissions('website-content.blog')
  async putBlog(
    @Param('id') id: string,
    @Param('locale') locale: string,
    @Body() dto: UpsertBlogPostTranslationDto,
  ) {
    return new ApiResponse(
      await this.service.upsertBlogTranslation(id, locale, dto),
      'Saved.',
    );
  }

  @Delete('blog/:id/translations/:locale')
  @Permissions('website-content.blog')
  async deleteBlog(@Param('id') id: string, @Param('locale') locale: string) {
    return new ApiResponse(
      await this.service.deleteBlogTranslation(id, locale),
      'Deleted.',
    );
  }

  // ── Page SEO ──
  @Get('page-seo/:pageKey/translations')
  @Permissions('website-content.pageSeo')
  async listSeo(@Param('pageKey') pageKey: string) {
    return new ApiResponse(await this.service.listPageSeoTranslations(pageKey));
  }

  @Put('page-seo/:pageKey/translations/:locale')
  @Permissions('website-content.pageSeo')
  async putSeo(
    @Param('pageKey') pageKey: string,
    @Param('locale') locale: string,
    @Body() dto: UpsertPageSeoTranslationDto,
  ) {
    return new ApiResponse(
      await this.service.upsertPageSeoTranslation(pageKey, locale, dto),
      'Saved.',
    );
  }

  @Delete('page-seo/:pageKey/translations/:locale')
  @Permissions('website-content.pageSeo')
  async deleteSeo(
    @Param('pageKey') pageKey: string,
    @Param('locale') locale: string,
  ) {
    return new ApiResponse(
      await this.service.deletePageSeoTranslation(pageKey, locale),
      'Deleted.',
    );
  }

  // ── Static pages ──
  @Get('admin/pages/:id/translations')
  @Permissions('website-content.pages')
  async listStaticPage(@Param('id') id: string) {
    return new ApiResponse(await this.service.listStaticPageTranslations(id));
  }

  @Put('admin/pages/:id/translations/:locale')
  @Permissions('website-content.pages')
  async putStaticPage(
    @Param('id') id: string,
    @Param('locale') locale: string,
    @Body() dto: UpsertStaticPageTranslationDto,
  ) {
    return new ApiResponse(
      await this.service.upsertStaticPageTranslation(id, locale, dto),
      'Saved.',
    );
  }

  @Delete('admin/pages/:id/translations/:locale')
  @Permissions('website-content.pages')
  async deleteStaticPage(
    @Param('id') id: string,
    @Param('locale') locale: string,
  ) {
    return new ApiResponse(
      await this.service.deleteStaticPageTranslation(id, locale),
      'Deleted.',
    );
  }

  // ── Auto-translate (Claude) ──
  @Post('translate')
  @Permissions(
    'website-content.cityPages',
    'website-content.blog',
    'website-content.pageSeo',
    'website-content.pages',
  )
  async autoTranslate(@Body() dto: TranslateRequestDto) {
    return new ApiResponse(await this.translate.translateEntity(dto));
  }
}
