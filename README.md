# Attendance & Payroll SaaS Platform

## Prerequisites
- **PHP 8.0+** (Ensure `php` is in your system PATH)
- **Composer** (For backend dependencies)
- **Node.js & npm** (For frontend)

## Project Structure
- `backend/`: Vanilla PHP Backend (API)
- `frontend/`: React + TypeScript Frontend

## Getting Started

### 1. Setup Backend
```bash
cd backend
# If you have composer:
composer install
# If not, a simple autoloader is provided in public/index.php for dev.
```

### 2. Setup Frontend
```bash
cd frontend
npm install
```

### 3. Run the Platform
You can use the provided `start-dev.bat` script (Windows) or run manually:

**Backend:**
```bash
cd backend
php -S 0.0.0.0:8000 -t public
```

**Frontend:**
```bash
cd frontend
npm run dev
```

## SaaS Multi-tenancy Testing
- Access `https://khudroo.com` -> Root portal
- Access `https://tenant1.khudroo.com` -> Tenant portal (isolated)

## API Endpoints
- `GET /api/health` -> Check service status
- `GET /api/tenant` -> Check resolved tenant
