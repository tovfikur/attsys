# AttSystem - Android API Documentation

**REST API Documentation for Mobile Development**  
**API Version**: 1.0  
**Base URL**: `https://your-subdomain.attsystem.com/api`  
**Last Updated**: February 9, 2026

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Authentication](#authentication)
3. [API Modules](#api-modules)
4. [Common Patterns](#common-patterns)
5. [Error Handling](#error-handling)
6. [Best Practices](#best-practices)

---

## Getting Started

### Base URL Structure

```
Production: https://{tenant}.attsystem.com/api
Development: http://localhost/api
```

### Headers

All API requests should include:

```
Content-Type: application/json
Authorization: Bearer {jwt_token}
X-Tenant-ID: {tenant_subdomain} (optional, auto-detected from domain)
```

### Response Format

All responses are in JSON format:

```json
{
  "data": {},
  "error": "Error message if any",
  "message": "Success message if any"
}
```

---

## Authentication

### 1.1 Login

**Endpoint**: `POST /api/login`  
**Auth Required**: No  
**Permission**: Public

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Success Response** (200 OK):
```json
{
  "user": {
    "id": "123",
    "name": "John Doe",
    "email": "user@example.com",
    "role": "employee",
    "permissions": ["attendance.clock", "leaves.apply"]
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tenant": {
    "id": "1",
    "subdomain": "demo",
    "name": "Demo Company"
  }
}
```

**Error Response** (401 Unauthorized):
```json
{
  "error": "Invalid credentials"
}
```

---

### 1.2 Tenant Login

**Endpoint**: `POST /api/tenant_login`  
**Auth Required**: No

Employee login with employee code + password.

**Request Body**:
```json
{
  "employee_code": "EMP001",
  "password": "password123",
  "tenant_subdomain": "demo"
}
```

---

### 1.3 Forgot Password

**Endpoint**: `POST /api/forgot-password`  
**Auth Required**: No

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

---

### 1.4 Reset Password

**Endpoint**: `POST /api/reset-password`  
**Auth Required**: No

**Request Body**:
```json
{
  "token": "reset_token_from_email",
  "password": "newPassword123"
}
```

---

### 1.5 Change Password

**Endpoint**: `POST /api/change_password`  
**Auth Required**: Yes  
**Permission**: any

**Request Body**:
```json
{
  "current_password": "oldPassword",
  "new_password": "newPassword123"
}
```

---

## API Modules

### 2. Employee Management

#### 2.1 List Employees

**Endpoint**: `GET /api/employees`  
**Auth Required**: Yes  
**Permission**: `employees.read`

**Query Parameters**:
- `status` (optional): `active` | `inactive` | `all`
- `department` (optional): Department ID
- `search` (optional): Search term

**Success Response**:
```json
{
  "employees": [
    {
      "id": "1",
      "code": "EMP001",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+8801712345678",
      "designation": "Software Engineer",
      "department": "IT",
      "status": "active",
      "date_of_joining": "2024-01-15",
      "photo_url": "/api/employees/profile_photo?employee_id=1"
    }
  ]
}
```

---

#### 2.2 Create Employee

**Endpoint**: `POST /api/employees`  
**Auth Required**: Yes  
**Permission**: `employees.write`

**Request Body**:
```json
{
  "code": "EMP002",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+8801712345679",
  "designation": "HR Manager",
  "department": "Human Resources",
  "date_of_joining": "2024-02-01",
  "status": "active",
  "address": "123 Main St, Dhaka",
  "salary": 50000
}
```

---

#### 2.3 Update Employee

**Endpoint**: `POST /api/employees/update`  
**Auth Required**: Yes  
**Permission**: `employees.write`

**Request Body**:
```json
{
  "id": "1",
  "name": "John Doe Updated",
  "phone": "+8801712345680",
  "status": "active"
}
```

---

#### 2.4 Get Profile Photo

**Endpoint**: `GET /api/employees/profile_photo`  
**Auth Required**: Yes  
**Permission**: `employees.read`

**Query Parameters**:
- `employee_id`: Employee ID

**Response**: Binary image data (JPEG/PNG)

---

#### 2.5 Upload Profile Photo

**Endpoint**: `POST /api/employees/profile_photo/upload`  
**Auth Required**: Yes  
**Permission**: `employees.write`  
**Content-Type**: `multipart/form-data`

**Form Data**:
- `employee_id`: Employee ID
- `photo`: Image file

---

### 3. Attendance Management

#### 3.1 Get My Open Shift

**Endpoint**: `GET /api/attendance/open`  
**Auth Required**: Yes  
**Permission**: `attendance.clock`

Returns current open shift (if clocked in).

**Success Response**:
```json
{
  "shift": {
    "id": "123",
    "date": "2024-02-09",
    "clock_in": "09:00:00",
    "clock_out": null,
    "status": "present"
  }
}
```

---

#### 3.2 Clock In

**Endpoint**: `POST /api/attendance/clockin`  
**Auth Required**: Yes  
**Permission**: `attendance.clock`

**Request Body**:
```json
{
  "latitude": 23.8103,
  "longitude": 90.4125,
  "photo_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "device_info": "Android 13, Samsung Galaxy S21"
}
```

**Success Response**:
```json
{
  "message": "Clocked in successfully",
  "attendance": {
    "id": "123",
    "clock_in": "2024-02-09 09:05:00",
    "status": "late"
  }
}
```

---

#### 3.3 Clock Out

**Endpoint**: `POST /api/attendance/clockout`  
**Auth Required**: Yes  
**Permission**: `attendance.clock`

**Request Body**:
```json
{
  "latitude": 23.8103,
  "longitude": 90.4125,
  "photo_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

---

#### 3.4 List Attendance

**Endpoint**: `GET /api/attendance`  
**Auth Required**: Yes  
**Permission**: `attendance.read`

**Query Parameters**:
- `from`: Start date (YYYY-MM-DD)
- `to`: End date (YYYY-MM-DD)
- `employee_id` (optional): Filter by employee

**Success Response**:
```json
{
  "attendance": [
    {
      "id": "1",
      "employee_id": "1",
      "employee_name": "John Doe",
      "date": "2024-02-09",
      "clock_in": "09:05:00",
      "clock_out": "18:00:00",
      "status": "present",
      "is_late": true,
      "late_mins": 5,
      "working_hours": 8.92,
      "overtime_hours": 0.92
    }
  ]
}
```

---

#### 3.5 Get Dashboard

**Endpoint**: `GET /api/attendance/dashboard`  
**Auth Required**: Yes  
**Permission**: `attendance.read`

**Query Parameters**:
- `month`: Month (1-12)
- `year`: Year (YYYY)

**Success Response**:
```json
{
  "summary": {
    "total_employees": 50,
    "present_today": 45,
    "absent_today": 3,
    "on_leave_today": 2,
    "late_today": 5,
    "avg_working_hours": 8.2
  },
  "monthly_stats": {
    "total_working_days": 22,
    "avg_attendance_rate": 95.5
  }
}
```

---

### 4. Leave Management

#### 4.1 Get Leave Types

**Endpoint**: `GET /api/leave_types`  
**Auth Required**: Yes  
**Permission**: `leaves.read`

**Success Response**:
```json
{
  "leave_types": [
    {
      "id": "1",
      "name": "Annual Leave",
      "code": "AL",
      "max_days_per_year": 20,
      "allow_carryover": true,
      "is_paid": true
    },
    {
      "id": "2",
      "name": "Sick Leave",
      "code": "SL",
      "max_days_per_year": 10,
      "is_paid": true
    }
  ]
}
```

---

#### 4.2 Get Leave Balance

**Endpoint**: `GET /api/leaves/balance`  
**Auth Required**: Yes  
**Permission**: `leaves.read`

**Query Parameters**:
- `employee_id` (optional): Employee ID (defaults to current user)
- `year` (optional): Year (defaults to current year)

**Success Response**:
```json
{
  "balances": [
    {
      "leave_type_id": "1",
      "leave_type_name": "Annual Leave",
      "allocated": 20,
      "used": 5,
      "pending": 2,
      "remaining": 13
    }
  ]
}
```

---

#### 4.3 Apply for Leave

**Endpoint**: `POST /api/leaves/apply`  
**Auth Required**: Yes  
**Permission**: `leaves.apply`

**Request Body**:
```json
{
  "leave_type_id": "1",
  "from_date": "2024-03-01",
  "to_date": "2024-03-03",
  "reason": "Family vacation",
  "is_half_day": false
}
```

**Success Response**:
```json
{
  "message": "Leave application submitted successfully",
  "leave": {
    "id": "123",
    "status": "pending",
    "days_count": 3
  }
}
```

---

#### 4.4 List Leaves

**Endpoint**: `GET /api/leaves`  
**Auth Required**: Yes  
**Permission**: `leaves.read`

**Query Parameters**:
- `employee_id` (optional): Filter by employee
- `status` (optional): `pending` | `approved` | `rejected` | `all`
- `from`: Start date
- `to`: End date

**Success Response**:
```json
{
  "leaves": [
    {
      "id": "1",
      "employee_id": "1",
      "employee_name": "John Doe",
      "leave_type": "Annual Leave",
      "from_date": "2024-03-01",
      "to_date": "2024-03-03",
      "days_count": 3,
      "status": "approved",
      "reason": "Family vacation",
      "applied_at": "2024-02-01 10:00:00",
      "approved_by": "Jane Smith",
      "approved_at": "2024-02-02 14:30:00"
    }
  ]
}
```

---

#### 4.5 Update Leave Status

**Endpoint**: `POST /api/leaves/update`  
**Auth Required**: Yes  
**Permission**: `leaves.approve`

**Request Body**:
```json
{
  "id": "1",
  "status": "approved",
  "note": "Approved. Enjoy your vacation!"
}
```

---

### 5. Payroll Management

#### 5.1 Get My Payslips

**Endpoint**: `GET /api/payroll/me/payslips`  
**Auth Required**: Yes  
**Permission**: any

**Query Parameters**:
- `year` (optional): Filter by year
- `month` (optional): Filter by month

**Success Response**:
```json
{
  "payslips": [
    {
      "id": "1",
      "cycle_id": "5",
      "month": 1,
      "year": 2024,
      "gross_salary": 50000,
      "total_deductions": 5000,
      "net_salary": 45000,
      "status": "paid",
      "paid_on": "2024-02-01",
      "payment_method": "bank_transfer"
    }
  ]
}
```

---

#### 5.2 View Payslip Detail

**Endpoint**: `GET /api/payroll/payslip/view`  
**Auth Required**: Yes  
**Permission**: any

**Query Parameters**:
- `id`: Payslip ID

**Success Response**:
```json
{
  "payslip": {
    "id": "1",
    "employee_name": "John Doe",
    "employee_code": "EMP001",
    "month": "January",
    "year": 2024,
    "base_salary": 40000,
    "earnings": [
      {
        "component": "House Rent Allowance",
        "amount": 16000
      },
      {
        "component": "Medical Allowance",
        "amount": 5000
      },
      {
        "component": "Roster Duty: Night Shift - 3 days",
        "amount": 6000
      }
    ],
    "deductions": [
      {
        "component": "Provident Fund",
        "amount": 4000
      },
      {
        "component": "Income Tax",
        "amount": 1000
      }
    ],
    "gross_salary": 67000,
    "total_deductions": 5000,
    "net_salary": 62000
  }
}
```

---

#### 5.3 Get My Loans

**Endpoint**: `GET /api/payroll/me/loans`  
**Auth Required**: Yes  
**Permission**: any

**Success Response**:
```json
{
  "loans": [
    {
      "id": "1",
      "amount": 100000,
      "monthly_deduction": 10000,
      "remaining_balance": 60000,
      "status": "active",
      "created_at": "2024-01-01"
    }
  ]
}
```

---

#### 5.4 Apply for Loan

**Endpoint**: `POST /api/payroll/me/loans/apply`  
**Auth Required**: Yes  
**Permission**: any

**Request Body**:
```json
{
  "amount": 50000,
  "monthly_deduction": 5000,
  "reason": "Medical emergency"
}
```

---

### 6. Location Tracking & Geo-Fencing

#### 6.1 Update Location

**Endpoint**: `POST /api/geo/location/update`  
**Auth Required**: Yes  
**Permission**: `geo.track`

**Request Body**:
```json
{
  "latitude": 23.8103,
  "longitude": 90.4125,
  "accuracy_m": 15,
  "speed_mps": 0,
  "device_status": "foreground"
}
```

**Success Response**:
```json
{
  "message": "Location updated",
  "status": "inside",
  "fence_name": "Main Office"
}
```

---

#### 6.2 Get Latest Locations

**Endpoint**: `GET /api/geo/location/latest`  
**Auth Required**: Yes  
**Permission**: `geo.read`

Returns latest location of all employees.

**Success Response**:
```json
{
  "rows": [
    {
      "employee_id": "1",
      "employee_name": "John Doe",
      "latitude": 23.8103,
      "longitude": 90.4125,
      "last_seen_at": "2024-02-09 15:30:00",
      "status": "inside",
      "fence_name": "Main Office",
      "distance_outside_m": null,
      "age_sec": 45
    }
  ]
}
```

---

#### 6.3 Get Movement History

**Endpoint**: `GET /api/geo/location/history`  
**Auth Required**: Yes  
**Permission**: `geo.read`

**Query Parameters**:
- `employee_id`: Employee ID
- `from`: Start datetime (YYYY-MM-DD HH:MM:SS)
- `to`: End datetime (YYYY-MM-DD HH:MM:SS)
- `limit` (optional): Max 10000

**Success Response**:
```json
{
  "rows": [
    {
      "id": "1",
      "latitude": 23.8103,
      "longitude": 90.4125,
      "captured_at": "2024-02-09 09:00:00"
    }
  ]
}
```

---

### 7. Roster Duty Management

#### 7.1 Get Roster Types

**Endpoint**: `GET /api/roster/types`  
**Auth Required**: Yes  
**Permission**: `roster.read`

**Success Response**:
```json
{
  "types": [
    {
      "id": "1",
      "name": "Night Shift",
      "color": "#3f51b5",
      "start_time": "22:00:00",
      "end_time": "06:00:00",
      "allowance_type": "fixed",
      "allowance_amount": 2000,
      "is_active": true
    }
  ]
}
```

---

#### 7.2 Get My Roster Assignments

**Endpoint**: `GET /api/roster/assignments/employee`  
**Auth Required**: Yes  
**Permission**: `roster.read`

**Query Parameters**:
- `employee_id` (optional): Employee ID (defaults to current user)
- `from`: Start date (YYYY-MM-DD)
- `to`: End date (YYYY-MM-DD)

**Success Response**:
```json
{
  "assignments": [
    {
      "id": "1",
      "roster_type_id": "1",
      "roster_name": "Night Shift",
      "roster_color": "#3f51b5",
      "duty_date": "2024-02-10",
      "start_time": "22:00:00",
      "end_time": "06:00:00",
      "allowance_type": "fixed",
      "allowance_amount": 2000
    }
  ]
}
```

---

#### 7.3 Get Roster Calendar

**Endpoint**: `GET /api/roster/assignments/calendar`  
**Auth Required**: Yes  
**Permission**: `roster.read`

**Query Parameters**:
- `month`: Month (1-12)
- `year`: Year (YYYY)

**Success Response**:
```json
{
  "calendar": [
    {
      "id": "1",
      "employee_id": "1",
      "employee_name": "John Doe",
      "roster_name": "Night Shift",
      "duty_date": "2024-02-10",
      "start_time": "22:00:00",
      "end_time": "06:00:00"
    }
  ]
}
```

---

### 8. Shift Management

#### 8.1 Get Shifts

**Endpoint**: `GET /api/shifts`  
**Auth Required**: Yes  
**Permission**: `attendance.read`

**Success Response**:
```json
{
  "shifts": [
    {
      "id": "1",
      "name": "Morning Shift",
      "start_time": "09:00:00",
      "end_time": "18:00:00",
      "break_duration_mins": 60,
      "grace_period_mins": 15,
      "is_default": true
    }
  ]
}
```

---

### 9. Profile & Settings

#### 9.1 Get My Profile

**Endpoint**: `GET /api/me`  
**Auth Required**: Yes  
**Permission**: any

**Success Response**:
```json
{
  "user": {
    "id": "1",
    "employee_id": "1",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+8801712345678",
    "role": "employee",
    "permissions": ["attendance.clock", "leaves.apply"],
    "employee": {
      "code": "EMP001",
      "designation": "Software Engineer",
      "department": "IT",
      "date_of_joining": "2024-01-15"
    }
  }
}
```

---

#### 9.2 Update Profile

**Endpoint**: `POST /api/me/update`  
**Auth Required**: Yes  
**Permission**: any

**Request Body**:
```json
{
  "phone": "+8801712345680",
  "address": "124 Main St, Dhaka"
}
```

---

#### 9.3 Upload Profile Photo

**Endpoint**: `POST /api/me/profile_photo/upload`  
**Auth Required**: Yes  
**Permission**: any  
**Content-Type**: `multipart/form-data`

**Form Data**:
- `photo`: Image file

---

### 10. Messenger/Chat

#### 10.1 Get Conversations

**Endpoint**: `GET /api/messenger/conversations`  
**Auth Required**: Yes  
**Permission**: tenant

**Success Response**:
```json
{
  "conversations": [
    {
      "id": "1",
      "participant_name": "Jane Smith",
      "last_message": "See you tomorrow!",
      "last_message_at": "2024-02-09 14:30:00",
      "unread_count": 2
    }
  ]
}
```

---

#### 10.2 Get Messages

**Endpoint**: `GET /api/messenger/messages`  
**Auth Required**: Yes  
**Permission**: tenant

**Query Parameters**:
- `conversation_id`: Conversation ID
- `limit` (optional): Default 50

**Success Response**:
```json
{
  "messages": [
    {
      "id": "1",
      "conversation_id": "1",
      "sender_id": "2",
      "sender_name": "Jane Smith",
      "content": "Hi, how are you?",
      "sent_at": "2024-02-09 14:25:00",
      "read": false
    }
  ]
}
```

---

#### 10.3 Send Message

**Endpoint**: `POST /api/messenger/messages/send`  
**Auth Required**: Yes  
**Permission**: tenant

**Request Body**:
```json
{
  "conversation_id": "1",
  "content": "I'm good, thanks!"
}
```

---

#### 10.4 Get Unread Count

**Endpoint**: `GET /api/messenger/unread_count`  
**Auth Required**: Yes  
**Permission**: tenant

**Success Response**:
```json
{
  "unread_count": 5
}
```

---

### 11. Holidays

#### 11.1 Get Holidays

**Endpoint**: `GET /api/holidays`  
**Auth Required**: Yes  
**Permission**: `attendance.read`

**Query Parameters**:
- `year` (optional): Year (YYYY)

**Success Response**:
```json
{
  "holidays": [
    {
      "id": "1",
      "name": "Victory Day",
      "date": "2024-12-16",
      "is_recurring": true
    }
  ]
}
```

---

### 12. Health & Status

#### 12.1 Health Check

**Endpoint**: `GET /api/health`  
**Auth Required**: No

**Success Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-02-09T15:30:00+06:00",
  "database": "connected"
}
```

---

#### 12.2 Tenant Info

**Endpoint**: `GET /api/tenant`  
**Auth Required**: No

**Success Response**:
```json
{
  "tenant": {
    "id": "1",
    "subdomain": "demo",
    "name": "Demo Company",
    "logo_url": "/api/tenant/logo"
  }
}
```

---

## Common Patterns

### Pagination

Most list endpoints support pagination:

**Query Parameters**:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50, max: 100)

**Response**:
```json
{
  "data": [],
  "pagination": {
    "current_page": 1,
    "total_pages": 5,
    "total_items": 245,
    "per_page": 50
  }
}
```

---

### Date/Time Format

All dates and times use ISO 8601 format:

- **Date**: `YYYY-MM-DD` (e.g., `2024-02-09`)
- **DateTime**: `YYYY-MM-DD HH:MM:SS` (e.g., `2024-02-09 15:30:00`)
- **Timezone**: Asia/Dhaka (UTC+6)

---

### File Uploads

Use `multipart/form-data` for file uploads:

```kotlin
// Android example
val request = MultipartBody.Builder()
    .setType(MultipartBody.FORM)
    .addFormDataPart("photo", "photo.jpg",
        RequestBody.create("image/jpeg".toMediaType(), photoFile))
    .build()
```

---

### Base64 Images

For clock in/out photos, use base64 encoding:

```kotlin
val base64 = "data:image/jpeg;base64," + 
    Base64.encodeToString(photoBytes, Base64.NO_WRAP)
```

---

## Error Handling

### HTTP Status Codes

- `200 OK`: Success
- `201 Created`: Resource created
- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Authentication required or failed
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `422 Unprocessable Entity`: Validation error
- `500 Internal Server Error`: Server error

---

### Error Response Format

```json
{
  "error": "Error message",
  "message": "Detailed error description",
  "code": "ERROR_CODE",
  "field": "field_name" // For validation errors
}
```

---

### Common Errors

**401 Unauthorized**:
```json
{
  "error": "Token expired or invalid"
}
```

**403 Forbidden**:
```json
{
  "error": "Insufficient permissions",
  "required_permission": "employees.write"
}
```

**422 Validation Error**:
```json
{
  "error": "Validation failed",
  "field": "email",
  "message": "Invalid email format"
}
```

---

## Best Practices

### 1. Token Management

- Store JWT token securely (Android Keystore/EncryptedSharedPreferences)
- Refresh token before expiry
- Clear token on logout
- Handle token expiration gracefully

**Example**:
```kotlin
class TokenManager(context: Context) {
    private val sharedPrefs = EncryptedSharedPreferences.create(
        context,
        "auth_prefs",
        MasterKey.Builder(context).setKeyScheme(AES256_GCM).build(),
        AES256_SIV,
        AES256_GCM
    )
    
    fun saveToken(token: String) {
        sharedPrefs.edit().putString("jwt_token", token).apply()
    }
    
    fun getToken(): String? {
        return sharedPrefs.getString("jwt_token", null)
    }
}
```

---

### 2. Request Interceptors

Add authentication header to all requests:

```kotlin
class AuthInterceptor(private val tokenManager: TokenManager) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val token = tokenManager.getToken()
        
        val request = if (token != null) {
            originalRequest.newBuilder()
                .header("Authorization", "Bearer $token")
                .header("Content-Type", "application/json")
                .build()
        } else {
            originalRequest
        }
        
        return chain.proceed(request)
    }
}
```

---

### 3. Offline Support

Implement local database caching:

```kotlin
// Use Room Database for offline caching
@Entity(tableName = "attendance")
data class AttendanceEntity(
    @PrimaryKey val id: String,
    val date: String,
    val clockIn: String?,
    val clockOut: String?,
    val status: String,
    val syncStatus: String = "pending" // pending, synced, failed
)

// Sync when online
class SyncManager {
    suspend fun syncPendingAttendance() {
        val pending = database.attendanceDao().getPending()
        pending.forEach { attendance ->
            try {
                api.syncAttendance(attendance)
                database.attendanceDao().updateSyncStatus(attendance.id, "synced")
            } catch (e: Exception) {
                database.attendanceDao().updateSyncStatus(attendance.id, "failed")
            }
        }
    }
}
```

---

### 4. Location Tracking

Implement background location updates:

```kotlin
class LocationService : Service() {
    private val locationInterval = 30_000L // 30 seconds
    
    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let { location ->
                sendLocationToServer(location)
            }
        }
    }
    
    private fun sendLocationToServer(location: Location) {
        api.updateLocation(
            latitude = location.latitude,
            longitude = location.longitude,
            accuracy = location.accuracy,
            speed = location.speed
        )
    }
}
```

---

### 5. Image Compression

Compress images before upload:

```kotlin
fun compressImage(bitmap: Bitmap): ByteArray {
    val outputStream = ByteArrayOutputStream()
    var quality = 90
    
    do {
        outputStream.reset()
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, outputStream)
        quality -= 10
    } while (outputStream.size() > 500_000 && quality > 10) // Max 500KB
    
    return outputStream.toByteArray()
}
```

---

### 6. Error Handling

Implement centralized error handling:

```kotlin
sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Error(val message: String, val code: Int?) : Result<Nothing>()
}

suspend fun <T> safeApiCall(apiCall: suspend () -> T): Result<T> {
    return try {
        Result.Success(apiCall())
    } catch (e: HttpException) {
        Result.Error(e.message(), e.code())
    } catch (e: IOException) {
        Result.Error("Network error. Check your connection.", null)
    } catch (e: Exception) {
        Result.Error("An unexpected error occurred.", null)
    }
}
```

---

### 7. Retrofit Setup

Complete Retrofit configuration:

```kotlin
object ApiClient {
    private const val BASE_URL = "https://demo.attsystem.com/"
    
    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(AuthInterceptor(tokenManager))
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        })
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    
    val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl(BASE_URL)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()
    
    val api: AttSystemApi = retrofit.create(AttSystemApi::class.java)
}

interface AttSystemApi {
    @POST("api/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse
    
    @GET("api/attendance/open")
    suspend fun getOpenShift(): OpenShiftResponse
    
    @POST("api/attendance/clockin")
    suspend fun clockIn(@Body request: ClockInRequest): ClockInResponse
    
    // ... other endpoints
}
```

---

### 8. Permissions

The API uses a role-based permission system. Common permissions include:

| Permission | Description |
|------------|-------------|
| `any` | Any authenticated user |
| `attendance.clock` | Clock in/out |
| `attendance.read` | View attendance |
| `leaves.apply` | Apply for leave |
| `leaves.read` | View leaves |
| `leaves.approve` | Approve/reject leaves |
| `employees.read` | View employees |
| `employees.write` | Create/edit employees |
| `payroll.read` | View payroll |
| `geo.track` | Update location |
| `roster.read` | View roster duties |

---

### 9. Testing

Use mock servers for testing:

```kotlin
// Create a mock API for testing
class MockApi : AttSystemApi {
    override suspend fun login(request: LoginRequest): LoginResponse {
        return LoginResponse(
            user = User(id = "1", name = "Test User"),
            token = "mock_token_12345"
        )
    }
    // ... implement other methods
}
```

---

### 10. Security Checklist

✅ **Always use HTTPS** in production  
✅ **Store tokens securely** (EncryptedSharedPreferences)  
✅ **Validate SSL certificates**  
✅ **Implement certificate pinning** (optional, for high security)  
✅ **Don't log sensitive data** (passwords, tokens)  
✅ **Implement timeout for tokens**  
✅ **Clear session on logout**  
✅ **Request minimal permissions** from user  

---

## Production Deployment

### Base URLs

```kotlin
object Config {
    const val PRODUCTION_URL = "https://your-company.attsystem.com/"
    const val STAGING_URL = "https://staging.attsystem.com/"
    const val DEV_URL = "http://localhost/"
    
    val baseUrl = when (BuildConfig.BUILD_TYPE) {
        "release" -> PRODUCTION_URL
        "staging" -> STAGING_URL
        else -> DEV_URL
    }
}
```

---

### ProGuard Rules

Add to `proguard-rules.pro`:

```proguard
# Retrofit
-dontwarn retrofit2.**
-keep class retrofit2.** { *; }
-keepattributes Signature
-keepattributes Exceptions

# Gson
-keep class com.google.gson.** { *; }
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# Your data models
-keep class com.yourapp.models.** { *; }
```

---

## Support & Resources

- **Swagger API Docs**: `https://your-domain.attsystem.com/api/docs` (if available)
- **Contact**: [Your support email]
- **GitHub**: [Your repository] (if applicable)

---

## Changelog

### Version 1.0 (February 2026)
- Initial API documentation
- All 100+ endpoints documented
- Added roster duty management
- Added location tracking & geo-fencing
- Enhanced payroll with salary periods
- Added loan management

---

**End of Documentation**

For any issues or questions, please contact the backend development team or refer to the Swagger documentation at `/api/docs`.
