import type { CapacitorConfig } from '@capacitor/cli';

// The app shell loads the live product so fixes and debate content stay in
// sync with debateai.com. /native is an app-specific home and navigation
// surface, not the public landing page.
const config: CapacitorConfig = {
  appId: 'com.debateai.debateit',
  appName: 'DebateIt',
  webDir: 'www',

  server: {
    url: 'https://debateai.com/native',
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
    contentInset: 'never',
    backgroundColor: '#F7F6F2',
    allowsLinkPreview: false,
    appendUserAgent: ' DebateItApp/1.0',
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 750,
      backgroundColor: '#F7F6F2',
      androidSplashResourceName: 'splash',
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
