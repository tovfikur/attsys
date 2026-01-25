# AttSystem Android - Quick Build Guide

## 🚀 Build & Deploy Commands

### 1. Build for Development Testing

```powershell
# From frontend directory
cd P:\AttSystem\frontend

# Option A: Quick build and sync
npm run cap:android

# Option B: Build step by step
npm run build:android
npx cap sync android

# Open in Android Studio
npm run android:open
```

### 2. Test on Connected Device

```powershell
# From Android directory
cd P:\AttSystem\frontend\android

# Install debug build on connected device
.\gradlew installDebug

# View logs
adb logcat | Select-String "MainActivity"
```

### 3. Build Release APK

**In Android Studio:**
1. Build > Generate Signed Bundle / APK
2. Choose APK
3. Select keystore (or create new one)
4. Choose "release" variant
5. Click Finish

**Or via command line:**
```powershell
cd P:\AttSystem\frontend\android

# Build release APK (requires keystore configuration)
.\gradlew assembleRelease

# Output will be at:
# app\build\outputs\apk\release\app-release.apk
```

### 4. Build Release AAB (for Google Play)

```powershell
cd P:\AttSystem\frontend\android

# Build Android App Bundle
.\gradlew bundleRelease

# Output will be at:
# app\build\outputs\bundle\release\app-release.aab
```

## 🔧 Before Building

### Check Prerequisites
```powershell
# Check Node version (should be 16+)
node --version

# Check npm version
npm --version

# Check Java version (should be 11+)
java -version

# Check Android SDK installation
dir $env:ANDROID_HOME
```

### Install Dependencies
```powershell
cd P:\AttSystem\frontend

# Install if not done
npm install

# Update Capacitor dependencies
npm install @capacitor/core@latest @capacitor/android@latest
```

## 🔑 Signing Configuration

### For Release Builds

Create `keystore.properties` in android folder:
```properties
storeFile=path/to/keystore.jks
storePassword=YOUR_KEYSTORE_PASSWORD
keyAlias=att-tenant
keyPassword=YOUR_KEY_PASSWORD
```

Or use environment variables:
```powershell
$env:ATT_KEYSTORE_PATH="P:\path\to\keystore.jks"
$env:ATT_KEYSTORE_PASSWORD="your_password"
$env:ATT_KEY_ALIAS="att-tenant"
$env:ATT_KEY_PASSWORD="your_key_password"
```

### Create New Keystore
```powershell
keytool -genkey -v -keystore att-tenant-release.keystore -alias att-tenant -keyalg RSA -keysize 2048 -validity 10000
```

## 📱 Testing Checklist

After building, test these features:
- [ ] Login/Logout
- [ ] Camera for profile photo
- [ ] Location for check-in/out
- [ ] File download (employee attachments)
- [ ] File download (reports as PDF/Excel)
- [ ] Notifications
- [ ] Messenger
- [ ] All CRUD operations
- [ ] Offline behavior
- [ ] Permission requests on first launch

## 🐛 Common Issues

### Build fails with "SDK not found"
```powershell
# Set ANDROID_HOME environment variable
$env:ANDROID_HOME="C:\Users\YourUser\AppData\Local\Android\Sdk"
```

### Gradle sync fails
```powershell
cd P:\AttSystem\frontend\android

# Clean and rebuild
.\gradlew clean
.\gradlew build --refresh-dependencies
```

### App crashes on launch
1. Check logcat for errors
2. Verify all permissions in AndroidManifest.xml
3. Ensure ProGuard rules are correct (for release builds)
4. Test debug build first

### File downloads not working
1. Check storage permissions granted
2. Check FileProvider configuration in file_paths.xml
3. Check Android version (13+ requires new permissions)
4. Test with debug build to see detailed logs

## 📊 Build Variants

### Debug
- Debuggable: Yes
- Minified: No
- Signing: Debug keystore (auto-generated)
- Use for: Development and testing

### Staging
- Debuggable: Yes
- Minified: Yes
- Signing: Debug keystore
- Use for: Pre-release testing

### Release
- Debuggable: No
- Minified: Yes
- Signing: Release keystore (configured)
- Use for: Production deployment

## 🔄 Update Process

When you update the web app:

```powershell
# 1. Rebuild web assets
cd P:\AttSystem\frontend
npm run build:android

# 2. Sync with Android
npx cap sync android

# 3. Update version in build.gradle (if needed)
# Edit: android/app/build.gradle
# Change versionCode and versionName

# 4. Rebuild Android app
cd android
.\gradlew clean
.\gradlew assembleDebug  # or assembleRelease
```

## 📦 Distribution

### Direct APK Distribution
1. Build release APK
2. Share `app-release.apk` file
3. Users must enable "Install from Unknown Sources"

### Google Play Store
1. Build release AAB
2. Upload to Google Play Console
3. Complete store listing
4. Submit for review

## 🎯 Current Version

- **Version Name**: 1.0.2
- **Version Code**: 3
- **Min SDK**: 23 (Android 6.0)
- **Target SDK**: 35 (Android 14)
- **Package**: com.attsystem.tenant

## 📞 Quick Commands Reference

```powershell
# Build web + sync Android
npm run cap:android

# Open Android Studio
npm run android:open

# Install on device
cd android && .\gradlew installDebug

# View logs
adb logcat | Select-String "AttSystem"

# Uninstall from device
adb uninstall com.attsystem.tenant

# Check connected devices
adb devices

# Build release
cd android && .\gradlew assembleRelease

# Clean build
cd android && .\gradlew clean build
```

---

**Last Updated**: 2026-01-24
**Android App Version**: 1.0.2
