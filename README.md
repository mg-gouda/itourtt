# iTourTT - Transport & Traffic Management System

A production-grade, full-stack enterprise transport, traffic, and accounting system built for Egypt-based transfer operations. Fully compatible with Odoo ERP — no customization required on the Odoo side.

## Overview

iTourTT manages the complete lifecycle of transport operations: from booking traffic jobs and dispatching vehicles, to invoicing agents and exporting Odoo-ready accounting data. The system supports multiple user roles, real-time dispatch, multi-currency finance, and bilingual (English/Arabic) interfaces.

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| **Backend** | NestJS, TypeScript, REST APIs, JWT + Refresh Tokens |
| **Database** | PostgreSQL 16, Prisma ORM, UUID primary keys |
| **Infrastructure** | Docker, Docker Compose |
| **Timezone** | Africa/Cairo |

## Key Features

### Dispatch Console
- Daily view with ARR (arrival) jobs on the left, DEP (departure) on the right
- Excel-like inline editing grid with keyboard navigation
- Real-time conflict validation (capacity, double-booking)
- Assignment order enforcement: Vehicle -> Driver -> Rep

### Traffic Jobs
- B2B (agent) and Online (direct) booking management
- Service types: ARR, DEP, CITY
- Auto-generated internal booking references
- Pax count validated against vehicle capacity

### Finance & Invoicing
- Multi-currency support with exchange rates stored per transaction
- Egyptian tax compliance
- Invoice lifecycle: Draft -> Posted (immutable) -> Paid
- Odoo ERP-compatible Excel exports (res.partner, account.move, account.payment, account.tax)

### Location Hierarchy
- Country -> Airport -> City -> Zone -> Hotel
- Zones as the fundamental pricing unit
- All route pricing is zone-to-zone

### Fleet Management
- Vehicle types with seat capacity enforcement
- Compliance document tracking with expiry alerts
- Driver and rep management with portal access

### Agent Management
- Full legal profile with document storage
- Credit limits and credit days
- Customizable price lists per agent (zone-to-zone, per vehicle type)
- Configurable invoice cycles

### Supplier Portal
- External transport providers with their own vehicles, drivers, and price lists
- Self-service portal for supplier resource management

### Permissions & Security
- Role-Based Access Control (RBAC) with granular permission tree
- System roles: Admin, Dispatcher, Accountant, Agent Manager, Viewer, Rep, Driver, Supplier
- Permission-based UI rendering (sidebar, pages, actions)
- JWT authentication with refresh token rotation

### Activity Log
- Automatic audit trail for all create/update/delete actions
- Filterable by user, action type, entity, and date range
- Detailed request data captured per action
- Excel export for compliance and auditing

### Portals
- **Driver Portal** - View assignments, update trip status with GPS tracking
- **Rep Portal** - Track assignments, update status with live GPS location
- **Supplier Portal** - Manage vehicles, drivers, and pricing

### Reports & Exports
- Operational and financial reporting
- Configurable date ranges and filters
- Excel export across all modules
- Odoo-ready accounting export format

### Built-in Help Center
- Comprehensive user manual for all 17 system modules
- Searchable documentation with step-by-step instructions
- Accessible via the header help icon

### Internationalization
- Full English and Arabic language support
- RTL layout support for Arabic

## Project Structure

```
iTourTT/
├── backend/                  # NestJS API server
│   ├── prisma/               # Database schema & migrations
│   ├── src/
│   │   ├── auth/             # JWT authentication & refresh tokens
│   │   ├── permissions/      # RBAC permission system
│   │   ├── users/            # User management
│   │   ├── locations/        # Location hierarchy (Country->Hotel)
│   │   ├── vehicles/         # Fleet & vehicle types
│   │   ├── drivers/          # Driver management
│   │   ├── reps/             # Representative management
│   │   ├── agents/           # Agent profiles & price lists
│   │   ├── customers/        # Customer records
│   │   ├── suppliers/        # Supplier management
│   │   ├── traffic-jobs/     # Booking management
│   │   ├── dispatch/         # Dispatch console API
│   │   ├── finance/          # Invoicing & Odoo exports
│   │   ├── reports/          # Report generation
│   │   ├── activity-logs/    # Audit trail
│   │   ├── job-locks/        # Concurrent editing protection
│   │   ├── settings/         # Company settings
│   │   ├── driver-portal/    # Driver portal API
│   │   ├── rep-portal/       # Rep portal API
│   │   ├── supplier-portal/  # Supplier portal API
│   │   └── whatsapp-notifications/  # WhatsApp templates
│   └── Dockerfile
├── frontend/                 # Next.js application
│   ├── src/
│   │   ├── app/
│   │   │   ├── (dashboard)/  # Main dashboard pages
│   │   │   ├── (driver-portal)/   # Driver portal
│   │   │   ├── (rep-portal)/      # Rep portal
│   │   │   ├── (supplier-portal)/ # Supplier portal
│   │   │   └── login/        # Authentication
│   │   ├── components/       # Reusable UI components
│   │   ├── lib/              # Utilities, i18n, API client
│   │   ├── stores/           # Zustand state management
│   │   └── hooks/            # Custom React hooks
│   └── Dockerfile
└── docker-compose.yml        # Full stack orchestration
```

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 16+ (or use Docker)
- npm

### Quick Start with Docker

```bash
# Clone the repository
git clone https://github.com/mg-gouda/itourtt.git
cd itourtt

# Create environment file
cp .env.example .env
# Edit .env with your JWT secrets

# Start all services
docker compose up -d

# The application will be available at:
# Frontend: http://localhost:3000
# Backend:  http://localhost:3001
```

### Manual Setup

**Backend:**

```bash
cd backend
npm install
npx prisma db push
npx prisma db seed
npm run start:dev
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

### Default Admin Credentials

```
Email:    admin@itour.local
Password: Admin@123
```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `POSTGRES_USER` | Database user | `itour` |
| `POSTGRES_PASSWORD` | Database password | `itour_secure_2026` |
| `POSTGRES_DB` | Database name | `itour_db` |
| `JWT_SECRET` | JWT signing secret | Required |
| `JWT_EXPIRES_IN` | Access token TTL | `15m` |
| `JWT_REFRESH_SECRET` | Refresh token secret | Required |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL | `7d` |
| `BACKEND_PORT` | Backend port | `3001` |
| `FRONTEND_PORT` | Frontend port | `3000` |

## API Documentation

All endpoints follow REST conventions with JWT authentication:

- `POST /auth/login` - Authenticate and receive tokens
- `POST /auth/refresh` - Refresh access token
- `GET/POST/PATCH/DELETE /api/{resource}` - CRUD operations
- All mutating endpoints are audit-logged automatically

## License

UNLICENSED - Proprietary software.

## Author

Developed by **Mohamed Gouda**
