# Attendance SaaS Platform — Architecture Notes

This file is a “fast refresh” overview of the repository so you don’t need to rescan the whole project to understand how it works.

## Repository Layout

- `backend/` — Vanilla PHP JSON API, MySQL-backed, token auth
  - `public/index.php` — HTTP entrypoint, CORS, route registration
  - `src/Core/` — Router, Auth, Token, Database, Tenant resolution, data stores
  - `src/Controller/` — API controllers (attendance, employees, leaves, devices, etc.)
- `frontend/` — React (Vite) single-page app, MUI UI kit, Axios client
  - `src/App.tsx` — routes
  - `src/layout/AppShell.tsx` — main shell + nav + password change dialog
  - `src/api.ts` — Axios instance with auth + tenant headers
  - `src/*` — feature screens (Employees, Attendance, Leaves, Shifts, Devices, …)
- `docker/` + `docker-compose.yml` — MySQL + phpMyAdmin for local dev
- `kio_hik_attendance/` — separate Odoo module (not used by React/PHP runtime)
- `start-dev.bat` — Windows helper to reset DB and start backend+frontend

## Runtime (Local Dev)

- MySQL (Docker): `docker-compose.yml` starts a MySQL 8 container and phpMyAdmin.
  - Default DB creds (dev): `attendance/attpass`, db name `attendance_saas`.
  - Init SQL: `docker/mysql/init/*.sql` applied on fresh DB.
- Backend API: served under `https://khudroo.com/api` (or `https://<tenant>.khudroo.com/api`).
- Frontend: served under `https://khudroo.com` (or `https://<tenant>.khudroo.com`).

## Tenancy Model

Tenancy is driven by a “tenant subdomain” concept.

- Backend resolution:
  - `backend/src/Core/TenantResolver.php` resolves tenant from `HTTP_X_TENANT_ID` first, then host.
  - Controllers often resolve numeric `tenant_id` from the authenticated user (`Auth::currentUser()`) or fall back to `X-Tenant-ID` -> lookup in `tenants` table.
- Frontend behavior:
  - `frontend/src/api.ts` always attaches:
    - `Authorization: Bearer <token>` (if present)
    - `X-Tenant-ID: <subdomain>` derived from the browser hostname when host contains a dot and subdomain isn’t `superadmin`.
    - Otherwise uses local/session `tenant` hint if present.

## Authentication + Authorization

### Token auth

- Login endpoints:
  - Superadmin login: `POST /api/login`
  - Tenant login: `POST /api/tenant_login`
- Tokens:
  - Real token storage: `backend/src/Core/Token.php` writes to `auth_tokens` table.
  - Request auth parsing: `backend/src/Core/Auth.php` reads `Authorization: Bearer ...` and loads token data via `Token::get`.
  - Dev fallback tokens exist in `Auth::currentUser()` (`mock-jwt-token-xyz-123`, `mock-tenant-token-abc`).

### Authorization model

- Router-level guard:
  - `backend/src/Core/Router.php` supports `getAuth/postAuth(path, handler, roleOrPerm)`.
  - Route guards call `Auth::requireRole(...)` before controller execution.
- Permission checks:
  - `Auth::requireRole('perm:<name>')` -> `Auth::hasPermission(user, <name>)`.
  - Built-in permissions by role live in `backend/src/Core/Auth.php` (`tenant_owner`, `hr_admin`, `manager`, `employee`).
  - Dynamic permissions can also be pulled from the `roles` table (JSON list in `roles.permissions`).

### Frontend session model

- `frontend/src/utils/session.ts` defines a minimal `AppUser` type and reads `token`/`user` from localStorage/sessionStorage.
- `frontend/src/Login.tsx` stores `token` and `user` and navigates to `/dashboard`.

## Backend HTTP Entry & Routing

- HTTP entrypoint: `backend/public/index.php`
  - Registers a basic PSR-4 style autoloader for the `App\` namespace.
  - Sets permissive CORS headers (echoes request origin).
  - Registers all API routes in code and dispatches via `Router::dispatch`.

### Route map (high level)

The authoritative list is in `backend/public/index.php`. Key groups:

- Health/tenant:
  - `GET /api/health`
  - `GET /api/tenant`
- Auth:
  - `POST /api/login` (superadmin)
  - `POST /api/tenant_login` (tenant users)
  - `POST /api/forgot-password`
  - `POST /api/reset-password`
  - `POST /api/change_password` (authenticated)
- Tenants (superadmin):
  - `GET /api/tenants`
  - `POST /api/tenants`
- Employees:
  - `GET /api/employees` (`perm:employees.read`)
  - `POST /api/employees` (`perm:employees.write`)
  - `POST /api/employees/update` (`perm:employees.write`)
  - `GET /api/employees/device_sync_ids` (`perm:employees.read`)
- Attendance:
  - `GET /api/attendance` (`perm:attendance.read`)
  - `GET /api/attendance/dashboard` (`perm:attendance.read`)
  - `GET /api/attendance/days` (`perm:attendance.read`)
  - `GET /api/attendance/employee` (`perm:attendance.read`)
  - `GET /api/attendance/open` (`perm:attendance.clock`)
  - `POST /api/attendance/clockin` (`perm:attendance.clock`)
  - `POST /api/attendance/clockout` (`perm:attendance.clock`)
  - `POST /api/attendance/process` (`perm:attendance.read`)
- Leaves:
  - `GET /api/leaves` (`perm:leaves.read`)
  - `POST /api/leaves/apply` (`perm:leaves.apply`)
  - `POST /api/leaves/update` (`perm:leaves.approve`)
  - `POST /api/leaves` and `/api/leaves/delete` are `perm:leaves.manage` (admin-level)
- Shifts:
  - `GET /api/shifts` (`perm:attendance.read`)
  - `POST /api/shifts`/`update`/`delete`/`assign` (`perm:attendance.write`)
- Devices & Sites:
  - Device management endpoints are `perm:devices.manage` (except ingest).
  - Sites endpoints are `perm:sites.manage`.

## Data Storage

### MySQL schema (primary)

Schemas are created by the SQL scripts under `docker/mysql/init/`.
Notable tables include:

- `tenants`, `tenant_users`, `super_admins`
- `auth_tokens` (token auth)
- `roles` (optional dynamic permissions)
- `employees`, `shifts`
- `attendance_records`, `attendance_days`, `raw_events`
- `leaves`, `holidays`
- `devices`, `device_events`, `sites`
- `login_attempts`, `password_resets`
- `audit_log`

### Local JSON fallback (dev)

Some “store” classes have fallback behaviors when DB isn’t available.
Example: `backend/src/Core/EmployeesStore.php` references `backend/data/employees.json` as a fallback.

## Domain Concepts & Flows

### Attendance processing flow

- Raw punches (device ingest) land in `raw_events`.
- `AttendanceController::dashboard` supports `ensure_days=1`:
  - If raw events exist in the date range, it runs `AttendanceProcessor::processRange(...)` to materialize `attendance_days`.
- Frontend summary view:
  - `frontend/src/Attendance.tsx` calls `GET /api/attendance/dashboard` and builds per-employee summaries.

### Clock in/out flow

- `Clock` UI (frontend) uses:
  - `GET /api/attendance/open`
  - `POST /api/attendance/clockin`
  - `POST /api/attendance/clockout`
- Permissions:
  - requires `perm:attendance.clock` (allowed for `employee`, `hr_admin`, etc. per `Auth.php`).

### Leaves flow

- Leave status normalization (current model): `pending`, `approved`, `rejected`.
  - Implemented in `backend/src/Controller/AttendanceController.php` via `normalizeLeaveStatus`.
- Apply leave:
  - `POST /api/leaves/apply` (employees can apply for themselves; status forced to `pending` for employee role)
- List leaves:
  - `GET /api/leaves` supports filtering by month or range; employee role is restricted to their mapped `employee_id`.
- Review (approve/reject):
  - `POST /api/leaves/update` (`perm:leaves.approve`)
  - Non-managers can’t re-review an already reviewed leave (conflict).

### Employee “linking” model

- Tenant users can include `employee_id` in the token/user payload (see `backend/src/Controller/AuthController.php` tenant login response).
- When role is `employee`, endpoints like leaves are scoped to `user.employee_id`.

## Frontend Application Structure

- Tech stack:
  - React + TypeScript + Vite (`frontend/package.json`)
  - MUI components + Emotion styling
  - Axios client with interceptors
  - React Router routes defined in `frontend/src/App.tsx`
- Shell:
  - `frontend/src/layout/AppShell.tsx` provides:
    - left drawer / bottom nav menu items filtered by `user.role`
    - user menu and “Change Password” modal (`POST /api/change_password`)
- Screens:
  - `Dashboard.tsx` is primarily superadmin-focused (tenant creation, resets).
  - `Employees.tsx` provides employee CRUD and an attendance/leaves dialog per employee.
  - `Attendance.tsx` provides tenant attendance summaries and drilldowns.
  - `Leaves.tsx` provides leave overview and tenant approvals for pending leaves.
  - `Shifts.tsx`, `Devices.tsx`, `Sites.tsx` are management screens with permission gating on backend.

## Testing

- E2E tests:
  - Playwright config in `frontend/playwright.config.ts`
  - Specs under `frontend/tests/e2e/`
  - Script: `npm run test:e2e` (also attempts to run backend DB migrations via PHP scripts)

## Notes / Gotchas

- CORS: backend echoes `HTTP_ORIGIN` directly (`backend/public/index.php`), which is flexible for dev but should be tightened for production.
- `AttendanceController` contains additional endpoints (example: `payslipPreview`) that are not currently wired in `backend/public/index.php`.
- The `kio_hik_attendance/` directory is a separate Odoo addon and not used by the PHP/React runtime.
