/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^react-native/asset-registry$": "react-native/src/asset-registry.js",
    "^react-native/react-private-interface$": "react-native/src/react-private-interface.js",
    "^react-native/unstable-internals-do-not-use$": "react-native/src/unstable-internals-do-not-use.js",
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-native-svg|nativewind|react-native-css-interop|lucide-react-native|openapi-fetch|@vsolve|react-navigation|@react-navigation|@sentry/react-native|native-base))",
    "/node_modules/react-native-reanimated/plugin/",
    "/node_modules/@react-native/babel-preset/",
  ],
};
