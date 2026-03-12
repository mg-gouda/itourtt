import { NextRequest, NextResponse } from 'next/server';

/**
 * Domain-based routing middleware for B2C website vs. dashboard.
 *
 * When NEXT_PUBLIC_WEBSITE_DOMAIN is configured (e.g., "book.itourtt.cloud"),
 * requests to that hostname are rewritten to the /w route which contains
 * the B2C website landing page with dynamic theming and booking widget.
 *
 * Booking-flow paths (/book, /booking, /payment) on the B2C domain are
 * allowed through to the existing (public) route group unchanged -- they
 * already have their own layout with navbar and footer.
 *
 * Dashboard-domain requests pass through with no rewriting.
 *
 * When no WEBSITE_DOMAIN is configured, this middleware is a no-op.
 */

const WEBSITE_DOMAIN = process.env.NEXT_PUBLIC_WEBSITE_DOMAIN;

// Paths that should use the existing (public) route group even on the B2C domain.
const PUBLIC_PASS_THROUGH_PREFIXES = ['/book', '/booking', '/payment'];

export function middleware(request: NextRequest) {
  // Skip middleware entirely if no B2C domain is configured
  if (!WEBSITE_DOMAIN) {
    return NextResponse.next();
  }

  const hostname = request.headers.get('host') ?? '';
  // Strip port for matching (handles localhost:3000 vs book.example.com)
  const bareHost = hostname.split(':')[0];
  const bareDomain = WEBSITE_DOMAIN.split(':')[0];

  // Only apply rewriting to requests on the B2C website domain
  if (bareHost !== bareDomain) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Allow booking-flow paths through to (public) routes unchanged
  for (const prefix of PUBLIC_PASS_THROUGH_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return NextResponse.next();
    }
  }

  // Skip API routes, static files, and Next.js internals
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/w') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Skip dashboard routes (login, dashboard, forgot-password, etc.)
  const DASHBOARD_PREFIXES = ['/login', '/dashboard', '/forgot-password', '/reset-password'];
  for (const prefix of DASHBOARD_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return NextResponse.next();
    }
  }

  // Rewrite B2C domain requests to the /w route prefix.
  // The /w route has its own layout.tsx with dynamic theming (SiteHeader,
  // SiteFooter, Google Fonts, CSS variables from WebsiteSettings).
  //
  // The URL the visitor sees stays clean (e.g., "/" or "/about")
  // while Next.js internally serves from /w or /w/about.

  const url = request.nextUrl.clone();

  if (pathname === '/') {
    url.pathname = '/w';
  } else {
    url.pathname = `/w${pathname}`;
  }

  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon files
     * - Static assets (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|favicon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
