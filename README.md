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
php -S localhost:8000 -t public
```

**Frontend:**
```bash
cd frontend
npm run dev
```

## SaaS Multi-tenancy Testing
- Access `http://localhost:5173` -> Simulates "Public/Superadmin" (Backend sees `localhost`)
- Access `http://tenant1.localhost:5173` -> Simulates "Tenant1" (Backend sees `tenant1.localhost`)
  *Note: You might need to add `127.0.0.1 tenant1.localhost` to your hosts file.*

## API Endpoints
- `GET /api/health` -> Check service status
- `GET /api/tenant` -> Check resolved tenant
