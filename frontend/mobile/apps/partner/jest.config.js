/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "offers/offers.test.tsx",
    "offers/live-events.test.ts",
    "notifications/queries.test.tsx",
    "proposal/model/recent-presets.test.ts",
    "enquiry/contact-boundary.test.ts",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^react-native/asset-registry$": "react-native/src/asset-registry.js",
    "^react-native/react-private-interface$": "react-native/src/react-private-interface.js",
    "^react-native/setup-env$": "<rootDir>/src/test/empty-mock.js",
    "^react-native/unstable-internals-do-not-use$": "react-native/src/unstable-internals-do-not-use.js",
    "^expo-router$": "<rootDir>/src/test/expo-router-mock.cjs",
    "^lucide-react-native$": "<rootDir>/src/test/lucide-mock.cjs",
    "^@react-native-async-storage/async-storage$": "<rootDir>/src/test/async-storage-mock.cjs",
    "^react-native-webview$": "<rootDir>/src/test/webview-mock.cjs",
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-native-svg|nativewind|react-native-css-interop|lucide-react-native|openapi-fetch|@vsolve|react-navigation|@react-navigation|@sentry/react-native|native-base))",
    "/node_modules/react-native-reanimated/plugin/",
    "/node_modules/@react-native/babel-preset/",
  ],
};
