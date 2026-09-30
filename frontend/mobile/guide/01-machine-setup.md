# Phase 0 — Mobile setup (one time)

You already have the repo, the backend and the web apps running. This page covers only what is
new for mobile.

## 1. Install

| Tool | How | Check |
|---|---|---|
| EAS CLI | `npm install -g eas-cli`, then `eas login` | `eas whoami` |
| Android Studio | developer.android.com/studio → Device Manager → create a **Pixel 7** emulator (latest Google Play image) | emulator boots |
| Expo Go (optional) | Play Store / App Store on your phone | — |

Work on your own branch: `git checkout -b mobile/v1`.

## 2. Let the phone reach your local backend

Phone and computer must be on the same Wi-Fi.

1. `ipconfig` → note your IPv4 address, for example `192.168.1.23`.
2. In `backend\.env`:
   - `DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,192.168.1.23`
   - add `http://localhost:8081` (Expo browser preview) to both `CORS_ALLOWED_ORIGINS` and
     `DJANGO_CSRF_TRUSTED_ORIGINS`
3. Restart `server.cmd`. When Windows Firewall asks, allow private networks.
4. Keep `worker.cmd` and `beat.cmd` running too. Push delivery runs in them.

## 3. Where you test

| Where | Use for |
|---|---|
| Browser (press `w` in the Expo terminal) | layout, text, navigation, forms, API calls |
| Android emulator | everything except real push |
| Real Android + iPhone with the **development build** | push, camera, payments, final checks |

## 4. Builds are slow, so they run in the background

The development build (your own app installed on the phone) is needed only for native features.
The first one can sit in Expo's queue for an hour or more. So Phase 2 queues it on day one, and
you keep working in the browser and emulator while it waits. After it is installed, code changes
reach the phone instantly. Rebuild only when a phase says **rebuild**, always with `--no-wait`.

iPhone: run `eas device:create`, open the link on the iPhone, then turn on
Settings → Privacy & Security → Developer Mode.

## 5. Accounts (the owner invites you)

Expo organisation (Developer), Apple Developer team (Admin), Google Play Console (Admin), Firebase
project (Editor). Apple is needed only from Phase 15.

**Done when:** `eas whoami` works, the emulator boots, and the phone can open
`http://<your-ip>:8000/api/v1/health/live/` in its browser.
