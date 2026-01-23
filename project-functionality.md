# AttSystem - Attendance Management System

## Overview
AttSystem is a comprehensive multi-tenant attendance management SaaS application with mobile support. It provides biometric device integration, leave management, messaging capabilities, and detailed attendance tracking for organizations.

## Technology Stack

### Backend
- **Language**: PHP (no Composer dependency)
- **Database**: MySQL/MariaDB
- **Architecture**: Multi-tenant with subdomain-based tenant resolution
- **Authentication**: JWT-based with role-based access control (RBAC)
- **API**: RESTful with dynamic CORS handling

### Frontend
- **Framework**: React 19 with TypeScript
- **UI Library**: Material-UI (MUI) v7
- **Mobile**: Capacitor 7 for Android app generation
- **Routing**: React Router v7
- **HTTP Client**: Axios
- **Build Tool**: Vite

### Mobile App
- **Platform**: Android (via Capacitor)
- **Permissions**: Printer, Notifications, Bluetooth
- **Build Variants**: Release (signed) and Staging (unsigned)

## Core Features

### 1. Multi-Tenant Architecture
- **Subdomain-based tenant isolation**: Each tenant gets a unique subdomain
- **Tenant resolution middleware**: Automatically resolves tenant from host/subdomain
- **Data isolation**: All data is scoped to individual tenants
- **Superadmin portal**: Global administration across all tenants

### 2. User Authentication & Authorization
- **Multiple login types**:
  - Superadmin login (global access)
  - Tenant owner login (tenant-scoped)
  - Employee login (limited access)
- **Role-based permissions**:
  - `superadmin`: Full system access
  - `tenant_owner`: Tenant administration
  - `perm:employees.read/write`: Employee management
  - `perm:attendance.read/write/clock`: Attendance operations
  - `perm:leaves.read/manage/apply/approve`: Leave management
  - `perm:devices.manage`: Device configuration
  - `perm:sites.manage`: Site/location management

### 3. Employee Management
- **Employee profiles**: Personal details, contact info, employment data
- **Shift assignment**: Assign employees to work shifts
- **Profile photos**: Upload and manage employee photos
- **Document attachments**: Store employee documents (contracts, certificates, etc.)
- **Employee codes**: Unique identifiers for each employee
- **Status tracking**: Active/inactive employee status
- **Department and designation management**

### 4. Attendance System
- **Clock in/out functionality**: Web and mobile support
- **Biometric device integration**: Hikvision device support
- **Multiple attendance methods**: Manual, biometric, mobile
- **Shift management**: Define work shifts with start/end times
- **Late tolerance**: Configurable late arrival allowances
- **Early exit tracking**: Monitor early departures
- **Break duration management**
- **Working days configuration**: Per-shift working day schedules
- **Attendance evidence**: Photo capture on clock events

### 5. Leave Management
- **Leave types**: Casual, sick, annual, etc. (configurable)
- **Leave allocation**: Set annual leave quotas per employee
- **Leave application**: Employee self-service portal
- **Leave approval workflow**: Manager approval process
- **Leave balance tracking**: Real-time balance calculation
- **Leave calendar**: Visual leave scheduling
- **Half-day leave support**: Full day or partial day leaves
- **Leave status tracking**: Pending, approved, rejected
- **Action indicators**: Visual indicators for pending leave requests

### 6. Holiday Management
- **Public holidays**: Define organization-wide holidays
- **Regional holidays**: Location-specific holiday calendars
- **Holiday impact**: Automatic attendance calculation adjustments

### 7. Messenger System
- **Internal messaging**: Employee-to-employee communication
- **Conversation threads**: Organized message conversations
- **Unread message indicators**: Visual notification badges
- **Broadcast messages**: Send announcements to groups
- **Message history**: Persistent conversation records
- **Real-time updates**: Live message indicators

### 8. Device Management
- **Biometric device registration**: Add and configure devices
- **Hikvision integration**: Native support for Hikvision devices
- **Device status monitoring**: Online/offline status tracking
- **Device events**: Log device activities
- **Biometric enrollment**: Employee fingerprint/face enrollment
- **Device synchronization**: Sync attendance logs from devices
- **API configuration**: Device-specific API settings
- **Connection testing**: Verify device connectivity

### 9. Site/Location Management
- **Multiple locations**: Support for multiple office locations
- **Site-specific devices**: Assign devices to locations
- **Location-based attendance**: Geo-specific clock operations

### 10. Reporting & Analytics
- **Attendance reports**: Daily, weekly, monthly attendance summaries
- **Employee statistics**: Individual attendance patterns
- **Late arrival reports**: Track punctuality issues
- **Early departure reports**: Monitor early exits
- **Leave reports**: Leave utilization and balance reports
- **Dashboard overview**: Key metrics and trends

### 11. Mobile App Features
- **Native Android app**: Built with Capacitor
- **Offline capability**: Limited offline functionality
- **Push notifications**: Attendance reminders and alerts
- **Camera integration**: Photo capture for attendance evidence
- **Biometric support**: Device biometric authentication
- **Printer integration**: Print attendance reports/receipts
- **Mobile-optimized UI**: Responsive design for mobile devices

### 12. Security Features
- **Login attempt protection**: Rate limiting and temporary bans
- **Session management**: Secure token-based authentication
- **Audit logging**: Track all system activities
- **Data encryption**: Secure data transmission and storage
- **Role-based access**: Granular permission control
- **Tenant isolation**: Complete data separation between tenants

## API Endpoints

### Authentication
- `POST /api/login` - User login
- `POST /api/tenant_login` - Tenant-specific login
- `POST /api/forgot-password` - Password reset request
- `POST /api/reset-password` - Password reset confirmation

### Employee Management
- `GET /api/employees` - List employees
- `POST /api/employees` - Create employee
- `POST /api/employees/update` - Update employee
- `POST /api/employees/delete` - Delete employee
- `GET /api/employees/profile_photo` - Get profile photo
- `POST /api/employees/profile_photo/upload` - Upload profile photo
- `GET /api/employees/attachments` - List attachments
- `POST /api/employees/attachments/upload` - Upload attachment

### Attendance
- `GET /api/attendance` - List attendance records
- `GET /api/attendance/dashboard` - Dashboard statistics
- `POST /api/attendance/clockin` - Clock in
- `POST /api/attendance/clockout` - Clock out
- `GET /api/attendance/evidence` - Get attendance evidence
- `POST /api/biometrics/enroll` - Enroll biometric data

### Leave Management
- `GET /api/leaves` - List leave records
- `GET /api/leaves/pending_unseen` - Get pending leave count
- `POST /api/leaves/mark_seen` - Mark leaves as seen
- `GET /api/leaves/balance` - Get leave balance
- `POST /api/leaves` - Create leave (admin)
- `POST /api/leaves/apply` - Apply for leave (employee)

### Messenger
- `GET /api/messenger/people` - List available people
- `GET /api/messenger/conversations` - List conversations
- `GET /api/messenger/unread_count` - Get unread message count
- `POST /api/messenger/messages/send` - Send message

### Device Management
- `GET /api/devices` - List devices
- `POST /api/devices/register` - Register device
- `POST /api/devices/update` - Update device
- `GET /api/devices/hik/config` - Get Hikvision config
- `POST /api/devices/hik/sync` - Sync device logs

## Database Schema

### Core Tables
- `tenants` - Tenant organizations
- `tenant_users` - Tenant administrators
- `employees` - Employee records
- `shifts` - Work shift definitions
- `attendance_records` - Attendance logs
- `leaves` - Leave applications
- `holidays` - Public holidays
- `devices` - Biometric device configuration
- `sites` - Office locations
- `auth_tokens` - Authentication tokens
- `messenger_conversations` - Message conversations
- `messenger_messages` - Individual messages

## Recent Enhancements

### Action-Clearing Indicators
- **Leave indicators**: Visual badges showing pending leave requests
- **Message indicators**: Unread message count badges
- **Auto-clear functionality**: Indicators clear when viewed/accessed
- **Real-time updates**: Live refresh of indicator states

### Mobile App Improvements
- **Printer support**: Added printer permissions for report printing
- **Notification support**: Push notification capabilities
- **Staging builds**: Unsigned APK variant for testing
- **Permission management**: Proper Android permission handling

## Deployment

### Backend Deployment
- PHP 7.4+ compatible
- MySQL/MariaDB database
- Apache/Nginx web server
- SSL certificate for HTTPS
- Environment-based configuration

### Frontend Deployment
- Static file hosting (Vite build output)
- CDN for asset delivery
- Environment variable configuration
- Progressive Web App (PWA) capable

### Mobile App Distribution
- **Android APK**: Signed release builds
- **Staging APK**: Unsigned builds for testing
- **App Store**: Ready for Google Play Store submission
- **Enterprise distribution**: Support for MDM deployment

## Integration Capabilities

### Biometric Devices
- **Hikvision**: Full API integration
- **Device enrollment**: Automated employee sync
- **Real-time sync**: Live attendance data
- **Event logging**: Comprehensive device event tracking

### External Systems
- **API access**: RESTful JSON API
- **Webhook support**: Event notifications
- **CSV export**: Data export capabilities
- **Third-party integrations**: Flexible integration architecture

This system provides a complete attendance management solution suitable for organizations of all sizes, with particular strength in multi-location businesses requiring biometric attendance tracking and comprehensive leave management.