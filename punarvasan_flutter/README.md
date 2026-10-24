# Punarvasan Tracker Flutter client

The Flutter app is the replacement mobile UI and web portal. It uses the
existing Node.js API; the backend and database remain unchanged.
The previous Expo and `admin-web` source files are retained but are no longer
the active user interfaces.

## Run on a USB-connected Android phone

1. Install Flutter and Android SDK Platform-Tools. On the phone, enable
   **Developer options** and **USB debugging**, connect a data-capable cable,
   unlock the phone, and approve its debugging prompt.
2. From the repository root, check that Flutter can see the phone:

   ```powershell
   flutter devices
   ```

3. In one terminal, start the API server:

   ```powershell
   npm run server
   ```

4. In another terminal, forward the backend port and run the Flutter app:

   ```powershell
   adb reverse tcp:3001 tcp:3001
   cd punarvasan_flutter
   flutter run -d <device-id> --dart-define=API_BASE_URL=http://127.0.0.1:3001
   ```

   Replace `<device-id>` with the Android device ID shown by `flutter devices`.

To build and install a debug APK instead:

```powershell
cd punarvasan_flutter
flutter build apk --debug --dart-define=API_BASE_URL=http://127.0.0.1:3001
adb install -r build\app\outputs\flutter-apk\app-debug.apk
```

Keep `adb reverse tcp:3001 tcp:3001` active while using the installed app.
The Android debug build permits cleartext HTTP for this local API connection;
use HTTPS for any production API.

## Run the web portal

For Flutter web development, start the backend, then run:

```powershell
cd punarvasan_flutter
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:3001
```

To serve the production Flutter web build from the existing backend at
`http://localhost:3001`, build it first:

```powershell
cd punarvasan_flutter
flutter build web --dart-define=API_BASE_URL=http://localhost:3001
cd ..
npm run server
```

For an Android emulator, use
`--dart-define=API_BASE_URL=http://10.0.2.2:3001` instead.
