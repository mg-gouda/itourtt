import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CityPagesService } from './city-pages.service.js';
import { BlogService } from './blog.service.js';
import { PageSeoService } from './page-seo.service.js';
import { TranslationsService } from './translations.service.js';
import { TranslateService } from './translate.service.js';
import { StaticPagesService } from './static-pages.service.js';
import { CityPagesAdminController } from './city-pages.admin.controller.js';
import { BlogAdminController } from './blog.admin.controller.js';
import { PageSeoAdminController } from './page-seo.admin.controller.js';
import { TranslationsAdminController } from './translations.admin.controller.js';
import { StaticPagesAdminController } from './static-pages.admin.controller.js';
import { WebsiteContentUploadController } from './upload.controller.js';
import {
  CityPagesPublicController,
  BlogPublicController,
  PageSeoPublicController,
  StaticPagesPublicController,
} from './public.controllers.js';

@Module({
  imports: [PrismaModule],
  controllers: [
    // Admin (guarded)
    CityPagesAdminController,
    BlogAdminController,
    PageSeoAdminController,
    TranslationsAdminController,
    StaticPagesAdminController,
    WebsiteContentUploadController,
    // Public (@Public)
    CityPagesPublicController,
    BlogPublicController,
    PageSeoPublicController,
    StaticPagesPublicController,
  ],
  providers: [
    CityPagesService,
    BlogService,
    PageSeoService,
    TranslationsService,
    TranslateService,
    StaticPagesService,
  ],
})
export class WebsiteContentModule {}
