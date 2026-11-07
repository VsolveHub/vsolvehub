# Phase 2 — EAS and the first phone builds (queued in the background)

**Before you start:** Phase 1 done. You are a member of the owner's Expo organisation. You have
the staging and production API URLs and the two website URLs from the owner.

This phase installs **every native package the apps will ever need**, so the development build
made today should not need rebuilding until push setup in Phase 15.

## Prompt

```text
Phase 2 of the Vsolve Hub mobile build. Read frontend/mobile/AGENTS.md and
frontend/mobile/guide/02-architecture.md (§2, §6, §8, §9) first.

Values (ask me if any is missing, never invent):
- Expo organisation: <ORG>
- Staging API: <STAGING_API_URL>   Production API: <PRODUCTION_API_URL>
- Customer website: <CUSTOMER_WEB_URL>   Partner website: <PARTNER_WEB_URL>

For BOTH apps (frontend/mobile/apps/partner and apps/customer):
1. Install with `npx expo install`: expo-dev-client expo-updates expo-secure-store
   expo-notifications expo-device expo-location expo-image-picker expo-document-picker expo-image
   expo-crypto expo-audio expo-web-browser expo-clipboard expo-linear-gradient expo-blur
   react-native-webview @react-native-community/netinfo @react-native-async-storage/async-storage
   lottie-react-native react-native-gesture-handler react-native-reanimated react-native-svg.
   Then `pnpm add zustand zod` (zod: the same major version as frontend/apps/customer).
2. app.config.ts: add `owner: "<ORG>"`, `runtimeVersion: { policy: "appVersion" }`,
   `updates.url` (filled by `eas update:configure`), `extra.eas.projectId` (filled by `eas init`),
   and plugins with the permission texts from guide 02 §9:
   expo-router, expo-font, expo-secure-store, expo-location (when-in-use text only),
   expo-image-picker (photos + camera texts, microphone disabled), expo-notifications (icon + color
   "#f87000", sounds: Partner includes the alert sound file copied from
   frontend/apps/partner/public/sounds/ into assets/sounds/), expo-audio.
   android.permissions: CAMERA, ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION, POST_NOTIFICATIONS,
   VIBRATE. android.blockedPermissions: ACCESS_BACKGROUND_LOCATION, RECORD_AUDIO.
   android.googleServicesFile: process.env.GOOGLE_SERVICES_JSON (undefined is allowed for now).
   ios.infoPlist: ITSAppUsesNonExemptEncryption false.
3. Run `eas init` (link to the organisation project) and `eas update:configure`.
4. eas.json with cli.appVersionSource "remote" and profiles:
   development: developmentClient true, distribution internal, channel "development";
   preview: distribution internal, channel "preview", android.buildType "apk",
     env EXPO_PUBLIC_API_BASE_URL=<STAGING_API_URL>, EXPO_PUBLIC_WEB_BASE_URL=<site>;
   production: channel "production", autoIncrement true,
     env EXPO_PUBLIC_API_BASE_URL=<PRODUCTION_API_URL>, EXPO_PUBLIC_WEB_BASE_URL=<site>.
   submit.production: android.track "internal".
5. Create apps/<app>/.env (git-ignored) with EXPO_PUBLIC_API_BASE_URL=http://<MY_PC_WIFI_IP>:8000
   and EXPO_PUBLIC_WEB_BASE_URL=<site>. Ask me for my IP.
6. Run lint, typecheck and test for both apps and paste the output.
7. Queue builds WITHOUT waiting, in this order:
   cd frontend/mobile/apps/partner;  eas build --profile development --platform android --no-wait
   cd frontend/mobile/apps/customer; eas build --profile development --platform android --no-wait
   If I confirm my iPhone is registered (eas device:create) and Apple access exists, also queue
   --platform ios for both. Otherwise skip iOS and tell me to queue it later.
8. Print the build page URLs and tell me: "Continue with Phase 3 now. Install the builds when
   they finish (open the URL on the phone)."
```

## TODO

- [x] all native packages installed in both apps
- [x] permissions and plugins configured exactly as listed
- [x] `eas init` + `eas update:configure` done, `eas.json` with 3 profiles
- [x] local `.env` created (not committed)
- [x] Android dev builds queued for both apps (iOS if Apple is ready)

## Done when

- [x] `eas build:list` shows the builds (queued or finished)
- [x] once finished: the dev build is installed on your Android phone, `pnpm --filter partner-mobile start`
      is running, and the phone opens the app from the QR code and shows the ready screen

Do not wait for the builds. Move on to Phase 3.

## Commit

```powershell
git add frontend/mobile/apps/partner frontend/mobile/apps/customer frontend/pnpm-lock.yaml
git commit -m "feat(mobile): configure EAS profiles, native modules and permissions"
```

Check `git status` first. `.env` must **not** be listed.

## Status

- **Status:** Complete (100% implemented)
- **Implementation:** Native modules, permissions, `app.config.ts` plugins, and `eas.json` build profiles (development, preview, production) configured across both partner and customer apps.
