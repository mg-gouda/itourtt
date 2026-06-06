import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateStaticPageDto,
  UpdateStaticPageDto,
} from './dto/static-page.dto.js';
import { slugify } from './slug.util.js';
import { parseLocale, overlayTranslation } from './locale.util.js';

@Injectable()
export class StaticPagesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Admin ───────────────────────────────────────────

  async listForAdmin() {
    return this.prisma.staticPage.findMany({
      orderBy: [{ menuOrder: 'asc' }, { title: 'asc' }],
    });
  }

  async getForAdmin(id: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Page not found.');
    return page;
  }

  async create(dto: CreateStaticPageDto) {
    const slug = await this.resolveSlug(dto.slug || dto.title);
    return this.prisma.staticPage.create({
      data: {
        slug,
        title: dto.title,
        content: dto.content ?? '',
        isPublished: dto.isPublished ?? false,
        showInNav: dto.showInNav ?? false,
        showInFooter: dto.showInFooter ?? false,
        menuOrder: dto.menuOrder ?? 0,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
      },
    });
  }

  async update(id: string, dto: UpdateStaticPageDto) {
    const existing = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Page not found.');

    const slug = dto.slug
      ? await this.resolveSlug(dto.slug, id)
      : existing.slug;

    return this.prisma.staticPage.update({
      where: { id },
      data: {
        slug,
        title: dto.title ?? existing.title,
        content: dto.content ?? existing.content,
        isPublished: dto.isPublished ?? existing.isPublished,
        showInNav: dto.showInNav ?? existing.showInNav,
        showInFooter: dto.showInFooter ?? existing.showInFooter,
        menuOrder: dto.menuOrder ?? existing.menuOrder,
        metaTitle: dto.metaTitle ?? existing.metaTitle,
        metaDescription: dto.metaDescription ?? existing.metaDescription,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Page not found.');
    await this.prisma.staticPage.delete({ where: { id } });
    return { id };
  }

  // ─── Public ──────────────────────────────────────────

  /**
   * Menu lists for the B2C site header/footer: published pages flagged for
   * each placement, ordered by menuOrder. Returns { nav, footer } arrays of
   * lightweight link descriptors.
   */
  async menus(locale?: string) {
    const pages = await this.prisma.staticPage.findMany({
      where: {
        isPublished: true,
        OR: [{ showInNav: true }, { showInFooter: true }],
      },
      orderBy: [{ menuOrder: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        showInNav: true,
        showInFooter: true,
      },
    });

    // Overlay localized menu titles in one query when a locale is requested.
    const loc = parseLocale(locale);
    const titleByPage = new Map<string, string>();
    if (loc && pages.length) {
      const trs = await this.prisma.staticPageTranslation.findMany({
        where: { staticPageId: { in: pages.map((p) => p.id) }, locale: loc },
        select: { staticPageId: true, title: true },
      });
      for (const t of trs) if (t.title) titleByPage.set(t.staticPageId, t.title);
    }

    const link = (p: (typeof pages)[number]) => ({
      slug: p.slug,
      title: titleByPage.get(p.id) ?? p.title,
    });
    return {
      nav: pages.filter((p) => p.showInNav).map(link),
      footer: pages.filter((p) => p.showInFooter).map(link),
    };
  }

  /** Published page by slug; 404 when missing or still a draft. */
  async getPublicBySlug(slug: string, locale?: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { slug } });
    if (!page || !page.isPublished) {
      throw new NotFoundException('Page not found.');
    }

    const base = {
      slug: page.slug,
      title: page.title,
      content: page.content,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      updatedAt: page.updatedAt,
    };

    const loc = parseLocale(locale);
    if (!loc) return base;

    const tr = await this.prisma.staticPageTranslation.findUnique({
      where: { staticPageId_locale: { staticPageId: page.id, locale: loc } },
    });
    return overlayTranslation(base, tr, [
      'title',
      'content',
      'metaTitle',
      'metaDescription',
    ]);
  }

  // ─── Helpers ─────────────────────────────────────────

  /** Slugify and ensure uniqueness (ignoring the row being updated). */
  private async resolveSlug(input: string, ignoreId?: string) {
    const slug = slugify(input);
    if (!slug) throw new ConflictException('Could not derive a slug.');
    const clash = await this.prisma.staticPage.findUnique({ where: { slug } });
    if (clash && clash.id !== ignoreId) {
      throw new ConflictException(`Slug "${slug}" is already in use.`);
    }
    return slug;
  }
}
