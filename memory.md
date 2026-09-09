# Memory – iTour Transport & Traffic

This file tracks **all user instructions, decisions, and session progress** throughout the development journey.

---

## Session 1 – 2026-01-29

### Instructions Received
1. Read all spec files before starting development.
2. Create `memory.md` to track instructions and session progress.
3. Create `progress.md` to track project progress per completed function.
4. Utilize Claude agents/cowork for parallel development.
5. Start development following the mandated build order from CLAUDE.md.

### Decisions Made
- Project starts from scratch (no existing code, only spec .md files).
- Build order follows CLAUDE.md: Prisma schema -> NestJS modules -> Dispatch API -> Dispatch UI -> Finance & Odoo -> Reporting.
- Using parallel agents for independent tasks (e.g., frontend + backend scaffolding).

### Standing Instructions (from CLAUDE.md & user)
- Login form: compact, glass effect, black abstract background with 10% blur.
- No MVP shortcuts. Production-grade code only.
- Tech stack is locked. No substitutions.
- Zones are the pricing unit. Location tree is strict hierarchy.
- Assignment order: Vehicle -> Driver -> Rep.
- Pax must never exceed vehicle capacity.
- Financial records immutable after posting.
- All exports must be Odoo-ready (no Odoo customization).
- If conflicts in specs appear, ask before changing.

---

---

## Session 2 – 2026-02-06

### Phase 10 Refactor – Design Decisions
User chose the following for the Traffic Assign redesign:

1. **ServiceType CITY → EXCURSION**: Rename enum value (remove CITY entirely)
2. **Origin/Destination storage**: 6 separate FK columns (originAirportId, originZoneId, originHotelId, destinationAirportId, destinationZoneId, destinationHotelId)
3. **hotelId field**: Keep deprecated (nullable FK preserved)
4. **Customer invoicing**: Reuse AgentInvoice (nullable agentId + customerId)
5. **Notes field**: Keep on both Online and B2B tabs

### Work Completed
- Updated Prisma schema: removed CITY enum, added 6 origin/dest FKs, made AgentInvoice.agentId nullable, added customerId, removed CustomerInvoice/CustomerInvoiceLine/CustomerPayment models
- Synced DB via `prisma db push` + baseline migration
- Updated all backend services: traffic-jobs, dispatch, finance, export, reports, customers DTOs
- Updated all frontend: types, traffic-jobs page (12 service types, separate FK form fields), dispatch page, finance page, rep portal pages
- Zero TypeScript errors in both frontend and backend

### Remaining Phase 10 Work
- ~~Rep flight-aware validation~~ (already implemented)
- ~~Driver time-aware validation~~ (already implemented)
- ~~Available drivers/reps rewrite with jobId param~~ (already implemented)
- ~~Block rep assignment on Excursion jobs~~ (already implemented)
- ~~Add "customers" to role permission seeds~~ (completed)

**Phase 10 is 100% complete.**

---

## Session 2 (continued) – 2026-02-06

### Phase 11: Driver Extranet + No Show Evidence

User requested:
1. **Driver Extranet** — mirrors the Rep Extranet so drivers can log in, see jobs, update statuses, view trip fee history, and receive notifications
2. **No Show Evidence** — both driver and rep extranets require 2 photo uploads + GPS location capture when marking a job as NO_SHOW

### Design Decisions
- No Show evidence stored in separate `NoShowEvidence` model (not on TrafficJob)
- GPS coordinates + Google Maps link stored per evidence record
- `submittedBy` field tracks whether DRIVER or REP submitted the evidence
- NO_SHOW removed from simple status update endpoints — must go through evidence endpoint
- COMPLETED and CANCELLED still use simple confirmation
- Driver portal at `/driver`, mirrors rep portal at `/rep`

### Work Completed
- Schema: DRIVER role, Driver.userId FK, DriverNotification model, NoShowEvidence model
- Backend: auth driverId resolution, driver account management (create/reset password), driver-portal module (8 endpoints), rep-portal no-show endpoint
- Frontend: DRIVER type, login redirect, NoShowEvidenceDialog shared component, driver portal (layout + dashboard + history), rep portal modified to use evidence dialog
- Zero TypeScript errors in both frontend and backend

---

## Session 4 – 2026-02-08

### Work Completed

#### Vehicle Compliance & Deposits
- Added vehicle compliance tracking (insurance, license, inspection dates)
- Vehicle detail page with compliance history
- New vehicle form page
- Deposit payment DTO and endpoint

#### Dispatch Export & Client Sign PDF
- Implemented bulk PDF generation for client pickup signs using `pdf-lib`
- Signs include company logo (90% page width), "Mr/Mrs" text, and large bold client name
- Print Signs button on traffic jobs page generates PDF for tomorrow's date
- Jobs with `printSign=true` and non-null `clientName` are included

#### WYSIWYG Rich Text Editor (TipTap)
- Replaced raw HTML textareas for report header/footer with TipTap WYSIWYG editor
- Created `frontend/src/components/rich-text-editor.tsx` with full toolbar:
  - Bold, Italic, Underline, H1/H2/H3, Bullet/Ordered List, Align L/C/R
  - Table support (insert, add/delete rows/columns, delete table)
  - Company logo insertion with size slider (10-100%)
  - Shortcode buttons: {{reportName}}, {{dateTime}}, {{user}}
- Packages: @tiptap/react, @tiptap/starter-kit, @tiptap/extension-text-align, @tiptap/extension-underline, @tiptap/extension-image, @tiptap/extension-table (+ row/cell/header)

#### Reports Page UI
- Made stat cards compact (reduced padding, font sizes)
- All stats in single row using grid layout
- Service type cards on same line as stats (8 equal-width cards)
- Fixed duplicate React key warning in compliance table

#### Other Fixes
- Fixed dispatch page customer rep fields display
- Updated driver portal and rep portal pages
- Updated B2B traffic jobs page
- Updated i18n translations (en + ar)

## Session – 2026-09-09 (Complaints: reply date, outcome, analytics)

> This file was last written to in February 2026 and does not cover the months between. The durable
> record is `CODEMAP.md` + `docs/map/` (rules in `11-business-rules.md`); this entry resumes it.

### Instructions Received
1. Complaint modal: add a field logging the date the complaint was replied to (date picker).
2. Complaint modal: add a field showing the time left before the reply deadline.
3. Complaint modal: two radio buttons — Won / Lost — before the Amounts section; Amounts appear only
   when Lost is selected.
4. Hold all commits, pushes and deploys until told the modifications were finished.
5. Show the outcome radios in the detail dialog too, remove the exchange-rate field, and add a page
   with complete analytics for the complaints received.
6. Commit, push and deploy.

### Decisions Made
- The reply date uses `datetime-local`, not a date-only picker: the SLA is measured in hours, so a
  midnight assumption would decide "in time / late" wrongly.
- Won/Lost is a **new persisted field** (`Complaint.outcome`), not a re-use of `status`: the outcome
  has to be recordable before a complaint is settled, while `status` stays the lifecycle authority.
  Transitions keep the two in step and the backend refuses an edit that contradicts a terminal status.
- A new complaint that is merely overdue is left unflagged on create, because the hourly sweep both
  flags it and notifies its owner — pre-flagging would silence the notification.
- The exchange-rate **column stays** (defaulting to 1) though the input is gone; it still converts
  foreign-currency claims into the EGP totals on the analytics screen.
- Analytics aggregates in a single in-memory pass rather than a dozen `groupBy` queries, so every
  breakdown agrees with the headline numbers. No chart library was added — the bars are CSS.

### Outcome
Shipped in commit `5c2e12a`, deployed to production the same day: migration applied, pods healthy,
`/dashboard/complaints/analytics` serving. Still open, and the user's call: `complaints.analytics`
(like the rest of the complaint keys) is not granted to the 10 custom production roles, which needs a
manual `rolePermissionV2` insert because prod deploys with `SKIP_PERMISSION_SEED=true`.

---

---

## Change Log

| Date | Change | Requested By |
|------|--------|-------------|
| 2026-01-29 | Project initialized, memory.md and progress.md created | User |
| 2026-02-06 | Phase 10 schema refactor: CITY→EXCURSION, 6 FK columns, AgentInvoice consolidation | User |
| 2026-02-06 | Phase 10 backend+frontend updates for refactored schema | User |
| 2026-02-06 | Phase 10 completed: all dispatch validations confirmed, customers added to role permissions | User |
| 2026-02-06 | Phase 11: Driver Extranet + No Show Evidence (schema, backend, frontend) | User |
| 2026-02-08 | Session 4: Customer rep fields, dispatch export, client sign PDF, WYSIWYG editor, reports UI | User |
| 2026-09-08 | Complaint tracking shipped: lifecycle, 48h reply SLA, charges, agent adjustments, score penalties | User |
| 2026-09-09 | Complaint reply date + deadline countdown, Won/Lost outcome, exchange-rate field removed, Complaint Analytics page | User |
