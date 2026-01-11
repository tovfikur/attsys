@echo off
setlocal EnableExtensions EnableDelayedExpansion
echo ==============================================
echo Starting Attendance SaaS Platform (fresh state)
echo ==============================================

echo [Step 1] Ensuring MySQL container is running...
docker start attendance_mysql >nul 2>nul

echo [Step 2] Resetting database to latest schema...
docker exec attendance_mysql mysql -u root -pattroot -e "DROP DATABASE IF EXISTS attendance_saas; CREATE DATABASE attendance_saas;"
for %%F in (01_schema.sql 02_tenant_users.sql 03_audit.sql 04_auth_tokens.sql 05_roles.sql 06_sites_devices.sql 07_device_events.sql 08_raw_attendance.sql 09_login_security.sql 10_super_admins.sql 11_password_resets.sql 12_shifts.sql 13_attendance_records.sql 14_leaves.sql) do (
  echo   Applying %%F
  docker exec attendance_mysql mysql -u root -pattroot attendance_saas -e "SOURCE /docker-entrypoint-initdb.d/%%F;"
)

echo [Step 3] Clearing frontend caches...
if exist frontend\node_modules\.vite rmdir /S /Q frontend\node_modules\.vite
if exist frontend\dist rmdir /S /Q frontend\dist

echo [Step 4] Starting Backend API...
start "Backend API" cmd /k "cd /d %~dp0backend && C:\tools\php\php.exe -S 0.0.0.0:8000 -t public"

echo [Step 5] Starting Frontend App (force fresh bundle)...
start "Frontend App" cmd /k "cd /d %~dp0frontend && npm run dev -- --force"

echo ----------------------------------------------
echo Services started with fresh DB and UI bundles!
echo Frontend: https://khudroo.com
echo Backend:  https://khudroo.com/api
endlocal
