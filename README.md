E`  # VSolveHub — Quick Service Hub

Service marketplace platform for Tier 2/3 Indian cities.

## Mobile Apps

| App | Path | Status |
|-----|------|--------|
| Customer App | `apps/customer_app` | Step 1 scaffolded |
| Worker App | `apps/worker_app` | Planned |

## Customer App — Getting Started

```bash
cd apps/customer_app
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter run --dart-define-from-file=env/dev.json
```

Mock auth is enabled in `env/dev.json` for local testing:
- **Phone:** `9999999999`
- **OTP:** `123456`

Set `"ENABLE_MOCK_AUTH": "false"` to hit the real API.

### Firebase Setup

Run `flutterfire configure` in `apps/customer_app` before release builds to generate `firebase_options.dart`.

## Architecture

- Feature-first folder structure under `lib/features/`
- State: `flutter_riverpod` + `riverpod_annotation`
- Navigation: `go_router` with auth redirect
- Network: `dio` + `retrofit` via `AuthRepository`
- All async ops return sealed `Result<T>`
