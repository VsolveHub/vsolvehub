const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-native",
              importNames: ["Text"],
              message:
                "Import `Text` from `@vsolve/mobile-ui` instead of `react-native` to ensure Plus Jakarta Sans brand font and weight mappings are applied.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "Property[key.name='fontFamily'][value.value=/system-ui/]",
          message:
            "Do not use CSS font stacks with system-ui in React Native. Use @vsolve/mobile-ui Text and Tailwind classes instead.",
        },
      ],
    },
  },
  {
    // Jest module mocks and setup run under Jest, where `jest` is a global and mocks are
    // throwaway stand-ins that never appear in React DevTools.
    files: ["src/test/**/*.cjs"],
    languageOptions: { globals: { jest: "readonly" } },
    rules: { "react/display-name": "off" },
  },
]);
