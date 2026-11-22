const path = require("node:path");

const jestExpoDir = path.dirname(require.resolve("jest-expo/package.json"));
const presetDir = path.dirname(require.resolve("@react-native/jest-preset/package.json", { paths: [jestExpoDir] }));
const rnRoot = path.dirname(require.resolve("react-native/package.json", { paths: [presetDir] }));
const reactRoot = path.dirname(require.resolve("react/package.json"));

const reactNativePrivateInterface = path.join(rnRoot, "src/react-private-interface.js");
const reactNativeAssetRegistry = path.join(rnRoot, "src/asset-registry.js");
const reactNativeUnstableInternals = path.join(rnRoot, "src/unstable-internals-do-not-use.js");

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  testTimeout: 20000,
  testPathIgnorePatterns: [
    "/node_modules/",
    "offers/offers.test.tsx",
    "offers/live-events.test.ts",
    "notifications/queries.test.tsx",
    "enquiry/contact-boundary.test.ts",
  ],
  moduleNameMapper: {
    "^react-native/react-private-interface$": reactNativePrivateInterface,
    "^react-native/asset-registry$": reactNativeAssetRegistry,
    "^react-native/setup-env$": "<rootDir>/src/test/noop-mock.cjs",
    "^react-native/unstable-internals-do-not-use$": reactNativeUnstableInternals,
    "^react-native$": path.join(rnRoot, "index.js"),
    "^react-native/(.*)$": path.join(rnRoot, "$1"),
    "^react$": path.join(reactRoot, "index.js"),
    "^react/(.*)$": path.join(reactRoot, "$1"),
    "^@/(.*)$": "<rootDir>/src/$1",
    "^expo-crypto$": "<rootDir>/src/test/expo-crypto-mock.cjs",
    "^expo-router$": "<rootDir>/src/test/expo-router-mock.cjs",
    "^lucide-react-native$": "<rootDir>/src/test/lucide-mock.cjs",
    "^@react-native-async-storage/async-storage$": "<rootDir>/src/test/async-storage-mock.cjs",
    "^react-native-webview$": "<rootDir>/src/test/webview-mock.cjs",
    "^react-native-maps$": "<rootDir>/src/test/maps-mock.cjs",
    "^react-native-safe-area-context$": "<rootDir>/src/test/safe-area-mock.cjs",
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-native-svg|nativewind|react-native-css-interop|lucide-react-native|openapi-fetch|@vsolve|react-navigation|@react-navigation|@sentry/react-native|native-base))",
    "/node_modules/react-native-reanimated/plugin/",
    "/node_modules/@react-native/babel-preset/",
  ],
};
