import type { ConfigContext, ExpoConfig } from "expo/config";

const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "V Solve Hub",
  slug: "vsolve-customer",
  owner: "vsolvehub",
  scheme: "vsolvehub",
  version: "1.0.0",
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
    associatedDomains: ["applinks:vsolvehub.com"],
  },
  android: {
    package: "com.vsolvehub.customer",
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "vsolvehub.com", pathPrefix: "/bookings" },
          { scheme: "https", host: "vsolvehub.com", pathPrefix: "/requests" },
          { scheme: "https", host: "vsolvehub.com", pathPrefix: "/engagements" },
          { scheme: "https", host: "vsolvehub.com", pathPrefix: "/jobs" },
          { scheme: "https", host: "vsolvehub.com", pathPrefix: "/activity" },
          { scheme: "https", host: "vsolvehub.com", pathPrefix: "/account" },
          { scheme: "https", host: "vsolvehub.com", pathPrefix: "/catalog" },
          { scheme: "https", host: "vsolvehub.com", pathPrefix: "/book" },
          { scheme: "https", host: "vsolvehub.com", pathPrefix: "/cart" },
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
  },
  plugins: [
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
    [
      "expo-notifications",
      {
        icon: "./assets/icon.png",
        color: "#f87000",
      },
    ],
  ],
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
    webBaseUrl: process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "",
    eas: {
      projectId: "4c93edc0-6aa8-40a9-a9ea-b3d218b46b22",
    },
  },
});
