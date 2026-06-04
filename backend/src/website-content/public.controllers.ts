import { Controller, Get, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CityPagesService } from './city-pages.service.js';
import { BlogService } from './blog.service.js';
import { PageSeoService } from './page-seo.service.js';
import { Public } from '../common/decorators/public.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';

@Public()
@Throttle({ default: { limit: 120, ttl: 60000 } })
@Controller('public/city-pages')
export class CityPagesPublicController {
  constructor(private readonly service: CityPagesService) {}

  /** Destinations mega-menu: published, in-menu city pages. */
  @Get()
  async menu() {
    return new ApiResponse(await this.service.menuList());
  }

  @Get(':slug')
  async bySlug(@Param('slug') slug: string) {
    return new ApiResponse(await this.service.getPublicBySlug(slug));
  }
}

@Public()
@Throttle({ default: { limit: 120, ttl: 60000 } })
@Controller('public/blog')
export class BlogPublicController {
  constructor(private readonly service: BlogService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('category') category?: string,
    @Query('tag') tag?: string,
  ) {
    const result = await this.service.listPublic({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      category,
      tag,
    });
    return new ApiResponse(result);
  }

  @Get('categories')
  async categories() {
    return new ApiResponse(await this.service.publicCategories());
  }

  @Get(':slug')
  async bySlug(@Param('slug') slug: string) {
    return new ApiResponse(await this.service.getPublicBySlug(slug));
  }
}

@Public()
@Throttle({ default: { limit: 240, ttl: 60000 } })
@Controller('public/seo')
export class PageSeoPublicController {
  constructor(private readonly service: PageSeoService) {}

  @Get(':pageKey')
  async get(@Param('pageKey') pageKey: string) {
    return new ApiResponse(await this.service.getPublic(pageKey));
  }
}
