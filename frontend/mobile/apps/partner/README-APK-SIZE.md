# Partner app: a small APK for website download

You own this task from start to finish: making the Android app smaller, and letting partners
download it from our website (hosted on Cloudflare R2).

This README explains **the problem**, **what we already know**, and **one possible solution**.
That solution is a starting point, not the answer. Your job is to explore, measure, and find
the best approach. If you find something better, use it and explain why.

---

## 1. Words you need first

| Word | What it means |
|---|---|
| **APK** | The file Android installs. One file, one app. This is what we will put on the website. |
| **AAB** (App Bundle) | The file we upload to Google Play. Play turns it into small APKs made for each phone. Phones never install an AAB directly. |
| **ABI / CPU type** | The kind of processor a phone has. There are 4: `arm64-v8a` (most modern phones), `armeabi-v7a` (older and 32-bit phones), `x86` and `x86_64` (emulators and Chromebooks, almost never real phones). Native code must be compiled separately for each one. |
| **Native libraries (`.so` files)** | Compiled C/C++ code inside the app: React Native itself, Hermes, Reanimated, and so on. There is one copy per CPU type. |
| **Hermes bundle** | All our JavaScript, compiled into bytecode, in one file (`index.android.bundle`). |
| **EAS Build** | Expo's cloud build service. Profiles in `eas.json` decide what kind of build you get. |
| **Prebuild / CNG** | Our `android/` folder is **not** in git. EAS creates it fresh on every build from `app.config.ts`. So **editing `android/` by hand does nothing on EAS**. Native changes go through `app.config.ts`, config plugins, or Gradle settings passed by EAS. |
| **OTA update / channel** | `eas update` sends new JavaScript to installed apps without a new APK. Each build listens on one *channel* (`production`, `preview`, …). |

---

## 2. The problem

- The APK we can share today (from the `preview` profile) is about **120 MB**.
- The same app from Google Play downloads at about **18 MB**.
- Partners are technicians, often on budget phones and mobile data. 120 MB is too big to ask
  them to download.

**Why the difference?** Think of Play as a tailor: it sends each phone only the parts that fit
that phone (one CPU type, one screen size), and it compresses the download. Our APK is a box
with clothes for all four body types, packed without folding.

### What we measured

We opened the production AAB (version 1.1.0, 13 Nov) and measured each part.
"Uncompressed" is how much space the part takes inside an APK, the way we build it today.

| Part | Uncompressed | Compressed |
|---|---|---|
| Native code, `x86_64` | 27.3 MB | 9.1 MB |
| Native code, `x86` | 27.2 MB | 9.3 MB |
| Native code, `arm64-v8a` | 25.7 MB | 8.5 MB |
| Native code, `armeabi-v7a` | 17.8 MB | 7.4 MB |
| JavaScript bundle (Hermes) | 7.4 MB | 2.65 MB |
| Java/Kotlin code (dex) | 11.8 MB | 5.5 MB |
| Resources (images, fonts, sounds) | 12.0 MB | 5.8 MB |

### The causes we found (largest first)

1. **All 4 CPU types are inside one APK.** That is about 98 MB of native code. The two `x86`
   copies (55 MB) are useless on real phones.
   Setting: `reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64` (the Expo default).
2. **Native code is stored uncompressed** (`expo.useLegacyPackaging=false`). This helps Play
   installs, but makes a direct download much bigger: 25.7 MB instead of 8.5 MB for ARM64 alone.
3. **The JavaScript bundle is stored uncompressed**: 7.4 MB instead of 2.65 MB.
4. **The alert sound is in the app twice.** `assets/sounds/booking_alert.wav` is 24 seconds of
   raw WAV audio (2 MB). The OneSignal plugin copies it once, and the `require()` in
   [use-offer-ringtone.ts](src/features/notifications/use-offer-ringtone.ts) copies it again.
   Android never compresses `.wav` files, so that is 4 MB.
5. **12 font files we never load.** [app/_layout.tsx](app/_layout.tsx) imports from each font
   package's main entry, and that pulls in every weight (26 files shipped, 14 used).
6. **The whole icon library is bundled.** We use 112 Lucide icons out of about 1,855, but all
   of them are inside the JavaScript bundle (roughly 1 MB, estimated).

If you add these up you get about 120 MB, which matches what we see.

---

## 3. One possible solution (a starting point)

Not tested. Treat each line as a hypothesis to check.

**Idea A: a separate build profile just for the website**, leaving the Play build untouched.

```json
"website-arm64": {
  "extends": "production",
  "channel": "website",
  "android": {
    "buildType": "apk",
    "gradleCommand": ":app:assembleRelease -PreactNativeArchitectures=arm64-v8a -Pexpo.useLegacyPackaging=true -Pandroid.enableBundleCompression=true"
  }
}
```

- `-PreactNativeArchitectures=arm64-v8a` builds for one CPU type only.
- `-Pexpo.useLegacyPackaging=true` compresses the native code inside the APK.
- `-Pandroid.enableBundleCompression=true` compresses the JavaScript bundle.
- A second profile could do the same for `armeabi-v7a`, for older phones.

**Idea B: fix the assets** (this also makes the Play download smaller):
- Convert the alert sound to `.ogg` (or a smaller WAV), and ship it once.
- Import each font weight from its own path, e.g. `@expo-google-fonts/mukta/400Regular`.
- Import only the icons we use.

**Rough estimate:** about **50 MB** from ARM64-only, about **28 MB** with compression, and about
**23–24 MB** with the asset fixes.

---

## 4. Your job: explore and find the best solution

Please don't just copy section 3. Questions worth answering:

**About CPU types**
- How many of our partners have 32-bit phones? Look for real data: Crashlytics device
  reports, OneSignal device data, or ask operations. That decides whether we need an ARMv7 APK.
- Two APKs (ARM64 and ARMv7), or one APK with both (about 31 MB)? Which is easier for a partner
  who doesn't know what "ARM64" means?
- Can the website guess the phone type? (Look at `navigator.userAgentData` and client hints.
  Test it, don't assume.)

**About the build**
- Does EAS actually apply the `-P` flags in `gradleCommand`? Prove it by opening the APK.
- What are the other ways to do the same thing (`expo-build-properties`, a config plugin, the
  `ORG_GRADLE_PROJECT_*` environment variables)? Which is cleanest?
- What does compression cost? Measure cold-start time and install time on a cheap phone, with
  and without it.
- Resource shrinking (`android.enableShrinkResourcesInReleaseBuilds`): does it save much, and
  does it delete files we load by name (the sound, the fonts, the OneSignal icon)?

**About app content**
- The dex code is 5.5 MB compressed. Which libraries are the biggest? (Firebase, OneSignal,
  Google Maps, Bouncy Castle from `expo-updates`, …) Is anything there we don't need?
- Do we need all three font families and all five weights? (Mukta is for Hindi and Hind Guntur
  for Telugu, so check with the owner before removing a language.)
- Does the alert sound need to be 24 seconds long? (That is a product question: ask.)
- Anything we missed. Look at the APK yourself.

---

## 5. Not only size: website distribution

Making the APK small is half the work. Shipping it from a website brings its own problems.
Look into each one and propose a fix.

1. **Signing.** Play-installed apps are signed with Google's key. An APK we build ourselves is
   signed with our EAS upload key. Android will **not** update one with the other: the partner
   must uninstall (and lose their login) to switch. How do we explain this on the website?
   Is there a better option?
2. **The "Update" button.** [VersionGate.tsx](../../packages/core/src/version/VersionGate.tsx)
   asks the server whether an update is required, but only sends app, platform and version.
   The server always replies with the Play Store link, which can't update a website install.
   The app needs to tell the server where it came from. Hint: `EXPO_PUBLIC_*` values and
   `extra` in the app config are replaced by the next `eas update`, so they can't be used for
   this. `Updates.channel` is built into the APK and survives updates. This needs a small
   backend change too.
3. **Services locked to a signing key.** The Google Maps key and Firebase phone login check
   the app's signing fingerprint (SHA-1). The upload key's fingerprint must be added, or the
   map is blank and login may fail on website installs.
4. **App Links are broken today.** In
   [assetlinks.json](../../../apps/partner/public/.well-known/assetlinks.json) the fingerprint
   is 30 bytes long; a real SHA-256 is 32. It needs the real fingerprints, for Play and for
   the upload key.
5. **OTA updates.** If website builds use a `website` channel pointed at the same branch as
   `production`, one `eas update` reaches both. Check this works.
6. **Hosting on R2.** Decide:
   - which bucket and domain (not `r2.dev`, which is rate-limited);
   - a file name with the version, e.g. `vsolvehub-partner-1.1.0-42-arm64-v8a.apk`, never
     overwritten;
   - the headers: `Content-Type: application/vnd.android.package-archive`, a long cache for
     versioned files, and `Content-Disposition: attachment`;
   - a SHA-256 checksum, and the signing fingerprint shown on the page;
   - how the website finds the latest APK without a redeploy for every release (one idea: a
     small `latest.json` file next to the APKs).
7. **The download page** on the partner website (`frontend/apps/partner`). There isn't one
   yet. Include the steps to allow "Install unknown apps" in Chrome; many partners will never
   have done this.

---

## 6. Rules (things that must not break)

- **The Play Store build (`production` profile) stays as it is**, unless the owner agrees.
- **Don't edit `android/`**; EAS regenerates it. Use `app.config.ts`, config plugins or
  `eas.json`.
- **Never commit secrets**: keystores, `google-services.json`, the Maps key.
- **Work on your own branch.** Don't push to `main`.
- **EAS builds use our monthly quota.** Experiment with local builds where you can, and use
  EAS for real candidates. (Local Android builds on Windows hit the 260-character path limit;
  ask the owner about the short-path setup that already works.)
- **OTA:** read [guide/08-release.md](../../guide/08-release.md) before running `eas update`.
  An update published without the right environment crashes the app on launch.
- Everything that works today must still work. See the test list in section 8.

---

## 7. How to measure

Measure before and after every change. Always write down the numbers.

- **Android Studio → Build → Analyze APK…** Open any APK or AAB and see what's inside.
  This is the easiest place to start.
- **List the native code in an APK** (PowerShell):
  ```powershell
  (Get-Item .\app.apk).Length / 1MB
  tar -tf .\app.apk | Select-String "^lib/"
  ```
- **See what Play would send to a phone**, using
  [bundletool](https://developer.android.com/tools/bundletool):
  ```powershell
  java -jar bundletool.jar build-apks --bundle=app.aab --output=app.apks
  java -jar bundletool.jar get-size total --apks=app.apks --dimensions=ABI
  ```
- **Check the signature** (Android SDK build-tools):
  `apksigner verify --print-certs app.apk`
- **Checksum:** `Get-FileHash .\app.apk -Algorithm SHA256`

Download recent builds (the production AAB and the preview APK) from the EAS dashboard at
expo.dev, under the `vsolve-partner` project.

---

## 8. Suggested steps

1. **Understand.** Read this file, `eas.json`, `app.config.ts`, and
   [guide/08-release.md](../../guide/08-release.md).
2. **Measure.** Open the current APK and AAB. Confirm (or correct) the numbers in section 2.
3. **Experiment.** Try the ideas, and your own, one change at a time, measuring each one.
4. **Propose.** Write a short plan for the owner: what you'll do, the size you expect, the
   risks, and anything that needs a decision. Get it approved before the big changes.
5. **Build it.** The website profiles, the asset fixes, the update-button change, the
   assetlinks fix.
6. **Test on real phones**, at least one cheap phone and one 32-bit phone if we have one:
   - install from the APK, and install over an older website APK (the login must stay);
   - phone number login (Firebase);
   - push notification sound with the app closed, and the looping offer ringtone;
   - the map on the job screen;
   - Razorpay payment screen;
   - an OTA update arriving;
   - the "Update" button opening the website, not Play;
   - cold-start time compared to today.
7. **Ship.** Upload to R2 and add the download page to the partner website.

---

## 9. Done means

- [ ] A website APK under about 30 MB (or a clear reason why not), with numbers before and after.
- [ ] The Play Store build is unchanged, or the owner approved each change.
- [ ] Every item in the step 6 test list passes on a real phone.
- [ ] Website installs see the website, not Play, when an update is required.
- [ ] `assetlinks.json`, the Maps key and Firebase have the right fingerprints.
- [ ] APKs are on R2 with versioned names, correct headers and a SHA-256 checksum.
- [ ] The partner website has a download page with simple install steps.
- [ ] A short note in this folder on how to release the next version (commands, upload, checksum).

---

## 10. Useful files

| File | Why it matters |
|---|---|
| [eas.json](eas.json) | Build profiles. Today: `development`, `preview` (APK), `production` (AAB for Play). |
| [app.config.ts](app.config.ts) | App config and plugins (OneSignal sound, Firebase, `expo-build-properties`). |
| [app/_layout.tsx](app/_layout.tsx) | Font loading. |
| [src/features/notifications/use-offer-ringtone.ts](src/features/notifications/use-offer-ringtone.ts) | Second copy of the alert sound. |
| [VersionGate.tsx](../../packages/core/src/version/VersionGate.tsx) | The "Update required" screen. |
| [assetlinks.json](../../../apps/partner/public/.well-known/assetlinks.json) | App Links fingerprints (broken today). |
| [guide/08-release.md](../../guide/08-release.md) | How releases and OTA updates are done. |

Expo docs worth reading: "App size" (docs.expo.dev/distribution/app-size), "eas.json reference",
and "BuildProperties" (`expo-build-properties`).
