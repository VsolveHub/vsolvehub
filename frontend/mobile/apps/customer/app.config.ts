import type { ConfigContext, ExpoConfig } from "expo/config";

const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
const googleServiceInfoPlist = process.env.GOOGLE_SERVICE_INFO_PLIST;

// The Rides screens draw Google maps on Android, and Android stops the app when a map opens with
// no key in the manifest. Same EAS secret name as the partner app (GOOGLE_MAPS_ANDROID_API_KEY,
// restricted to this package and its signing certificate, never committed). iOS uses Apple Maps.
const googleMapsAndroidKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim() ?? "";

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

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "V Solve Hub",
  slug: "vsolve-customer",
  owner: "webaura7000s",
  scheme: "vsolvehub",
  // 1.1.0: Rides, Pick up & Drop and Taxi, which need the maps native module.
  version: "1.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  icon: "./assets/icon.png",
  runtimeVersion: { policy: "appVersion" },
  updates: { url: "https://u.expo.dev/4c93edc0-6aa8-40a9-a9ea-b3d218b46b22" },
  ios: {
    bundleIdentifier: "com.vsolvehub.customer",
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
    // www only: the bare vsolvehub.com redirects to www, and Apple will not follow a redirect
    // when it fetches apple-app-site-association. Backend links use www too (CUSTOMER_SITE_URL).
    associatedDomains: ["applinks:www.vsolvehub.com"],
    ...(googleServiceInfoPlist ? { googleServicesFile: googleServiceInfoPlist } : {}),
  },
  android: {
    package: "com.vsolvehub.customer",
    // www only, never also the bare vsolvehub.com: it redirects to www, so Android cannot verify
    // it, and on Android 11 and older one unverified host switches app links off for every host.
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "www.vsolvehub.com", pathPrefix: "/bookings" },
          { scheme: "https", host: "www.vsolvehub.com", pathPrefix: "/requests" },
          { scheme: "https", host: "www.vsolvehub.com", pathPrefix: "/engagements" },
          { scheme: "https", host: "www.vsolvehub.com", pathPrefix: "/jobs" },
          { scheme: "https", host: "www.vsolvehub.com", pathPrefix: "/activity" },
          { scheme: "https", host: "www.vsolvehub.com", pathPrefix: "/account" },
          { scheme: "https", host: "www.vsolvehub.com", pathPrefix: "/catalog" },
          { scheme: "https", host: "www.vsolvehub.com", pathPrefix: "/book" },
          { scheme: "https", host: "www.vsolvehub.com", pathPrefix: "/cart" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
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
        // Status-bar icon: Android draws it as a one-colour shape, so it is the logo's white
        // silhouette. The full-colour logo is the large icon beside every notification's text
        // (saved as ic_onesignal_large_icon_default, which OneSignal uses unless a push names another).
        smallIcons: ["./assets/android-icon-monochrome.png"],
        largeIcons: ["./assets/logo-mark.png"],
        // The logo's orange, measured from the owner's artwork. Android 12-16 paints the small icon
        // in this one colour; Android 17+ shows the full-colour launcher icon instead.
        smallIconAccentColor: "#fe6c01",
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
        locationWhenInUsePermission: "Vsolve Hub uses your location to set the service address.",
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
    eas: {
      projectId: "4c93edc0-6aa8-40a9-a9ea-b3d218b46b22",
    },
  },
});
