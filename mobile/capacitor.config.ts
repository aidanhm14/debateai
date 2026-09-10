import type { CapacitorConfig } from '@capacitor/cli';

// The app shell loads the live product so fixes and debate content stay in
// sync with itsdebatable.com. /native is an app-specific home and navigation
// surface, not the public landing page.
const config: CapacitorConfig = {
  appId: 'com.debateai.debateit',
  appName: 'Debatable',
  webDir: 'www',

  server: {
    url: 'https://itsdebatable.com/native',
    allowNavigation: [
      'itsdebatable.com',
      '*.itsdebatable.com',
      '*.firebaseapp.com',
      '*.googleapis.com',
      '*.gstatic.com',
      '*.firebaseio.com',
      'apis.google.com',
      'accounts.google.com',
    ],
    // Shown when the remote load fails (no signal, DNS, origin down).
    // Without this the WebView renders a blank page offline. The target
    // is bundled in www/ and must stay self-contained.
    errorPath: 'index.html',

    // We still let the WebView negotiate https; never override.
    androidScheme: 'https',
    iosScheme: 'https',
  },

  android: {
    appendUserAgent: ' DebatableApp/1.0',
    backgroundColor: '#FAF9F6',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },

  ios: {
    contentInset: 'never',
    backgroundColor: '#F7F6F2',
    allowsLinkPreview: false,
    appendUserAgent: ' DebatableApp/1.0',
  },

  plugins: {
    SplashScreen: {
      // Ceiling, not the normal path: native-bridge.js hides the splash as
      // soon as the remote page paints (2 to 15s on a cold install). The
      // 20s cap only matters if that script never runs.
      launchShowDuration: 20000,
      launchAutoHide: true,
      launchFadeOutDuration: 150,
      backgroundColor: '#F7F6F2',
      androidSplashResourceName: 'debatable_splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      iosSpinnerStyle: 'small',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#F7F6F2',
      overlaysWebView: true,
    },
    Keyboard: {
      resize: 'native',
      style: 'DARK',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['apple.com', 'google.com'],
    },
  },
};

export default config;
