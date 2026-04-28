# B2C Website Separation Plan

## Goal
Extract the public B2C website (`/w/` routes) from the main Next.js dashboard app into a
standalone Next.js project deployed on its own server/domain, while the dashboard stays
on its current server.

---

## Current Structure

```
frontend/src/
  app/
    w/                        ← B2C routes (to be moved)
      layout.tsx
      page.tsx
      landing-client.tsx
      website-shell.tsx
      book/                   ← booking form
      booking/                ← booking lookup
  components/
    website/                  ← website-only UI components (to be moved)
      booking-widget.tsx
      features-section.tsx
      hero-section.tsx
      site-footer.tsx
      site-header.tsx
  lib/
    website-i18n.tsx          ← 7-language i18n for website (to be moved)
```

Backend API endpoints consumed by the B2C site:
- `GET  /settings/site`         — site settings (colors, text, logo)
- `POST /bookings/quote`        — quote request
- `POST /bookings/widget`       — booking submission
- `GET  /bookings/lookup/:ref`  — booking lookup by reference
- `GET  /locations/…`           — hotel/airport/zone selectors

---

## New Structure

```
repo root/
  frontend/          ← main dashboard (unchanged, /w/ routes removed)
  itour-website/     ← new standalone Next.js app (B2C only)
    src/
      app/
        layout.tsx
        page.tsx               ← landing
        book/page.tsx          ← booking form
        booking/page.tsx       ← booking lookup
      components/
        booking-widget.tsx
        features-section.tsx
        hero-section.tsx
        site-footer.tsx
        site-header.tsx
      lib/
        website-i18n.tsx
        api.ts                 ← thin API client (NEXT_PUBLIC_API_URL)
    .env.example
    next.config.ts
    package.json
    Dockerfile
```

---

## Implementation Steps

### 1. Scaffold `itour-website/`
```bash
cd /home/gouda/iTourTT
npx create-next-app@latest itour-website --ts --tailwind --app --no-src-dir --no-eslint
```

### 2. Copy B2C assets
- Move `frontend/src/app/w/**` → `itour-website/src/app/`
- Move `frontend/src/components/website/**` → `itour-website/src/components/`
- Move `frontend/src/lib/website-i18n.tsx` → `itour-website/src/lib/`
- Create `itour-website/src/lib/api.ts` pointing to `NEXT_PUBLIC_API_URL`

### 3. Update main frontend
- Delete `frontend/src/app/w/` and `frontend/src/components/website/`
- Remove `website-i18n.tsx` from `frontend/src/lib/`
- Remove any `/w` links from the dashboard sidebar/header if present

### 4. Backend CORS update
In `backend/src/main.ts`, add the new website domain to the `cors` origins list.

### 5. Environment variables

**`itour-website/.env.production`**
```
NEXT_PUBLIC_API_URL=https://api.itourtt.cloud    # or the backend URL
NEXT_PUBLIC_GOOGLE_MAPS_KEY=...                  # if used
```

**`frontend/.env.production`** — no changes needed.

### 6. Dockerfile for `itour-website/`
Standard Next.js standalone Dockerfile (same pattern as `frontend/Dockerfile`).

### 7. DNS / hosting
| App | Domain | Server |
|-----|--------|--------|
| Dashboard (`frontend/`) | `fulvago.itourtt.cloud` | current VPS (k3s) |
| B2C Website (`itour-website/`) | e.g. `www.itourtt.cloud` | new server or separate k3s namespace |

---

## Key Decisions to Make Before Implementation

1. **New domain** for the B2C site (e.g. `www.itourtt.cloud`, `booking.itourtt.cloud`)
2. **Hosting target**: same VPS (new k3s namespace) or separate server?
3. **shadcn/ui**: confirm whether to install it in the new project or simplify components
4. **`/dashboard/website` admin panel**: stays in the main app (no change needed)

---

## What Does NOT Change
- Backend API — no new endpoints needed
- Dashboard admin panel for site settings (`/dashboard/website`)
- All existing frontend routes and functionality
