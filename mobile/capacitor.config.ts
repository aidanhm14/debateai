import type { CapacitorConfig } from '@capacitor/cli';

// Phase 1 strategy: load the live debateai.com inside the iOS shell.
// This keeps us moving without a bundling pipeline. Pre-submission we
// switch to a bundled local build (set webDir + remove server.url) so
// the app works offline — required for App Store reviewer testing.
const config: CapacitorConfig = {
  appId: 'com.debateai.debateit',
  appName: 'DebateIt',
  webDir: 'www', // placeholder — replaced when we bundle a local build

  server: {
    url: 'https://debateai.com/coach',
    // Only allow our own host. Tighten further before submission.
    allowNavigation: [
      'debateai.com',
      '*.debateai.com',
      '*.firebaseapp.com',
      '*.googleapis.com',
      '*.gstatic.com',
      '*.firebaseio.com',
      'apis.google.com',
      'accounts.google.com',
      'js.stripe.com',
      'checkout.stripe.com',
    ],
    // We still let the WebView negotiate https; never override.
    androidScheme: 'https',
    iosScheme: 'https',
  },

  ios: {
    contentInset: 'always',
    // Keeps the WKWebView background matching the brand on first paint
    // so the splash transition feels seamless.
    backgroundColor: '#0A0A0A',
    // Force inline media playback so debate audio can autoplay after gesture.
    allowsLinkPreview: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#0A0A0A',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      iosSpinnerStyle: 'small',
    },
    StatusBar: {
      style: 'DARK', // bright icons over dark UI
      backgroundColor: '#0A0A0A',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'native',
      style: 'DARK',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
