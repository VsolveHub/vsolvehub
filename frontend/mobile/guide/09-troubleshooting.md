# Troubleshooting

Find the symptom, paste the prompt. Do not write your own fix instructions.

**General fix prompt** (anything not listed below):

```text
Something is broken. Here is exactly what I see: <paste the error text or describe the screen>.
Where: <browser / emulator / phone>, screen <route>, phase <number>.
Read frontend/mobile/AGENTS.md and the phase file. Find the root cause (do not guess), fix it
within the files you are allowed to edit, re-run the phase checks, and show me the output.
If the cause is in the web app or backend code you do not own, stop and tell me instead.
```

| Symptom | Prompt |
|---|---|
| `Invalid hook call` / two copies of React | "Invalid hook call in <app>. Check `metro.config.js` against `guide/02-architecture.md` §1 (SINGLETONS resolver), and that no workspace package lists `react` as a dependency instead of a peer. Fix, clear the Metro cache (`npx expo start -c`) and verify." |
| `Unable to resolve module` for a workspace package | "Metro cannot resolve `<module>`. Check `frontend/pnpm-workspace.yaml`, the package's `exports`, and `metro.config.js`. Run `pnpm install` from `frontend/`, restart with `-c`, verify. If pnpm's isolated layout is the cause, tell me before changing `node-linker`." |
| Styles missing (no colours) | "NativeWind classes are not applied in <file>. Check `tailwind.config.js` `content` includes `../../packages/ui/src/**`, `global.css` is imported in `app/_layout.tsx`, the babel preset has `nativewind/babel` and `jsxImportSource: 'nativewind'`, and `nativewind-env.d.ts` exists. Fix and restart with `-c`." |
| Sizes look smaller than web | "Spacing is smaller than web. Confirm `inlineRem: 16` in `withNativeWind` (guide 02 §1)." |
| Wrong font / bold not showing on Android | "Fonts are wrong on Android. Check the `Text` component follows guide 03 §2 (family per weight, `fontWeight: normal`)." |
| Phone says "Network request failed" | "The phone cannot reach the backend. Check `apps/<app>/.env` `EXPO_PUBLIC_API_BASE_URL` uses my PC's Wi-Fi IP (not localhost), `DJANGO_ALLOWED_HOSTS` includes it, and the server runs on 0.0.0.0:8000. Test with the phone browser at /api/v1/health/live/." |
| Browser preview: CORS error | "CORS error from http://localhost:8081. Check backend `.env` `CORS_ALLOWED_ORIGINS` includes it and the server was restarted." |
| 403 `csrf_failed` on mobile | "Mobile got csrf_failed. The request is not in bearer mode or the middleware is not active. Check `getApiClient()` uses `auth: { mode: 'bearer' }` and `BearerAwareSessionMiddleware` replaced SessionMiddleware. Add a failing test first, then fix." |
| Logged out on every restart | "The session is not restored at startup. Check the auth store `hydrate()` reads SecureStore before the first query and the root layout waits for it." |
| No push received | "Push does not arrive on <device>. Check in order: dev build (not Expo Go), permission granted, `/mobile/devices/` called (show the device row), `MOBILE_PUSH_PROVIDER=expo` and `EXPO_ACCESS_TOKEN` set, worker + beat running, the `PushTicket` status and error, the FCM V1 key in `eas credentials` (Android), the Android channel id. Report each result." |
| Build fails on EAS | "EAS build failed. Here is the build URL: <url>. Open the logs, find the first real error, fix it in my files, and re-queue with `--no-wait`." |
| Jest: "SyntaxError: Cannot use import statement" | "Jest cannot transform `<package>`. Add it to `transformIgnorePatterns` in `jest.config.js` (pnpm-aware pattern with `(?:.pnpm/)?`) and re-run." |
| Razorpay sheet blank / UPI app does not open | "The Razorpay WebView fails. Check guide 02 §8: `originWhitelist`, `javaScriptEnabled`, and `onShouldStartLoadWithRequest` opening upi/intent URLs with Linking. Test with the fake provider first, then Razorpay test mode." |
