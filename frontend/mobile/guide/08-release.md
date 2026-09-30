# Release checklist (both apps)

## Once per app

- [ ] App created in **App Store Connect** (bundle id from the README, primary language English,
      SKU = bundle id) and in **Play Console** (package name from the README).
- [ ] Firebase: Android app added for each package name → `google-services.json` uploaded as an
      EAS **file** environment variable `GOOGLE_SERVICES_JSON` (never committed);
      `app.config.ts` reads `process.env.GOOGLE_SERVICES_JSON`.
- [ ] FCM V1 service-account key uploaded: `eas credentials` → Android → Push Notifications.
- [ ] iOS push key: `eas credentials` → iOS → Push Notifications → let EAS generate it.
- [ ] Deep-link files deployed on the website (Phase 15/24) and verified.

## Store listing content (the owner approves the text)

| Item | Spec |
|---|---|
| App icon | 1024×1024 PNG, no transparency (from the owner's logo) |
| Android adaptive icon | foreground 1024×1024 on transparent + background colour `#ffffff` |
| Splash | logo centred on `#ffffff` |
| Screenshots | Android phone: min 2. iPhone 6.9" (1320×2868): min 3. Taken from the preview build with real staging data. |
| Short / full description | from the owner |
| Privacy policy URL | `${WEB_BASE_URL}/privacy` |
| Support URL / email | from the owner |
| Category | Customer: Lifestyle. Partner: Business. |

## Store forms

- **Apple App Privacy**: Contact info (phone, name, email), Location (precise, app
  functionality), User content (photos: app functionality), Identifiers (device id: app
  functionality), Purchases (history). No tracking.
- **Apple review notes**: a test phone number + OTP from the owner, for a Customer account and a
  Partner account with an approved application. State that payments use Razorpay for real-world
  services (not digital goods), so In-App Purchase does not apply.
- **Google Data safety**: the same data types; data encrypted in transit; users can request
  deletion (in-app + `${WEB_BASE_URL}/privacy`).
- **Google permissions declaration**: location is foreground only. No background location. No SMS
  permission.
- **Account deletion**: in-app path Partner: Me → Delete account. Customer: Profile → Privacy →
  Delete my account. Also give Google the web URL.
- **Content rating** questionnaire: no violence/UGC sharing; Partner may upload photos (not public).
- **Target audience**: 18+.

## Build and submit

```powershell
cd frontend\mobile\apps\partner
eas build --profile production --platform all --no-wait
eas submit --profile production --platform android --latest   # → Play internal testing track
eas submit --profile production --platform ios --latest       # → TestFlight
```

Promote Play internal → production and submit iOS for review only when the owner says so. Both
apps go live together.

## After release

- JS-only fix: `eas update --channel production --message "<what changed>"`
- Native change: bump `version` in `app.config.ts` → new production build → submit.
- Raise `MOBILE_*_MIN_VERSION` on the server only after the new version is live in both stores.
