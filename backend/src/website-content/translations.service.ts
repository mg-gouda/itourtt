import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Locale, Prisma } from '../../generated/prisma/client.js';
import { parseLocale } from './locale.util.js';
import { KNOWN_PAGES } from './page-seo.service.js';
import {
  UpsertCityPageTranslationDto,
  UpsertBlogPostTranslationDto,
  UpsertPageSeoTranslationDto,
  UpsertStaticPageTranslationDto,
} from './dto/translation.dto.js';

/** Validate a :locale route param into a supported Locale or 400. */
function requireLocale(raw: string): Locale {
  const loc = parseLocale(raw);
  if (!loc) {
    throw new BadRequestException(
      `Unsupported locale "${raw}". Supported: ar, de, fr, it, nl, ru.`,
    );
  }
  return loc;
}

@Injectable()
export class TranslationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── City pages (keyed by cityId in the admin) ───────────────────

  private async resolveCityPageId(cityId: string): Promise<string> {
    const page = await this.prisma.cityPage.findUnique({
      where: { cityId },
      select: { id: true },
    });
    if (!page) throw new NotFoundException('City page not found.');
    return page.id;
  }

  async listCityPageTranslations(cityId: string) {
    const cityPageId = await this.resolveCityPageId(cityId);
    const rows = await this.prisma.cityPageTranslation.findMany({
      where: { cityPageId },
    });
    return { translations: this.byLocale(rows) };
  }

  async upsertCityPageTranslation(
    cityId: string,
    rawLocale: string,
    dto: UpsertCityPageTranslationDto,
  ) {
    const cityPageId = await this.resolveCityPageId(cityId);
    const locale = requireLocale(rawLocale);
    const data = {
      heroHeadline: dto.heroHeadline,
      introText: dto.introText,
      contentHtml: dto.contentHtml,
      faqJson: dto.faqJson as Prisma.InputJsonValue | undefined,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
    };
    return this.prisma.cityPageTranslation.upsert({
      where: { cityPageId_locale: { cityPageId, locale } },
      create: { cityPageId, locale, ...data },
      update: data,
    });
  }

  async deleteCityPageTranslation(cityId: string, rawLocale: string) {
    const cityPageId = await this.resolveCityPageId(cityId);
    const locale = requireLocale(rawLocale);
    await this.prisma.cityPageTranslation.deleteMany({
      where: { cityPageId, locale },
    });
    return { success: true };
  }

  // ─── Blog posts (keyed by post id) ───────────────────────────────

  private async assertBlogPost(id: string): Promise<void> {
    const post = await this.prisma.blogPost.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found.');
  }

  async listBlogTranslations(blogPostId: string) {
    await this.assertBlogPost(blogPostId);
    const rows = await this.prisma.blogPostTranslation.findMany({
      where: { blogPostId },
    });
    return { translations: this.byLocale(rows) };
  }

  async upsertBlogTranslation(
    blogPostId: string,
    rawLocale: string,
    dto: UpsertBlogPostTranslationDto,
  ) {
    await this.assertBlogPost(blogPostId);
    const locale = requireLocale(rawLocale);
    const data = {
      title: dto.title,
      excerpt: dto.excerpt,
      contentHtml: dto.contentHtml,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
    };
    return this.prisma.blogPostTranslation.upsert({
      where: { blogPostId_locale: { blogPostId, locale } },
      create: { blogPostId, locale, ...data },
      update: data,
    });
  }

  async deleteBlogTranslation(blogPostId: string, rawLocale: string) {
    await this.assertBlogPost(blogPostId);
    const locale = requireLocale(rawLocale);
    await this.prisma.blogPostTranslation.deleteMany({
      where: { blogPostId, locale },
    });
    return { success: true };
  }

  // ─── Page SEO (keyed by pageKey) ─────────────────────────────────

  /** Ensure a base PageSeo row exists for a known pageKey; return its id. */
  private async resolvePageSeoId(pageKey: string): Promise<string> {
    if (!KNOWN_PAGES.some((p) => p.key === pageKey)) {
      throw new NotFoundException(`Unknown page key "${pageKey}".`);
    }
    const row = await this.prisma.pageSeo.upsert({
      where: { pageKey },
      create: { pageKey },
      update: {},
      select: { id: true },
    });
    return row.id;
  }

  async listPageSeoTranslations(pageKey: string) {
    const pageSeoId = await this.resolvePageSeoId(pageKey);
    const rows = await this.prisma.pageSeoTranslation.findMany({
      where: { pageSeoId },
    });
    return { translations: this.byLocale(rows) };
  }

  async upsertPageSeoTranslation(
    pageKey: string,
    rawLocale: string,
    dto: UpsertPageSeoTranslationDto,
  ) {
    const pageSeoId = await this.resolvePageSeoId(pageKey);
    const locale = requireLocale(rawLocale);
    const data = {
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
    };
    return this.prisma.pageSeoTranslation.upsert({
      where: { pageSeoId_locale: { pageSeoId, locale } },
      create: { pageSeoId, locale, ...data },
      update: data,
    });
  }

  async deletePageSeoTranslation(pageKey: string, rawLocale: string) {
    const pageSeoId = await this.resolvePageSeoId(pageKey);
    const locale = requireLocale(rawLocale);
    await this.prisma.pageSeoTranslation.deleteMany({
      where: { pageSeoId, locale },
    });
    return { success: true };
  }

  // ─── Static pages (keyed by page id) ─────────────────────────────

  private async assertStaticPage(id: string): Promise<void> {
    const page = await this.prisma.staticPage.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!page) throw new NotFoundException('Page not found.');
  }

  async listStaticPageTranslations(staticPageId: string) {
    await this.assertStaticPage(staticPageId);
    const rows = await this.prisma.staticPageTranslation.findMany({
      where: { staticPageId },
    });
    return { translations: this.byLocale(rows) };
  }

  async upsertStaticPageTranslation(
    staticPageId: string,
    rawLocale: string,
    dto: UpsertStaticPageTranslationDto,
  ) {
    await this.assertStaticPage(staticPageId);
    const locale = requireLocale(rawLocale);
    const data = {
      title: dto.title,
      content: dto.content,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
    };
    return this.prisma.staticPageTranslation.upsert({
      where: { staticPageId_locale: { staticPageId, locale } },
      create: { staticPageId, locale, ...data },
      update: data,
    });
  }

  async deleteStaticPageTranslation(staticPageId: string, rawLocale: string) {
    await this.assertStaticPage(staticPageId);
    const locale = requireLocale(rawLocale);
    await this.prisma.staticPageTranslation.deleteMany({
      where: { staticPageId, locale },
    });
    return { success: true };
  }

  // ─── Shared helpers (also used by the auto-translate endpoint) ───

  /** Reduce translation rows to a { [locale]: row } map. */
  private byLocale<T extends { locale: Locale }>(rows: T[]): Record<string, T> {
    return rows.reduce<Record<string, T>>((acc, row) => {
      acc[row.locale] = row;
      return acc;
    }, {});
  }

  /** English source fields for the auto-translate endpoint, by entity. */
  async getEnglishSource(
    entity: 'city_page' | 'blog_post' | 'page_seo' | 'static_page',
    id: string,
  ): Promise<Record<string, unknown>> {
    if (entity === 'static_page') {
      const page = await this.prisma.staticPage.findUnique({
        where: { id },
        select: {
          title: true,
          content: true,
          metaTitle: true,
          metaDescription: true,
        },
      });
      if (!page) throw new NotFoundException('Page not found.');
      return this.stripEmpty(page);
    }
    if (entity === 'city_page') {
      const page = await this.prisma.cityPage.findUnique({
        where: { cityId: id },
        select: {
          heroHeadline: true,
          introText: true,
          contentHtml: true,
          faqJson: true,
          metaTitle: true,
          metaDescription: true,
        },
      });
      if (!page) throw new NotFoundException('City page not found.');
      return this.stripEmpty(page);
    }
    if (entity === 'blog_post') {
      const post = await this.prisma.blogPost.findUnique({
        where: { id },
        select: {
          title: true,
          excerpt: true,
          contentHtml: true,
          metaTitle: true,
          metaDescription: true,
        },
      });
      if (!post) throw new NotFoundException('Post not found.');
      return this.stripEmpty(post);
    }
    const seo = await this.prisma.pageSeo.findUnique({
      where: { pageKey: id },
      select: { metaTitle: true, metaDescription: true },
    });
    if (!seo) throw new NotFoundException(`Page SEO "${id}" not found.`);
    return this.stripEmpty(seo);
  }

  /** Persist an auto-translation result by reusing the matching upsert. */
  async saveTranslation(
    entity: 'city_page' | 'blog_post' | 'page_seo' | 'static_page',
    id: string,
    locale: string,
    translation: Record<string, unknown>,
  ) {
    if (entity === 'city_page') {
      return this.upsertCityPageTranslation(id, locale, translation);
    }
    if (entity === 'blog_post') {
      return this.upsertBlogTranslation(id, locale, translation);
    }
    if (entity === 'static_page') {
      return this.upsertStaticPageTranslation(id, locale, translation);
    }
    return this.upsertPageSeoTranslation(id, locale, translation);
  }

  private stripEmpty(obj: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== null && v !== undefined),
    );
  }
}
