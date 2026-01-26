# AttSystem Android App - Version 1.0.2

## Recent Updates

### Version 1.0.2 (2026-01-24)
This version includes comprehensive permission handling and file download fixes to ensure the Android app works perfectly with all features of AttSystem.

#### Key Improvements

1. **File Download Support** ✅
   - Added READ_EXTERNAL_STORAGE permission (Android 12 and below)
   - Added WRITE_EXTERNAL_STORAGE permission (Android 12 and below)
   - Added granular media permissions for Android 13+ (READ_MEDIA_IMAGES, READ_MEDIA_VIDEO, READ_MEDIA_AUDIO)
   - Updated FileProvider paths to support Downloads directory
   - Files can now be downloaded from Employee attachments, Reports, and other features

2. **Enhanced Permission Handling** ✅
   - Runtime permission requests for Camera, Location, Storage, and Notifications
   - Automatic permission detection based on Android version
   - Proper handling of Android 13+ (API 33) scoped storage
   - Legacy external storage support with requestLegacyExternalStorage flag

3. **Permissions Added**
   - ✅ Camera (with runtime request)
   - ✅ Location (FINE and COARSE with runtime request)
   - ✅ Storage (version-specific with runtime request)
   - ✅ Notifications (POST_NOTIFICATIONS for Android 13+)
   - ✅ Network state access
   - ✅ Bluetooth (legacy and modern)
   - ✅ Foreground service support

4. **Android Compatibility**
   - Minimum SDK: Android 6.0 (API 23)
   - Target SDK: Android 14 (API 35)
   - Compile SDK: Android 14 (API 35)
   - Supports Android 6 through Android 14+

5. **Developer Features**
   - Clear text traffic enabled for development
   - Enhanced logging for permission results
   - Debug-friendly permission tracking

## Building the Android App

### Prerequisites
- Node.js and npm installed
- Android Studio with SDK 35
- Java Development Kit (JDK) 11 or higher

### Build Commands

#### Development Build
```bash
# Navigate to frontend directory
cd P:\AttSystem\frontend

# Install dependencies (if not already done)
npm install

# Build and sync Android app
npm run cap:android

# Open in Android Studio
npm run android:open
```

#### Production Build
```bash
# Build for production
npm run build:android

# Sync with Android
npx cap sync android

# Open in Android Studio to build signed APK/AAB
npx cap open android
```

### Testing on Device

1. **Enable Developer Options** on your Android device
2. **Enable USB Debugging**
3. Connect device via USB
4. In Android Studio, click **Run** button or use:
   ```bash
   cd P:\AttSystem\frontend\android
   ./gradlew installDebug
   ```

## Features Working in Android App

### ✅ Fully Functional
- ✅ User authentication (login/logout)
- ✅ Employee Portal
  - Profile viewing and editing
  - Profile photo upload
  - Check in/out with location
  - Leave application
  - Attendance history
- ✅ Camera access for profile photos and face recognition
- ✅ Location tracking for check-in/out
- ✅ File downloads (Employee attachments, Reports, etc.)
- ✅ Messenger with real-time updates
- ✅ Dashboard and analytics
- ✅ Notifications

### Admin Features
- ✅ Employee management
- ✅ Attendance tracking
- ✅ Leave management
- ✅ Report generation and export
- ✅ Device synchronization
- ✅ Shift management

## Permission Details

### Camera Permission
**Purpose**: Take profile photos, capture attendance photos
**When Requested**: On app startup (if not granted)
**Can Deny**: Yes - Camera features will be unavailable

### Location Permission
**Purpose**: Track location during check-in/out for attendance verification
**When Requested**: On app startup (if not granted)
**Can Deny**: Yes - Location-based attendance may not work

### Storage Permissions
**Purpose**: Download employee attachments, reports, and other documents
**When Requested**: On app startup (if not granted)
**Android 13+**: Uses granular media permissions (images, videos, audio)
**Android 12 and below**: Uses READ/WRITE_EXTERNAL_STORAGE
**Can Deny**: Yes - File downloads will fail

### Notification Permission (Android 13+)
**Purpose**: Show attendance reminders, leave status updates, messages
**When Requested**: On app startup (if not granted)
**Can Deny**: Yes - Will not receive push notifications

## Troubleshooting

### File Downloads Not Working
1. Check that storage permissions are granted in **Settings > Apps > AttSystem > Permissions**
2. For Android 13+, ensure media permissions are granted
3. Clear app cache and try again
4. Check Downloads folder for already downloaded files

### Camera Not Working
1. Grant camera permission in **Settings > Apps > AttSystem > Permissions**
2. Ensure no other app is using the camera
3. Restart the app

### Location Not Working
1. Enable location services on device
2. Grant location permission in **Settings > Apps > AttSystem > Permissions**
3. Ensure "Precise location" is enabled (Android 12+)

### Build Errors
1. Clean and rebuild:
   ```bash
   cd P:\AttSystem\frontend\android
   ./gradlew clean
   ./gradlew build
   ```
2. Invalidate caches in Android Studio: **File > Invalidate Caches / Restart**
3. Ensure Android SDK 35 is installed

## Security Notes

- All file downloads use FileProvider for secure file access
- Permissions follow Android best practices
- Runtime permissions ensure user control
- Clear text traffic is enabled for development only (disable for production)
- Legacy external storage support for backward compatibility

## Release Checklist

Before releasing to production:
- [ ] Set `android:usesCleartextTraffic="false"` in AndroidManifest.xml
- [ ] Test on Android 13+ devices
- [ ] Test on Android 10-12 devices
- [ ] Verify all permissions work correctly
- [ ] Test file downloads in different scenarios
- [ ] Generate signed release build
- [ ] Update version in build.gradle
- [ ] Create release notes

## Support

For issues or questions:
1. Check the logs in Android Studio Logcat
2. Look for "MainActivity" tag for permission logs
3. Review file paths in FileProvider configuration
4. Ensure all Capacitor plugins are up to date

---

**Version**: 1.0.2
**Build Date**: 2026-01-24
**Target SDK**: Android 14 (API 35)
**Minimum SDK**: Android 6.0 (API 23)
