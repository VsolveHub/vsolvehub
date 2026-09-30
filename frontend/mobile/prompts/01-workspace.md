# Phase 1 — Create the mobile workspace

**Before you start:** Phase 0 done. Backend and web apps run.

## Prompt

```text
Phase 1 of the Vsolve Hub mobile build. Read these completely before editing anything:
frontend/mobile/AGENTS.md, frontend/mobile/guide/02-architecture.md,
frontend/mobile/guide/03-design-system.md.

Goal: an empty but fully configured workspace — two Expo apps and two shared packages — that
starts in the browser with the Vsolve fonts and colours.

Do exactly this:
1. frontend/pnpm-workspace.yaml: add "mobile/apps/*" and "mobile/packages/*" to packages.
   frontend/eslint.config.mjs: add "mobile/**" to globalIgnores. Change nothing else there.
2. In frontend/mobile/apps run `npx create-expo-app@latest partner --template blank-typescript --no-install`
   and the same for `customer`. Set package.json "name" to "partner-mobile" / "customer-mobile".
   Remove any lockfile or .git the template created. Run `pnpm install` from frontend/.
3. In each app, install Expo Router with `npx expo install expo-router react-native-safe-area-context
   react-native-screens expo-linking expo-constants expo-status-bar expo-font expo-splash-screen`,
   set "main": "expo-router/entry", and delete App.tsx / index.ts from the template.
4. Install NativeWind v4 exactly per its official Expo guide (nativewind@^4, tailwindcss@^3.4,
   react-native-reanimated, react-native-safe-area-context) in each app. Use tailwind.config.js from
   guide 03 §1, global.css from guide 03 §1, metro.config.js from guide 02 §1 (with inlineRem 16),
   the NativeWind babel preset, and nativewind-env.d.ts.
5. Install @expo-google-fonts/plus-jakarta-sans, lucide-react-native, react-native-svg, clsx,
   tailwind-merge.
6. Create frontend/mobile/packages/core (name "@vsolve/mobile-core") and
   frontend/mobile/packages/ui (name "@vsolve/mobile-ui"): package.json with "main": "./src/index.ts",
   "types": "./src/index.ts", react/react-native/expo packages as peerDependencies (never
   dependencies), scripts lint/typecheck/test; tsconfig extending expo/tsconfig.base with strict;
   src/index.ts exporting nothing yet. Add both packages plus "@vsolve/api-client": "workspace:*"
   and "@vsolve/query": "workspace:*" as dependencies of both apps.
7. tsconfig.json in each app: extends "expo/tsconfig.base", "strict": true,
   "paths": { "@/*": ["./src/*"] }.
8. Testing in every mobile package: jest-expo preset, @testing-library/react-native,
   jest.config.js with a pnpm-aware transformIgnorePatterns that allows react-native, expo, @expo,
   @expo-google-fonts, react-native-svg, nativewind, react-native-css-interop, lucide-react-native,
   openapi-fetch and @vsolve packages; moduleNameMapper for "@/". One smoke test per package.
9. Scripts in each app package.json: "start": "expo start", "android": "expo start --android",
   "web": "expo start --web", "lint": "expo lint", "typecheck": "tsc --noEmit", "test": "jest".
   Do NOT add a "build" script. Run `npx expo lint` once to create the ESLint config.
10. app.config.ts in each app (TypeScript, reads process.env): name ("V Solve Hub Partner" /
   "V Solve Hub"), slug ("vsolve-partner" / "vsolve-customer"), scheme ("vsolvepartner" /
   "vsolvehub"), version "1.0.0", orientation "portrait", userInterfaceStyle "light",
   ios.bundleIdentifier and android.package ("com.vsolvehub.partner" / "com.vsolvehub.customer"),
   ios.supportsTablet false, plugins ["expo-router", "expo-font"]. Copy the logo mark from
   frontend/apps/partner/public/logo-mark.png into each app's assets/ as a placeholder icon/splash.
11. .env.example in each app with EXPO_PUBLIC_API_BASE_URL= and EXPO_PUBLIC_WEB_BASE_URL=.
   Make sure each app's .gitignore ignores .env, /ios, /android, *.jks, *.p8, *.p12,
   *.mobileprovision, google-services.json, GoogleService-Info.plist.
12. app/_layout.tsx loads Plus Jakarta Sans (400/500/600/700/800), imports global.css, keeps the
   splash until fonts load. app/index.tsx shows the text "Vsolve Hub Partner — workspace ready"
   (or Customer) with className "text-2xl font-bold text-text" on "bg-canvas", and a Button-like
   Pressable with "bg-action rounded-control px-7 min-h-12" and text "text-action-text font-semibold".
13. Fill the "Pinned versions" table in frontend/mobile/AGENTS.md §9 with the versions installed.
14. Run and paste output: from frontend/: pnpm --filter partner-mobile lint, typecheck, test; the
   same for customer-mobile, @vsolve/mobile-core, @vsolve/mobile-ui; then pnpm lint and pnpm
   typecheck (the web must still pass).
```

## TODO

- [ ] workspace + eslint lines added (nothing else changed)
- [ ] `apps/partner`, `apps/customer` scaffolded with Expo Router
- [ ] NativeWind v4 + tokens + `inlineRem: 16` + fonts working
- [ ] `packages/core`, `packages/ui` created (react etc. as peer deps)
- [ ] jest-expo in all four packages with a smoke test
- [ ] `app.config.ts`, `.env.example`, `.gitignore` in both apps
- [ ] pinned versions table filled
- [ ] all checks pass, web checks still pass

## Done when

- [ ] `pnpm --filter partner-mobile start` → press `w` → the ready text is navy, bold, Plus Jakarta
      Sans, on the warm background, and the button is orange with dark text
- [ ] the same for `customer-mobile`
- [ ] press `a` → the same on the Android emulator

## Commit

```powershell
git add frontend/pnpm-workspace.yaml frontend/eslint.config.mjs frontend/pnpm-lock.yaml frontend/mobile
git commit -m "feat(mobile): scaffold Expo workspace for Customer and Partner apps"
```
