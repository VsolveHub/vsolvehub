import type { ConfigContext, ExpoConfig } from "expo/config";

const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;

// The job screen's map (owner decision, 5 November 2026). Android draws Google maps with a key
// restricted to this app's package and signing certificate (EAS secret
// GOOGLE_MAPS_ANDROID_API_KEY, never committed); iOS uses Apple Maps and needs none. Without the
// key the screen keeps the address card and the Navigate button and draws no map.
const googleMapsAndroidKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim() ?? "";
const googleServiceInfoPlist = process.env.GOOGLE_SERVICE_INFO_PLIST;

// Firebase, for Crashlytics crash reports only: sign-in is Django's own code (MSG91) since
// 23 November 2026. The plugins read the Firebase config files, so they switch on only when a
// build provides one (EAS file secrets GOOGLE_SERVICES_JSON / GOOGLE_SERVICE_INFO_PLIST). Expo Go
// and builds without the files are unaffected. iOS needs static frameworks for React Native
// Firebase. The Kotlin 2.3 pin arrived with firebase-auth (built with Kotlin 2.4, which React
// Native 0.88's default Kotlin 2.2 cannot read); it stays because every release so far was built
// with it, and Expo SDK 58 pairs Kotlin >= 2.3 with its version-independent KSP.
const firebasePlugins: NonNullable<ExpoConfig["plugins"]> =
  googleServicesFile || googleServiceInfoPlist
    ? [
        "@react-native-firebase/app",
        "@react-native-firebase/crashlytics",
        [
          "expo-build-properties",
          { ios: { useFrameworks: "static" }, android: { kotlinVersion: "2.3.21" } },
        ],
      ]
    : [];

// A store or test build must name the servers it talks to. On EAS (every profile except the
// local-network development client) a missing or non-https address stops the build here,
// instead of shipping an app that quietly talks to some other server.
if (process.env.EAS_BUILD === "true" && process.env.EAS_BUILD_PROFILE !== "development") {
  for (const name of ["EXPO_PUBLIC_API_BASE_URL", "EXPO_PUBLIC_WEB_BASE_URL"] as const) {
    const value = process.env[name]?.trim() ?? "";
    if (!value.startsWith("https://")) {
      throw new Error(
        `${name} must be an https:// address for the "${process.env.EAS_BUILD_PROFILE}" build (got "${value}"). Set it in eas.json.`,
      );
    }
  }
}
// APP_ENV=development disables Expo Updates so Metro is always the JS source
// during local development. Preview and production builds retain the CDN URL.
// This variable is injected by eas.json's "development" profile env block and
// must be set locally before running `expo start`:
//   $env:APP_ENV = "development"; npx expo start --dev-client --clear
const isDev = process.env.APP_ENV === "development";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "V Solve Hub Partner",
  slug: "vsolve-partner",
  // The partner app's EAS project (and its Play upload keystore) lives on the webaura7000
  // account; the customer app stays on vsolvehub. EAS refuses to build when this disagrees.
  owner: "webaura7000",
  scheme: "vsolvepartner",
  // 1.1.0: the job screen map adds a native module (react-native-maps). With the
  // `appVersion` runtime policy this keeps its JS off 1.0.0 binaries, which would crash on it.
  // 1.2.0: sign-in moves from Firebase to MSG91 (`otp`). A new version, not an OTA update, so
  // the server's MOBILE_PARTNER_MIN_VERSION can retire the Firebase 1.1.0 builds.
  version: "1.2.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  icon: "./assets/icon.png",
  runtimeVersion: { policy: "appVersion" },
  updates: isDev
    ? { enabled: false }
    : { url: "https://u.expo.dev/9223c951-f79e-44c2-869d-1dc244c89071" },
  ios: {
    bundleIdentifier: "com.vsolvehub.partner",
    supportsTablet: false,
    associatedDomains: ["applinks:partner.vsolvehub.com"],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
    ...(googleServiceInfoPlist ? { googleServicesFile: googleServiceInfoPlist } : {}),
  },
  android: {
    package: "com.vsolvehub.partner",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "partner.vsolvehub.com", pathPrefix: "/dispatch" },
          { scheme: "https", host: "partner.vsolvehub.com", pathPrefix: "/work" },
          { scheme: "https", host: "partner.vsolvehub.com", pathPrefix: "/me" },
          { scheme: "https", host: "partner.vsolvehub.com", pathPrefix: "/money" },
          { scheme: "https", host: "partner.vsolvehub.com", pathPrefix: "/home" },
          { scheme: "https", host: "partner.vsolvehub.com", pathPrefix: "/apply" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
    permissions: [
      "CAMERA",
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "POST_NOTIFICATIONS",
      "VIBRATE",
    ],
    // Location is used only while the app is open, so no location foreground service either:
    // Google Play asks for a declaration and a demo video for every foreground-service type.
    blockedPermissions: [
      "ACCESS_BACKGROUND_LOCATION",
      "RECORD_AUDIO",
      "FOREGROUND_SERVICE_LOCATION",
      "FOREGROUND_SERVICE_MEDIA_PLAYBACK",
    ],
    ...(googleServicesFile ? { googleServicesFile } : {}),
    ...(googleMapsAndroidKey ? { config: { googleMaps: { apiKey: googleMapsAndroidKey } } } : {}),
  },
  plugins: [
    // Push notifications (OneSignal). It must be the first plugin. `mode` is the iOS APNs
    // environment: production for store builds, development otherwise.
    [
      "onesignal-expo-plugin",
      {
        mode: process.env.EAS_BUILD_PROFILE === "production" ? "production" : "development",
        // Status-bar icon: Android draws it as a one-colour shape, so it is the logo's white
        // silhouette. The full-colour logo is the large icon beside every notification's text
        // (saved as ic_onesignal_large_icon_default, which OneSignal uses unless a push names another).
        smallIcons: ["./assets/android-icon-monochrome.png"],
        largeIcons: ["./assets/logo-mark.png"],
        // The logo's orange, measured from the owner's artwork. Android 12-16 paints the small icon
        // in this one colour; Android 17+ shows the full-colour launcher icon instead.
        smallIconAccentColor: "#fe6c01",
        sounds: ["./assets/sounds/booking_alert.wav"],
        disableLocation: true,
      },
    ],
    "expo-router",
    "expo-font",
    "expo-secure-store",
    "expo-asset",
    // The offer ringtone plays only while the app is open (shouldPlayInBackground: false); a
    // closed app rings through the OneSignal notification sound. So no background-playback service.
    ["expo-audio", { enableBackgroundPlayback: false }],
    "expo-image",
    "expo-web-browser",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash.png",
        // Android 12+ crops the splash image to a 192dp circle; splash.png keeps the logo inside
        // its own inscribed circle, so 190dp shows it whole (the 100dp default left it tiny).
        imageWidth: 190,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Vsolve Hub uses your location to find work near you and to confirm arrival.",
        // Rides captains on duty: a location foreground service ("You're on duty") keeps pings
        // going with the screen off. Adds FOREGROUND_SERVICE and FOREGROUND_SERVICE_LOCATION
        // only; ACCESS_BACKGROUND_LOCATION stays blocked above (Rides brief §5.13).
        isAndroidForegroundServiceEnabled: true,
        androidForegroundServiceIcon: "./assets/android-icon-monochrome.png",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Choose photos of documents and work.",
        cameraPermission: "Take photos of documents and work.",
        microphonePermission: false,
      },
    ],
    ...firebasePlugins,
  ],
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
    webBaseUrl: process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "",
    // The key is an EAS secret: builds can read it, `eas update` on a PC cannot. An update keeps the
    // key already inside the installed app, so it says so with this public flag instead.
    mapsEnabled: googleMapsAndroidKey !== "" || process.env.EXPO_PUBLIC_MAPS_ENABLED === "true",
    eas: {
      projectId: "9223c951-f79e-44c2-869d-1dc244c89071",
    },
  },
});
