import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpsertPageSeoDto } from './dto/page-seo.dto.js';
import { parseLocale } from './locale.util.js';

/**
 * Static B2C pages that support editable SEO meta. The admin UI renders this
 * list; the B2C site fetches meta per key via GET /public/seo/:pageKey.
 */
export const KNOWN_PAGES: { key: string; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'book', label: 'Book (search)' },
  { key: 'book-details', label: 'Book — Details' },
  { key: 'booking-lookup', label: 'Track / Booking Lookup' },
  { key: 'destinations', label: 'Destinations (index)' },
  { key: 'blog', label: 'Blog (listing)' },
  { key: 'login', label: 'Account Login' },
  { key: 'account', label: 'My Account' },
];

@Injectable()
export class PageSeoService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Admin ───────────────────────────────────────────

  /** Known pages merged with any saved meta (so admins see the full list). */
  async listForAdmin() {
    const saved = await this.prisma.pageSeo.findMany();
    const byKey = new Map(saved.map((s) => [s.pageKey, s]));
    return KNOWN_PAGES.map((p) => {
      const row = byKey.get(p.key);
      return {
        pageKey: p.key,
        label: p.label,
        metaTitle: row?.metaTitle ?? null,
        metaDescription: row?.metaDescription ?? null,
      };
    });
  }

  async upsert(pageKey: string, dto: UpsertPageSeoDto) {
    if (!KNOWN_PAGES.some((p) => p.key === pageKey)) {
      throw new NotFoundException(`Unknown page key "${pageKey}".`);
    }
    return this.prisma.pageSeo.upsert({
      where: { pageKey },
      create: {
        pageKey,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
      },
      update: {
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
      },
    });
  }

  // ─── Public ──────────────────────────────────────────

  async getPublic(pageKey: string, locale?: string) {
    const row = await this.prisma.pageSeo.findUnique({ where: { pageKey } });
    let metaTitle = row?.metaTitle ?? null;
    let metaDescription = row?.metaDescription ?? null;

    const loc = parseLocale(locale);
    if (row && loc) {
      const tr = await this.prisma.pageSeoTranslation.findUnique({
        where: { pageSeoId_locale: { pageSeoId: row.id, locale: loc } },
      });
      if (tr) {
        metaTitle = tr.metaTitle ?? metaTitle;
        metaDescription = tr.metaDescription ?? metaDescription;
      }
    }

    return { pageKey, metaTitle, metaDescription };
  }
}
