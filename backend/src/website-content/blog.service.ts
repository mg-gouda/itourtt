import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpsertBlogPostDto, UpsertBlogCategoryDto } from './dto/blog.dto.js';
import { slugify } from './slug.util.js';
import { parseLocale, overlayTranslation } from './locale.util.js';

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Admin: posts ────────────────────────────────────

  async listForAdmin() {
    return this.prisma.blogPost.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { categories: { select: { id: true, name: true } } },
    });
  }

  async getForAdmin(id: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id },
      include: { categories: { select: { id: true, name: true } } },
    });
    if (!post) throw new NotFoundException('Post not found.');
    return post;
  }

  async create(dto: UpsertBlogPostDto) {
    if (!dto.title) throw new BadRequestException('Title is required.');
    const slug = await this.resolveSlug(dto.slug || dto.title);
    const status = dto.status ?? 'DRAFT';
    return this.prisma.blogPost.create({
      data: {
        slug,
        title: dto.title,
        excerpt: dto.excerpt,
        coverImageUrl: dto.coverImageUrl,
        contentJson: dto.contentJson as object | undefined,
        contentHtml: dto.contentHtml,
        author: dto.author,
        status,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
        tags: dto.tags ?? [],
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        categories: dto.categoryIds?.length
          ? { connect: dto.categoryIds.map((id) => ({ id })) }
          : undefined,
      },
      include: { categories: true },
    });
  }

  async update(id: string, dto: UpsertBlogPostDto) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Post not found.');

    const slug = dto.slug
      ? await this.resolveSlug(dto.slug, id)
      : existing.slug;

    // Set publishedAt the first time a post transitions to PUBLISHED.
    let publishedAt = existing.publishedAt;
    if (dto.status === 'PUBLISHED' && !existing.publishedAt) {
      publishedAt = new Date();
    } else if (dto.status === 'DRAFT') {
      publishedAt = null;
    }

    return this.prisma.blogPost.update({
      where: { id },
      data: {
        slug,
        title: dto.title ?? existing.title,
        excerpt: dto.excerpt,
        coverImageUrl: dto.coverImageUrl,
        contentJson: dto.contentJson as object | undefined,
        contentHtml: dto.contentHtml,
        author: dto.author,
        status: dto.status ?? existing.status,
        publishedAt,
        tags: dto.tags ?? existing.tags,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        categories: dto.categoryIds
          ? { set: dto.categoryIds.map((cid) => ({ id: cid })) }
          : undefined,
      },
      include: { categories: true },
    });
  }

  async remove(id: string) {
    await this.getForAdmin(id);
    await this.prisma.blogPost.delete({ where: { id } });
    return { success: true };
  }

  // ─── Admin: categories ───────────────────────────────

  listCategories() {
    return this.prisma.blogCategory.findMany({ orderBy: { name: 'asc' } });
  }

  async createCategory(dto: UpsertBlogCategoryDto) {
    const slug = await this.resolveCategorySlug(dto.slug || dto.name);
    return this.prisma.blogCategory.create({
      data: { name: dto.name, slug },
    });
  }

  async updateCategory(id: string, dto: UpsertBlogCategoryDto) {
    const existing = await this.prisma.blogCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found.');
    const slug = dto.slug
      ? await this.resolveCategorySlug(dto.slug, id)
      : existing.slug;
    return this.prisma.blogCategory.update({
      where: { id },
      data: { name: dto.name ?? existing.name, slug },
    });
  }

  async removeCategory(id: string) {
    const existing = await this.prisma.blogCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found.');
    await this.prisma.blogCategory.delete({ where: { id } });
    return { success: true };
  }

  // ─── Public ──────────────────────────────────────────

  /** Paginated published posts, optionally filtered by category slug or tag. */
  async listPublic(opts: {
    page?: number;
    pageSize?: number;
    category?: string;
    tag?: string;
    locale?: string;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 12));

    const where = {
      status: 'PUBLISHED',
      ...(opts.category ? { categories: { some: { slug: opts.category } } } : {}),
      ...(opts.tag ? { tags: { has: opts.tag } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          slug: true,
          title: true,
          excerpt: true,
          coverImageUrl: true,
          author: true,
          publishedAt: true,
          tags: true,
          categories: { select: { name: true, slug: true } },
        },
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    // Overlay translated title/excerpt for the requested locale, if any.
    const loc = parseLocale(opts.locale);
    const byId = new Map<string, { title: string | null; excerpt: string | null }>();
    if (loc && rows.length) {
      const trs = await this.prisma.blogPostTranslation.findMany({
        where: { locale: loc, blogPostId: { in: rows.map((r) => r.id) } },
        select: { blogPostId: true, title: true, excerpt: true },
      });
      for (const t of trs) byId.set(t.blogPostId, t);
    }

    // Drop the internal id from the public shape after translation lookup.
    const items = rows.map(({ id, ...rest }) => {
      const t = byId.get(id);
      return {
        ...rest,
        title: t?.title ?? rest.title,
        excerpt: t?.excerpt ?? rest.excerpt,
      };
    });

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getPublicBySlug(slug: string, locale?: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: { slug, status: 'PUBLISHED' },
      include: { categories: { select: { name: true, slug: true } } },
    });
    if (!post) throw new NotFoundException('Post not found.');

    const loc = parseLocale(locale);
    if (!loc) return post;

    const tr = await this.prisma.blogPostTranslation.findUnique({
      where: { blogPostId_locale: { blogPostId: post.id, locale: loc } },
    });
    return overlayTranslation(post, tr, [
      'title',
      'excerpt',
      'contentHtml',
      'metaTitle',
      'metaDescription',
    ]);
  }

  publicCategories() {
    return this.prisma.blogCategory.findMany({
      orderBy: { name: 'asc' },
      select: { name: true, slug: true },
    });
  }

  // ─── Helpers ─────────────────────────────────────────

  private async resolveSlug(base: string, excludeId?: string): Promise<string> {
    const root = slugify(base) || 'post';
    let candidate = root;
    let n = 2;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.blogPost.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing || existing.id === excludeId) return candidate;
      candidate = `${root}-${n++}`;
    }
  }

  private async resolveCategorySlug(base: string, excludeId?: string): Promise<string> {
    const root = slugify(base) || 'category';
    let candidate = root;
    let n = 2;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.blogCategory.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing || existing.id === excludeId) return candidate;
      candidate = `${root}-${n++}`;
    }
  }
}
