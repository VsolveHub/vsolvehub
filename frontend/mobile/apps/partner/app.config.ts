import type { ConfigContext, ExpoConfig } from "expo/config";

const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "V Solve Hub Partner",
  slug: "vsolve-partner",
  owner: "vsolvehub",
  scheme: "vsolvepartner",
  version: "1.0.0",
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
    [
      "expo-notifications",
      {
        icon: "./assets/icon.png",
        color: "#f87000",
        sounds: ["./assets/sounds/booking_alert.wav"],
      },
    ],
  ],
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
    webBaseUrl: process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "",
    eas: {
      projectId: "9223c951-f79e-44c2-869d-1dc244c89071",
    },
  },
});
