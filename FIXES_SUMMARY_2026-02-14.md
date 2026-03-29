# Fixes Summary (2026-02-14)

This document summarizes what was fixed and how the system should behave now.

## Tracking (Live Map / Geo)

### 1) Tenant resolution for geo APIs (especially on localhost/root)
- **What was happening:** Geo endpoints like `/api/geo/location/latest` could return empty/tenant errors when running on `localhost` or when the tenant context wasn’t inferred from the host.
- **What was changed:** The frontend API client now sends `X-Tenant-ID` from stored tenant when running on local dev hosts (and native runtime), while still preferring subdomain-based tenant routing on real tenant domains.
- **How it behaves now:** Live Tracking loads data for the correct tenant in local/root scenarios instead of showing “No live locations yet” due to tenant mismatch.
- **Code:** [api.ts](file:///p:/AttSystem/frontend/src/api.ts)

### 2) Geo settings defaulted to disabled on first-use
- **What was happening:** When `geo_settings` was auto-created for a tenant, it defaulted to `enabled=0`. Location updates would effectively pause, and live locations would not populate as expected.
- **What was changed:** When controllers auto-create `geo_settings`, they now insert with `enabled=1` by default.
- **How it behaves now:** New tenants get Geo enabled by default, so employee location updates start populating `geo_location_latest` immediately.
- **Code:** [LocationController.php](file:///p:/AttSystem/backend/src/Controller/LocationController.php), [GeoController.php](file:///p:/AttSystem/backend/src/Controller/GeoController.php)

## Roster (Duty Types / Assignments)

### 1) Duty Type list not loading / Duty Type dropdown unselectable
- **What was happening:** Duty Types could appear empty (so the “Duty Type” select had nothing to choose) when the roster APIs were called without a resolvable tenant context (same root cause as tracking).
- **What was changed:** Fixed tenant header behavior in the frontend API client for local dev/root scenarios.
- **How it behaves now:** Duty Types load correctly (assuming data exists), and the Duty Type dropdown is selectable.
- **Code:** [api.ts](file:///p:/AttSystem/frontend/src/api.ts), [Roster.tsx](file:///p:/AttSystem/frontend/src/Roster.tsx)

### 2) Manager roster management permission
- **What was happening:** Manager role could hit unexpected authorization issues around roster management depending on the builtin permission mapping used.
- **What was changed:** Added `roster.manage` permission to the manager builtin role mapping.
- **How it behaves now:** Manager can perform roster management actions that require `perm:roster.manage`.
- **Code:** [Auth.php](file:///p:/AttSystem/backend/src/Core/Auth.php)

## Payroll

### 1) Loan creation validation crash (missing method)
- **What was happening:** Loan creation used `getActiveSalaryStructure()` which doesn’t exist, causing a server error.
- **What was changed:** Replaced it with the existing `getSalaryStructure()` call.
- **How it behaves now:** Loan validation correctly reads the current active salary structure and proceeds without crashing.
- **Code:** [PayrollController.php](file:///p:/AttSystem/backend/src/Payroll/PayrollController.php), [PayrollStore.php](file:///p:/AttSystem/backend/src/Payroll/PayrollStore.php)

### 2) Encryption errors exposed internal config details
- **What was happening:** When encryption wasn’t configured, the API could return technical errors mentioning `APP_ENC_KEY` / `APP_KEY`.
- **What was changed:** Added a centralized “safe error message” mapping in PayrollController to sanitize encryption-related exceptions into a user-friendly message.
- **How it behaves now:** Users see a safe message like “Encryption is not configured. Please contact the system administrator.” rather than internal env key names.
- **Code:** [PayrollController.php](file:///p:/AttSystem/backend/src/Payroll/PayrollController.php), [Crypto.php](file:///p:/AttSystem/backend/src/Core/Crypto.php)

## Verification Performed
- Frontend:
  - `npm run lint` ✅
  - `npm run typecheck` ✅
- Backend:
  - PHP syntax checks for changed files ✅

## Notes / Remaining Environment Requirements
- If the server environment does not set `APP_ENC_KEY` or `APP_KEY`, encryption-dependent operations will still fail (by design). The fix here is the user-facing error message; proper encryption still requires a key configured in the environment.
