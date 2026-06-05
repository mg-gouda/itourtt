import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpsertCityPageDto } from './dto/city-page.dto.js';
import { slugify } from './slug.util.js';
import { parseLocale, overlayTranslation } from './locale.util.js';

@Injectable()
export class CityPagesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Admin ───────────────────────────────────────────

  /** All active cities with their CMS page (if any) so admins can pick/create. */
  async listForAdmin() {
    const cities = await this.prisma.city.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        airport: { select: { name: true } },
        page: true,
      },
    });
    return cities.map((c) => ({
      cityId: c.id,
      cityName: c.name,
      airportName: c.airport?.name ?? null,
      page: c.page,
    }));
  }

  async getByCityId(cityId: string) {
    const page = await this.prisma.cityPage.findUnique({
      where: { cityId },
      include: { city: { select: { name: true } } },
    });
    if (!page) throw new NotFoundException('City page not found.');
    return page;
  }

  /** Create or update the landing page for a city. */
  async upsert(cityId: string, dto: UpsertCityPageDto) {
    const city = await this.prisma.city.findUnique({ where: { id: cityId } });
    if (!city) throw new NotFoundException('City not found.');

    const slug = await this.resolveSlug(dto.slug || city.name, cityId);

    const data = {
      slug,
      isPublished: dto.isPublished,
      showInMenu: dto.showInMenu,
      menuOrder: dto.menuOrder,
      heroHeadline: dto.heroHeadline,
      heroImageUrl: dto.heroImageUrl,
      introText: dto.introText,
      contentHtml: dto.contentHtml,
      bodyJson: dto.bodyJson as object | undefined,
      faqJson: dto.faqJson as object | undefined,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
    };

    return this.prisma.cityPage.upsert({
      where: { cityId },
      create: { cityId, ...data },
      update: data,
    });
  }

  async remove(cityId: string) {
    await this.getByCityId(cityId); // 404 if missing
    await this.prisma.cityPage.delete({ where: { cityId } });
    return { success: true };
  }

  /** Ensure slug is unique across CityPages (excluding the current city's row). */
  private async resolveSlug(base: string, cityId: string): Promise<string> {
    const root = slugify(base) || 'city';
    let candidate = root;
    let n = 2;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.cityPage.findUnique({
        where: { slug: candidate },
        select: { cityId: true },
      });
      if (!existing || existing.cityId === cityId) return candidate;
      candidate = `${root}-${n++}`;
    }
  }

  // ─── Public ──────────────────────────────────────────

  /** Published, in-menu pages for the Destinations mega-menu. */
  async menuList() {
    const pages = await this.prisma.cityPage.findMany({
      where: { isPublished: true, showInMenu: true },
      orderBy: [{ menuOrder: 'asc' }, { slug: 'asc' }],
      select: {
        slug: true,
        heroHeadline: true,
        city: { select: { name: true } },
      },
    });
    return pages.map((p) => ({
      slug: p.slug,
      name: p.city?.name ?? p.heroHeadline ?? p.slug,
    }));
  }

  /**
   * Full published page for the B2C city/destination route. When a supported
   * non-English locale is requested, translated fields overlay the English base
   * (untranslated fields and heroImageUrl/city.name/bodyJson stay English).
   */
  async getPublicBySlug(slug: string, locale?: string) {
    const page = await this.prisma.cityPage.findFirst({
      where: { slug, isPublished: true },
      include: { city: { select: { name: true } } },
    });
    if (!page) throw new NotFoundException('Page not found.');

    const loc = parseLocale(locale);
    if (!loc) return page;

    const tr = await this.prisma.cityPageTranslation.findUnique({
      where: { cityPageId_locale: { cityPageId: page.id, locale: loc } },
    });
    return overlayTranslation(page, tr, [
      'heroHeadline',
      'introText',
      'contentHtml',
      'faqJson',
      'metaTitle',
      'metaDescription',
    ]);
  }
}
