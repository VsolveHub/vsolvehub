import type { ConfigContext, ExpoConfig } from "expo/config";

const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;

// The job screen's map (owner decision, 5 November 2026). Android draws Google maps with a key
// restricted to this app's package and signing certificate (EAS secret
// GOOGLE_MAPS_ANDROID_API_KEY, never committed); iOS uses Apple Maps and needs none. Without the
// key the screen keeps the address card and the Navigate button and draws no map.
const googleMapsAndroidKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim() ?? "";
const googleServiceInfoPlist = process.env.GOOGLE_SERVICE_INFO_PLIST;

// Firebase phone sign-in. Its plugins read the Firebase config files, so they switch on only
// when a build provides one (EAS file secrets GOOGLE_SERVICES_JSON / GOOGLE_SERVICE_INFO_PLIST).
// Expo Go and builds without the files are unaffected. iOS needs static frameworks for it.
// Android needs Kotlin 2.3+: React Native Firebase 27 pulls in firebase-auth 25, compiled with
// Kotlin 2.4, which React Native 0.88's default Kotlin 2.2 cannot read. Kotlin 2.3 reads it, and
// Expo SDK 58 pairs Kotlin >= 2.3 with its version-independent KSP.
// Crashlytics rides with them: it reports through the same Firebase app, so it is on only when
// Firebase is.
const firebasePlugins: NonNullable<ExpoConfig["plugins"]> =
  googleServicesFile || googleServiceInfoPlist
    ? [
        "@react-native-firebase/app",
        "@react-native-firebase/auth",
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

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "V Solve Hub Partner",
  slug: "vsolve-partner",
  owner: "vsolvehub",
  scheme: "vsolvepartner",
  // 1.1.0: the job screen map adds a native module (react-native-maps). With the
  // `appVersion` runtime policy this keeps its JS off 1.0.0 binaries, which would crash on it.
  version: "1.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  icon: "./assets/icon.png",
  runtimeVersion: { policy: "appVersion" },
  updates: { url: "https://u.expo.dev/9223c951-f79e-44c2-869d-1dc244c89071" },
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
    blockedPermissions: ["ACCESS_BACKGROUND_LOCATION", "RECORD_AUDIO"],
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
        smallIcons: ["./assets/android-icon-monochrome.png"],
        smallIconAccentColor: "#f87000",
        sounds: ["./assets/sounds/booking_alert.wav"],
        disableLocation: true,
      },
    ],
    "expo-router",
    "expo-font",
    "expo-secure-store",
    "expo-asset",
    "expo-audio",
    "expo-image",
    "expo-web-browser",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff",
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Vsolve Hub uses your location to find work near you and to confirm arrival.",
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
    mapsEnabled: googleMapsAndroidKey !== "",
    eas: {
      projectId: "9223c951-f79e-44c2-869d-1dc244c89071",
    },
  },
});
