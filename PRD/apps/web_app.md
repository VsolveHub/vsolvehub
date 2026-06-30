# VSolveHub — App Specifications: Web App

> **Version:** 1.0 | **Last Updated:** June 2026  
> Next.js 15 (App Router) + TypeScript + Vanilla CSS

---

## Pages & Routes

| Route | Rendering | Description |
|-------|----------|-------------|
| `/` | ISR (1hr) | Home — category grid, popular picks, testimonials, stats |
| `/services` | SSG | Services hub — all categories overview |
| `/services/[cat]` | ISR (1hr) | Category listing — sub-categories + service cards |
| `/services/[cat]/[slug]` | SSR | Service detail + booking form (legacy `/[id]` 301-redirects — see `conventions.md` D-09) |
| `/booking/otp` | CSR | OTP verification for new users |
| `/booking/confirm` | CSR | Booking confirmation + reference |
| `/booking/track` | CSR | Status timeline tracker |
| `/profile` | CSR | Customer profile (auth-gated) |
| `/profile/bookings` | CSR | Booking history |
| `/profile/saved` | CSR | Saved/wishlist services |
| `/profile/addresses` | CSR | Address book |
| `/profile/settings` | CSR | Notification preferences |
| `/about` | SSG | Company story, vision, team |
| `/contact` | SSG | Enquiry form, contact info, maps embed |
| `/gallery` | SSG | Photo gallery with category filters |
| `/faq` | SSG | Searchable accordion FAQ |

---

## Screen Specifications

### 1. Home Page (`/`)

**Header:**
- VSolveHub logo (left)
- Location pill (center or right): shows selected city
- Cart/Saved icon (right)

**Sections (top to bottom):**
1. **Greeting + Search** — Time-based greeting ("Good afternoon"), search bar
2. **Stats Strip** — `850+ Services | 8 Categories | 30m Callback`
3. **Category Chips** — Horizontal scrollable: Construction, Technician, Manpower…
4. **Popular Picks** — Horizontal scroll of most-booked services across all categories
5. **Ongoing Booking Card** — If active booking exists: shows booking ref + current status
6. **Top Professionals** — Featured/top-rated workers (cards with rating)
7. **Browse All Categories** — Full category grid (2 cols mobile, 4 cols desktop)
8. **How It Works** — 3-step illustrated section
9. **Testimonials** — Customer review carousel
10. **Trust Strip** — Verified workers • Fast response • WhatsApp support

**Metadata:**
```tsx
export const metadata = {
  title: 'VSolveHub — All Services at Your Doorstep | Hyderabad, Telangana',
  description: 'Book trusted electricians, plumbers, maids, event services, and 850+ more doorstep services in Warangal, Karimnagar, Khammam. Fast, verified, affordable.',
  openGraph: { ... }
}
```

---

### 2. Category Listing Page (`/services/[cat]`)

**Header:**
- Back arrow + Category name
- Category hero section: full-width color band with category emoji, name, tagline

**Body:**
- Sub-category filter pills (horizontal scroll, sticky below header)
- Active filter pill: filled black, white text
- Service cards grid: 1 col (mobile), 2 col (tablet), 3 col (desktop)
- Each service card:
  - Icon/emoji (top-left)
  - Service name (bold)
  - Sub-category tag (pill, accent color)
  - Price range (e.g. `₹500–₹800/day`)
  - Short description (2 lines max, truncated)
  - 'Book Now' CTA button
  - Heart/bookmark icon (top-right)

**Empty State:**
- 'No services in this category right now'
- WhatsApp button: 'Request a custom service'

**SEO:**
- `<h1>` = Category name (e.g. "Technician Services in Hyderabad")
- BreadcrumbList JSON-LD: Home > Services > Technician
- `<meta description>` = Category tagline + city

---

### 3. Service Detail Page (`/services/[cat]/[id]`)

**Layout:**
- Breadcrumb: Home > Category > Sub-category > Service Name
- Service name as `<h1>`
- Price range + unit (prominent)
- Description (full, no truncation)
- Sub-category tag + Category tag

**Booking Form (below or side-by-side on desktop):**
- Full Name *
- Phone Number * (10-digit, with +91 prefix display)
- Service (pre-filled, locked)
- Preferred Date * (date picker, future only)
- Time Slot (optional: Morning 8–12 / Afternoon 12–5 / Evening 5–8)
- Address * (text area + optional Places Autocomplete)
- Notes (optional, 200 chars)
- reCAPTCHA v3 (invisible)
- Submit button: 'Request Service' (full-width on mobile, min-height 52px)

**WhatsApp CTA:**
- Sticky bottom bar on mobile: 'Have questions? WhatsApp us'
- Inline button on desktop: 'Chat on WhatsApp'

**Related Services:**
- 3–4 cards from same sub-category

---

### 4. Booking OTP Screen (`/booking/otp`)

**Layout:**
- Back arrow
- 'Verify your number' heading
- Masked phone display: `+91 98765 XXXXX`
- 'Change number' link → back to form

**OTP Input:**
- 6 individual digit boxes (auto-advance, auto-submit on 6th)
- Keyboard: numeric
- Auto-read from SMS (Android: SMS Retriever hint)

**Timer:**
- 'Resend OTP in 00:54' countdown
- Resend button: disabled with countdown; enabled after 60s

**Error States:**
- Wrong OTP: 'Incorrect OTP. 2 attempts remaining.'
- OTP expired: 'OTP expired. Tap to resend.'
- Locked: 'Too many attempts. Try again in 09:32.'

---

### 5. Booking Confirm Screen (`/booking/confirm`)

**Content:**
- ✅ Green checkmark animation (CSS)
- 'Booking Received!'
- Booking Ref: `VSH-0042` (large, copyable text)
- Service name, scheduled date, status: Pending
- 'You'll receive a WhatsApp confirmation shortly'
- CTAs:
  - 'Track your booking' → `/booking/track?ref=VSH-0042`
  - 'Book another service' → `/services`

---

### 6. Booking Track Screen (`/booking/track`)

**Layout:**
- Booking ref prominently shown
- Status: current status badge
- Vertical timeline:
  - ✅ Pending (with timestamp)
  - ✅ Confirmed
  - 🔵 [Current step]
  - ⭕ [Future steps]
- Worker info (if assigned): name + skill (not full contact details)
- WhatsApp contact button
- If COMPLETED: rating section (1-5 stars + comment)

---

### 7. Profile Pages (`/profile/*`)

**Profile Home:**
- User avatar + name + phone
- Quick actions: My Bookings, Saved Services, Help & Support
- Menu: Plans, Wallet, Membership, Rating, Addresses, Payments, Settings, About
- Logout button

**My Bookings:**
- List of all bookings (reverse chronological)
- Booking card: ref, service name, date, status badge
- Tap → full booking detail + track

**Saved Services:**
- Grid of saved service cards
- Unsave (heart toggle)
- Empty state: 'No saved services yet. Heart a service to save it.'

**Manage Addresses:**
- List of saved addresses with default badge
- Add / Edit / Delete / Set Default
- Address form: label, line 1, line 2, city, state, pincode

---

### 8. About Page (`/about`)

**Sections:**
- Company story + founding year
- Vision and mission statements
- Service count stats: 850+ services, 8 categories, Tier 2/3 cities
- Team photos + bios
- 'Join as a Worker' CTA

---

### 9. Contact Page (`/contact`)

**Sections:**
- Phone numbers (primary + secondary, click-to-call)
- Email (click-to-email)
- WhatsApp quick-connect button
- Enquiry form: Name, Phone, Email (optional), Message, reCAPTCHA, Submit
- Google Maps embed
- Social media links: Instagram, Facebook, WhatsApp

---

### 10. Gallery Page (`/gallery`)

**Layout:**
- Category filter pills
- Masonry grid (CSS columns: 2 mobile, 3 tablet, 4 desktop)
- Lazy loading with skeleton placeholders
- Lightbox on tap: full-screen with swipe/arrow navigation
- Image count badge per category

---

### 11. FAQ Page (`/faq`)

**Layout:**
- Search input (filters questions in real-time)
- Topic sections: Booking, Payment, Worker, Cancellation, Technical
- Accordion questions: expand/collapse with smooth animation
- 'Didn't find your answer? WhatsApp us' CTA at bottom
- Schema.org FAQPage JSON-LD (for Google rich results)

---

## Shared Layout Components

### Site Header (Desktop)
- Logo + Nav links: Services, About, Contact, FAQ, Gallery
- 'Book a Service' CTA button (accent)
- Phone number display

### Mobile Bottom Nav
- 4 tabs: Home (🏠), Services (📋), Bookings (📅), Profile (👤)
- Active tab: filled icon + accent color
- Fixed at bottom: 64px height
- Shows booking count badge on Bookings tab if active booking exists

### WhatsApp FAB
- Fixed: bottom-right, z-index: 1000
- 56×56px circle, green background (#25D366), WhatsApp icon
- On mobile: above bottom nav (translate-y: -64px)
- Tooltip on hover (desktop): 'Chat on WhatsApp'

### Site Footer
- Logo + tagline
- Links: Services, About, Contact, FAQ, Privacy Policy
- Social media icons
- Address + phone
- Copyright

---

## Progressive Web App (PWA) Config

```json
// public/manifest.json
{
  "name": "VSolveHub",
  "short_name": "QSH",
  "description": "All services at your doorstep",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FFF1F0",
  "theme_color": "#FD4C4A",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Service Worker:** Offline fallback page only (no caching of dynamic content).
