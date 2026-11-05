# Live job screens: spec before code

Status: **DRAFT for owner approval. No app file has been edited.** (5 Nov 2026)
Scope: Partner job screen, offer alert sound, Customer visit screen + start code.

Legend: `[ button ]`  `( chip )`  `●` partner dot  `📍` customer pin  `▓` map  `◉` current step

---

## 0. What is actually wrong (found in the code)

| # | You saw | Real cause | Where |
|---|---|---|---|
| 1 | Offer sound plays once | The sound is only the OneSignal push sound: `booking_alert.wav`, **2.43 s long**. Nothing inside the app plays or loops it. `expo-audio` is installed and never used. | `app.config.ts:111`, `alerts-bus.ts` (no audio) |
| 2 | Customer cannot show the start code | The mobile port drifted from the web: it sends a hard-coded `expected_version: 1` (the request is rejected once the booking has moved on) and reads the legacy `development_code` (empty in production) instead of `code`. Web uses the visit's real version and `code`. | `customer/.../bookings/view/visit-start-code.tsx:29,32` |
| 3 | Map is a black square with a Google logo | Not a code bug. The route line loaded (`6 min · 1.5 km` is on screen), so Django's server key works. The **Android Maps key baked into the app** is rejected by Google: Maps SDK for Android not enabled on that key/project, or the key is restricted to a different package/SHA-1 than the EAS-signed build. | `app.config.ts:100`, Google Cloud console |
| 4 | Map is a small 240 px box in a scroll list | By design today: `VisitRouteMap` is `height: 240` inside a `ScrollView`. | `visit-route-map.tsx:34` |
| 5 | Address still shown while working | `VisitLocation` renders for every live status including `IN_PROGRESS`. | `visit-job-view.tsx:142,170` |
| 6 | Customer shows "Booked" badge while stepper says Arrived | Badge reads the group status, stepper reads the visit status. Two sources for one fact. | `visit-panel.tsx:395,406` |

### Fix for #3 (you do this in Google Cloud, ~10 min, no rebuild if only restrictions change)

1. Google Cloud, project that owns the key: **APIs & Services → Library → "Maps SDK for Android" → Enable**.
2. **Credentials → the key → Application restrictions = Android apps**. Add package `com.vsolvehub.partner` with the SHA-1 of the keystore that signed this build: run `eas credentials -p android` and copy the SHA-1 (add the Play App Signing SHA-1 later for store builds).
3. **API restrictions**: allow *Maps SDK for Android* (keep Routes/Directions on the separate server key).
4. Billing must be active on the project.
5. If the key was added to the EAS secret *after* the last build, one new build is needed (the key is baked in at build time). I will not start a build unless you ask.

---

## 1. Partner job screen: the Rapido layout

**Principle: the map is the screen. Everything else is a bottom sheet that shows only what the current stage needs.**

```
┌────────────────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  map fills the WHOLE screen,
│▓ (←)              (BOOKED) ▓│  edge to edge, under the status bar
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  floating round back button +
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  status chip, nothing else on top
│▓▓▓▓▓▓●━━━━━━━━┓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┗━━📍▓▓▓▓▓▓▓│  ● pulses, route draws on,
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  camera fits both points
│▓ (◎ re-centre)             ▓│
├────────────────────────────┤
│        ───── (grab bar)    │  sheet, drags between 3 heights
│  STAGE CONTENT (see §2)    │  peek 34% · half 58% · full 90%
│                            │
│ [ big primary action ]     │  one primary action, always at the
└────────────────────────────┘  thumb, never scrolled away
```

Sheet behaviour: spring snap (reanimated + gesture-handler, already allowed in `AGENTS.md` §2; no new package). The map camera re-pads itself to the visible part above the sheet each time it snaps, so the route is never hidden behind it. The sheet never covers the primary action.

### 2. What shows at each stage (only what is mandatory)

| Stage (`status`) | Map | Sheet contents | Address | Customer phone | Primary action |
|---|---|---|---|---|---|
| **Booked** (`CONFIRMED`) | full, partner dot → pin | job title, **Starts 4:25 pm**, **earning ₹163.18**, locality + full address, requirements ("bring…") | full | yes | **I am on my way** |
| **On the way** (`EN_ROUTE`) | full, live dot, ETA chip | **ETA + km**, customer first name, address, Navigate, Call | full | yes | **Slide: I have arrived** |
| **Arrived** (`ARRIVED`) | shrinks to a top strip (pin only, ~28%) | **Start code pad**, one-line address (collapsed), Call, "Nobody is here" | one line | yes | **Start work** (after 4 digits) |
| **Working** (`IN_PROGRESS`) | **removed** (unmounted, saves battery) | live work timer, scope checklist, photo, **All work done** | **gone** | icon only | **All work done** |
| Report (`ABORTED` / itemised) | none | per-task Done / Part / Not done chips | none | none | **Send report** |
| Waiting / done | none | status medallion, final earning | none | none | none |

Removed from the working stage, as you asked: Customer address card, Navigate, route map, "Next step" explainer, visit-details grid (date, time, service area). "Stop this job" moves into a `⋯` menu with a confirm sheet so it can't be hit by accident next to "All work done".

### 2a. Screen: Booked

```
┌────────────────────────────┐
│▓ (←)               (BOOKED)▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓●━━━━━━┓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓┗━━📍▓▓▓▓▓▓▓▓▓▓▓▓▓│
├────────────────────────────┤
│        ─────               │
│ Window Repair ×1           │
│ ⏰ Starts 4:25 pm   ₹163.18 │
│ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ │
│ 📍 Maple pg                │
│    Financial District,     │
│    Nanakramguda, 500032    │
│ 🧰 Bring: ladder, sealant  │
│                            │
│ [ ➜ Navigate ] [ 📞 Anthapu]│
│ [   I am on my way   ]     │
└────────────────────────────┘
```

Before the unlock window (address hidden by the server) the sheet shows "Near <area>" and "Address appears at 2:25 pm" with a gentle countdown; the map shows the area only. No fake pin.

### 2b. Screen: On the way

```
┌────────────────────────────┐
│▓ (←)             (ON THE WAY)▓│
│▓ ┌──────────────┐          ▓│
│▓ │ 🕒 6 min · 1.5 km │      ▓│  ETA chip floats on the map
│▓ └──────────────┘          ▓│
│▓▓●━━━━━┓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓┗━━━📍▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
├────────────────────────────┤
│        ─────               │
│ (A) Anthapu          ₹163  │
│     Maple pg · 1.5 km  📞  │
│ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ │
│ [ ➜ Navigate in Google Maps]│
│ ┌────────────────────────┐ │
│ │ ❯❯  Slide: I have arrived│ │  slide-to-confirm, no mis-taps
│ └────────────────────────┘ │
└────────────────────────────┘
```

### 2c. Screen: Arrived (code pad)

```
┌────────────────────────────┐
│▓ (←)               (ARRIVED)▓│
│▓▓▓▓▓▓▓▓▓▓📍(pulse)▓▓▓▓▓▓▓▓▓▓│  map is only a context strip
├────────────────────────────┤
│ Ask Anthapu for the code   │
│                            │
│   ┌──┐ ┌──┐ ┌──┐ ┌──┐      │  4 big boxes, number pad opens
│   │ 4│ │ 7│ │  │ │  │      │  automatically, SMS auto-fill on
│   └──┘ └──┘ └──┘ └──┘      │
│  wrong code → boxes shake   │
│                            │
│ 📍 Maple pg, Nanakramguda ⌄ │  collapsed to one line
│ [ 📞 Call ]  [ Nobody here ]│
│ [      Start work      ]    │  enabled at 4 digits
└────────────────────────────┘
```

### 2d. Screen: Working

```
┌────────────────────────────┐
│ ▓▓▓ navy header ▓▓▓▓▓▓▓▓▓▓ │  no map, no address
│ (←)               (WORKING)│
│ Window Repair ×1           │
│ ⏱ 00:42:10     ₹163.18     │  live timer from server start time
├────────────────────────────┤
│ ✓ Window Repair ×1         │  scope checklist = what was booked
│ 🧰 Bring: sealant          │
│ [ 📷 Add a photo (optional) ]│
│ [ 📞 ]                  [ ⋯ ]│  call icon; ⋯ = Stop this job
│ [     All work done     ]  │
└────────────────────────────┘
```

---

## 3. Offer sound: ring until answered or expired

**Rule:** the alert repeats from the moment an offer is `PENDING` until the first of: Accept, Decline, the server countdown reaching 0, the offer leaving `PENDING` (another partner won, cancelled), or the screen/app going away.

| Part | Design |
|---|---|
| New hook | `useOfferRingtone(active: boolean)` in `features/notifications/`, used by `DispatchOfferScreen` and `LiveOfferSheet`. `active = offer.status === "PENDING" && remaining > 0` (server clock, same value the countdown ring uses). |
| Audio | `expo-audio`, one looping player on `booking_alert.wav`, `loop = true`; silent-mode override on; stops and releases on cleanup. Volume stays at the phone's alarm/media level (no forcing). |
| Vibration | RN `Vibration.vibrate([0, 500, 400], true)` while active, cancelled with the sound. |
| Visual | The countdown ring pulses with the ring; a "Silence" chip (not Decline) stops sound but keeps the offer open. |
| Server truth | The hook never decides expiry itself; it follows the server-clock countdown, so a skewed phone clock can't ring past the end. |

**Honest limit (background / screen off):** the push sound is played by Android once, for the length of its file (today 2.43 s). An app can't loop a push sound. Options, pick one:

- **A (recommended):** replace the file with a ~25 s ringtone-style version of the same alert, set on the OneSignal offer channel. Rings the whole offer window when the phone is locked. Needs a rebuild to ship the new sound.
- B: keep 2.43 s and add a repeat push every 20 s from Django until answered (more server work, more notifications).

Tapping the push opens the offer screen and the loop starts there, so after the first tap it rings until answered either way.

---

## 4. Customer app

### 4a. Visit screen header (fixes "Back to Bookings")

Remove the full-width outlined "‹ Back to Bookings" box. Replace with a compact top bar.

```
Before                         After
┌──────────────────────┐      ┌──────────────────────────┐
│ [‹ Back to Bookings ]│      │ (‹)  Your visit  (Booked)│
├──────────────────────┤      └──────────────────────────┘
│ Your visit    Booked │       round 44px back button, title
```

### 4b. Live hero: tells the story in one line

```
┌────────────────────────────┐
│ (‹)  Your visit   ( Booked )│
│                            │
│  Rohith is on the way      │  large, changes with status
│  Arriving in about 6 min   │  from the visit's own times
│                            │
│  ●━━━━━━◉─────○            │  stepper: filled line animates,
│  On the way  Arrived  Working│  current dot pulses
├────────────────────────────┤
│ ✓ Verified professional    │
│ (R) Rohith · 1 yr exp  [📞] │  one-tap call
└────────────────────────────┘
```

### 4c. Start code: appears by itself on arrival

```
┌────────────────────────────┐
│  ROHITH HAS ARRIVED        │
│  Your start code           │
│                            │
│   ┌──┐ ┌──┐ ┌──┐ ┌──┐      │  fetched automatically the moment
│   │ 4│ │ 7│ │ 2│ │ 9│      │  status = ARRIVED (no "Show code"
│   └──┘ └──┘ └──┘ └──┘      │  hunt); cooldown-safe, same code on
│                            │  re-open
│  Tell it only to Rohith,   │
│  once he is at your door.  │
│  [ Hide ]   (copy of SMS)  │
└────────────────────────────┘
```

Shown only at `ARRIVED`, gone at work start, exactly as the web decides it. Failure shows a retry button with the real error message, never an empty card.

### 4d. Below the hero (unchanged data, calmer styling)

Schedule, service, payment summary and receipt become soft cards with 16 px radius, one accent colour for the single next action, and the receipt button as a full-width outline button at the end. Pull-to-refresh stays.

---

## 5. Motion and UX details (all with allowed packages)

| Moment | Motion |
|---|---|
| Sheet drag | spring snap, rubber-band at ends (reanimated) |
| Partner dot | soft pulse ring (scale 1→2.2, fade out, 1.6 s loop) |
| Route | draws from dot to pin once, then updates quietly |
| ETA number | cross-fades when it changes, never jumps |
| Slide to arrive | thumb follows finger, haptic-style short vibration on success |
| Wrong code | boxes shake 3x, error text under them |
| Stage change | sheet content cross-fades; map eases to the new camera |
| Job complete | one-shot Lottie check (`lottie-react-native`), earning counts up |
| Loading | skeleton shimmer in the sheet, never a blank screen |
| Reduced motion | all loops stop, transitions become instant (system setting honoured) |

Accessibility: 44 px minimum targets, every status also in text, map has a text equivalent ("Route to the customer, 6 min · 1.5 km").

---

## 6. Files that will change (after you approve)

| File | Change |
|---|---|
| `partner/.../work-stack/view/visit-job-view.tsx` | becomes the map + sheet shell; stage content split into small files |
| `partner/.../work-stack/view/visit-route-map.tsx` | full-screen, camera padding, pulse dot, hide at `IN_PROGRESS` |
| new `partner/.../work-stack/view/job-sheet.tsx` | draggable bottom sheet |
| new `partner/.../notifications/use-offer-ringtone.ts` | looping alert |
| `partner/.../dispatch/view/dispatch-offer-screen.tsx`, `crew-offer/view/live-offer-sheet.tsx` | call the hook |
| `customer/.../bookings/view/visit-start-code.tsx` | real version, `code`, auto-request on `ARRIVED` |
| `customer/.../visit/view/visit-panel.tsx`, `bookings/view/group-detail.tsx` | new header, hero, one status source |
| `partner/assets/sounds/` + OneSignal channel | only if you choose option A in §3 |

Tests written (not run, per the owner-run rule): offer-ringtone hook, start-code component (version + `code`), sheet stage matrix (what shows per status).

## 7. Decisions I need from you

1. **Sound in background:** option A (long ringtone file, needs a build) or B (repeat pushes)?
2. **Customer live map:** should the customer see the partner moving on a map like Rapido? The backend does not publish partner coordinates to customers today, so this would be new backend work. I left it out of this spec.
3. **Arrived stage:** keep the one-line address, or hide it entirely once the partner taps "I have arrived"? (Spec keeps one line, collapsed.)
