# VSolveHub — App Specifications: Customer Mobile App

> **Version:** 1.0 | **Last Updated:** June 2026  
> Flutter 3.x (Dart 3) — Android + iOS

---

## Overview

The Customer App is the primary channel for repeat customers. While the web app handles first-time discovery, the app provides a richer experience: push notifications, offline caching, faster navigation, and deeper profile management.

**App Store Listing:**
- App Name: VSolveHub
- Bundle ID: `com.quickservicehub.customer`
- Target: Android 9+ (API 28), iOS 14+
- Download: Google Play Store + Apple App Store

---

## Navigation Structure

```
Customer App
├── Onboarding (first-time only)
│   ├── Splash Screen
│   ├── Slide 1: Find any service
│   ├── Slide 2: Verified professionals
│   └── Slide 3: Track in real-time
├── Auth
│   ├── Enter Phone
│   └── OTP Verification
└── Main App (Bottom Tab Navigation)
    ├── Home (tab 1)
    ├── Services (tab 2)
    ├── My Bookings (tab 3)
    └── Profile (tab 4)
```

---

## Screen Specifications

### 1. Splash Screen
- VSolveHub logo centered
- Tagline: 'All services at your doorstep'
- Background: accent gradient (#FD4C4A → #8B2E2C)
- Auto-navigate after 2s:
  - → Onboarding (first-time install)
  - → Home (returning user with session)

---

### 2. Onboarding Slides (3 screens)

**Slide 1:** 🔍 Find any service
- Illustration: phone showing service categories
- Headline: 'Find Any Service'
- Body: '850+ services across construction, technician, events, and more'

**Slide 2:** ✅ Verified professionals
- Illustration: worker with badge/verification tick
- Headline: 'Verified Professionals'
- Body: 'Every worker is identity-verified and skill-tested before joining'

**Slide 3:** 📍 Track in real-time
- Illustration: map with worker marker and status timeline
- Headline: 'Track in Real-Time'
- Body: 'Know exactly when your worker is on the way — WhatsApp updates too'

**Bottom controls:** dot indicators + 'Next' button + 'Skip' link
**Final slide:** 'Get Started' button → Enter Phone screen

---

### 3. Enter Phone Screen
- 'Welcome to VSolveHub' heading
- Country code picker (+91 India, default)
- 10-digit phone input (numeric keyboard)
- 'Send OTP' button (full-width, accent)
- Terms & Privacy note below button

**Validation:**
- Must be 10 digits starting with 6, 7, 8, or 9
- Real-time validation as user types

---

### 4. OTP Verification Screen
- 'Enter OTP' heading
- Masked phone: '+91 98765 XXXXX'
- 'Change number' link → back to phone entry
- 6-digit OTP input (auto-advance per digit)
- Android: SMS auto-read via SMS Retriever API
- iOS: keyboard suggests OTP from SMS (one-time-code)
- Resend countdown: 60s timer
- Error states: wrong OTP, expired, locked

---

### 5. Home Screen

**Sections:**
1. **Greeting Header** — 'Good afternoon, Priya 👋' + location selector
2. **Search Bar** — 'Search for a service...' (taps → Search screen)
3. **Stats Strip** — 850+ Services | 8 Categories | 30m callback
4. **Category Chips** — Horizontal scroll: Construction, Technician, etc.
5. **Active Booking Banner** — If active booking: ref + status + 'Track' button
6. **Popular Picks** — Horizontal scroll of top services
7. **Browse Categories** — Full 2-col grid of all 8 categories
8. **How It Works** — 3-step section
9. **Testimonials** — Vertical card list (3 reviews)

---

### 6. Services Screen (Tab 2)

- Full listing of all 8 categories in grid
- Tapping category → Category Listing Screen
- Search bar at top

**Category Listing Screen:**
- Category name as header
- Sub-category filter pills (horizontal scroll)
- Service cards list
- Each card: icon, name, price, description snippet, 'Book Now'

**Service Detail Screen:**
- Service name, description, price
- 'Book Now' full-width button
- WhatsApp contact button
- Related services at bottom

---

### 7. Booking Form Screen

- Form fields (same as web app)
- Date picker: native `DateTimePicker` component
- Address: text input + 'Use current location' toggle
- Submit → OTP (new user) or Confirm (returning)

---

### 8. Booking Confirm Screen
- ✅ Lottie animation on success (checkmark)
- Booking ref, service, date
- 'Track Booking' CTA → Track Screen
- 'Book Another' CTA → Home

---

### 9. Track Booking Screen

- Booking ref + status badge
- Vertical step-by-step status timeline
- Current step: pulsing dot animation
- Worker name + skill (post-assignment)
- WhatsApp contact button
- Rating section when status = COMPLETED

---

### 10. My Bookings (Tab 3)

- Tabs: Active | Past
- Booking cards: ref, service name, date, status badge
- Tap → Booking Detail + Track
- Empty state: 'No bookings yet. Book your first service!'

---

### 11. Profile (Tab 4)

- Avatar + Name + Phone (read-only)
- Quick actions: Bookings, Saved, Help
- Menu: Plans, Wallet, Membership, Rating, Addresses, Settings
- Logout

**Saved Services:**
- Grid of saved service cards
- Tap to unsave
- 'Book' CTA on each card

**Settings:**
- Push notifications toggle (booking updates, promotional)
- Language preference (English / Telugu / Hindi — Phase 2)
- Dark mode toggle (Phase 2)

---

## Push Notification Handling

```dart
// Flutter: handle FCM foreground + background messages via firebase_messaging package

// Foreground: show in-app banner
FirebaseMessaging.onMessage.listen((RemoteMessage message) {
  showInAppNotification(
    title: message.notification?.title ?? '',
    body: message.notification?.body ?? '',
    onPress: () => handleNotificationTap(message.data),
  );
});

// Background/Quit: handled by FCM SDK automatically
// Deep link on tap:
messaging().onNotificationOpenedApp(remoteMessage => {
  handleNotificationTap(remoteMessage.data);
});

function handleNotificationTap(data) {
  if (data.booking_ref) {
    navigate('Track', { bookingRef: data.booking_ref });
  }
}
```

**Notification types received:**
| Type | Action on tap |
|------|---------------|
| `BOOKING_CONFIRMED` | Navigate to Track screen |
| `WORKER_ASSIGNED` | Navigate to Track screen |
| `WORKER_ON_THE_WAY` | Navigate to Track screen |
| `JOB_COMPLETED` | Navigate to Track screen + show rating |

---

## State Management

```
Zustand stores:
├── authStore          — session token, phone, isLoggedIn
├── profileStore       — user profile data, addresses
├── bookingStore       — active booking, booking history (cache)
└── serviceStore       — cached category/service data
```

**Offline handling:**
- Last-fetched service categories cached in AsyncStorage
- Booking history cached locally; synced on reconnect
- Forms: show 'No internet' toast; do not submit

---

## Performance Targets

| Metric | Target |
|--------|--------|
| App cold start | < 3 seconds |
| Screen transition | < 300ms |
| Image load (service card) | < 1 second on 4G |
| API response (category list) | < 500ms |
| Push notification delivery | < 5 seconds |
| OTP delivery | < 30 seconds |

---

## App Store Requirements

**Google Play Store:**
- Screenshots: min 2 phone screenshots
- Feature graphic: 1024×500px
- Short description: max 80 chars
- Full description: max 4000 chars
- Content rating: Everyone
- Privacy policy URL required

**Apple App Store:**
- Screenshots: iPhone 6.7" and 5.5" required
- App preview video: optional but recommended
- Privacy nutrition labels: Data types collected (Phone, Name, Device ID)
- Review notes: explain OTP login and worker app separately
