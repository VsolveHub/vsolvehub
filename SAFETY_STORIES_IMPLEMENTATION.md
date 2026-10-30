# Safety Stories Feature Implementation

## 1. Overview
The **Safety Stories** feature is an Instagram-style, short-lived media awareness feature implemented across the VSolve Hub platform. It allows the Operations/Admin team to publish authentic photos and short videos highlighting safety standards, ID verifications, hygiene practices, and technician qualifications. Published stories are visible to every customer on the user portal homepage for **exactly 24 hours** from publication, after which they automatically expire and stop appearing.

Currently configured with **2 live, high-resolution stories published from admin**:
1. **ID-Verified Experts** (Order 0, ID & background verification)
2. **Sterilized Toolkits** (Order 1, Hospital-grade disinfection)

---

## 2. Architecture & Design Principles

- **VSolve Hub Site Aesthetics Alignment:**
  - Styled strictly in accordance with VSolve Hub design tokens: Signal Orange (`#f87000`), Navy 900 (`#00112e`), Navy 950 (`#000817`), and warm neutral surfaces (`#fdf3ec`, `#faf8f5`).
  - Replaced generic black backdrops with VSolve's dark navy atmospheric lighting and warm gradient overlays.
  - On-brand story rings: VSolve Signal Orange to Deep Navy gradient ring for unviewed stories; warm muted border for viewed stories.
  - Signature trust badge: ID-verified pro pill (`bg-[#fdf3ec] text-[#a94900] border border-[#f87000]/30`) with shield checkmark.
  - Full-bleed mobile viewport experience: fills 100% of the mobile screen cleanly (`fixed inset-0 h-full w-full`) with zero double scrollbars, and locks body scrolling while active.
  - Branded fallback artwork: If any media fails or is loading, a stylized VSolve Safety poster renders rather than a blank black void.
- **Zero Coupling to Core Transacting Models:** Safety Stories are purely marketing/awareness content. No changes were made to bookings, payments, carts, wallets, or dispatch workflows.
- **Strict 24-Hour Expiration Rule:** The 24-hour lifetime (`expires_at = published_at + 24 hours`) is computed on creation and preserved. Editing a caption, title, or display order will **never** reset or extend the expiration deadline.
- **Defense-in-Depth Validation:** Media files undergo both MIME type verification and binary magic bytes inspection to ensure malicious or spoofed files cannot be uploaded.
- **Viewed State Persistence:** Client-side `localStorage` tracks viewed stories under `vsolve_viewed_stories`.

---

## 3. Files Created and Modified

### Backend (Django & DRF)
- `backend/apps/stories/models.py`:
  - `SafetyStory` model with fields (`id`, `title`, `caption`, `media_type`, `stored_file`, `original_name`, `content_type`, `size_bytes`, `display_order`, `is_published`, `created_by`, `published_at`, `expires_at`, `created_at`, `updated_at`).
  - Storage helper `safety_story_upload_to` saving to `safety-stories/{uuid}{ext}`.
  - Automatic `stored_file` deletion on story deletion.
- `backend/apps/stories/apps.py`: App configuration for `apps.stories`.
- `backend/apps/stories/migrations/0001_initial.py`: Database migration for `SafetyStory` table and index on `["is_published", "expires_at"]`.
- `backend/apps/stories/validation.py`: Binary magic bytes detection and size limits validation (Image $\le 15$ MB, Video $\le 100$ MB).
- `backend/apps/stories/serializers.py`:
  - `PublicSafetyStorySerializer`
  - `OpsSafetyStorySerializer`
  - `OpsSafetyStoryCreateSerializer`
  - `OpsSafetyStoryUpdateSerializer`
- `backend/apps/stories/permissions.py`:
  - `IsStoryAdminUser`: Ensures user is authenticated and holds operations role or staff/superuser privileges, with security audit logging via `record_access_event`.
- `backend/apps/stories/views.py`:
  - `PublicSafetyStoryListView`: Open public endpoint returning only active unexpired stories.
  - `OpsSafetyStoryListCreateView`: Admin endpoint for listing/filtering and multipart media uploads.
  - `OpsSafetyStoryDetailView`: Admin endpoint for retrieval, metadata updates, and deletion.
- `backend/apps/stories/urls.py`: URL patterns for stories APIs.
- `backend/apps/stories/admin.py`: Django standard admin registration for `SafetyStory`.
- `backend/apps/stories/management/commands/seed_safety_stories.py`: Idempotent seeder managing exactly 2 live admin safety stories with authentic photography from `images/`.
- `backend/config/settings/base.py`: Registered `"apps.stories"` in `INSTALLED_APPS`.
- `backend/config/urls.py`: Included `apps.stories.urls` under `/api/v1/`.
- `backend/tests/stories/test_safety_stories.py`: Automated tests for permissions, filtering, uploads, validation, updates, and deletion.

### Contracts & API Client
- `contracts/openapi/v1.yaml`: Updated via drf-spectacular to expose `/api/v1/safety-stories/` and `/api/v1/ops/stories/`.
- `frontend/packages/api-client/src/generated/schema.d.ts`: Regenerated TypeScript definitions for `PublicSafetyStory` and `OpsSafetyStory`.

### Customer Portal (`frontend/apps/customer`)
- `frontend/apps/customer/features/stories/queries.ts`: Server-side cached query with resilient error fallback (`getActiveSafetyStories`).
- `frontend/apps/customer/features/stories/view/safety-story-viewer.tsx`:
  - Full-bleed mobile viewport modal with body scroll lock.
  - VSolve Navy & Orange brand aesthetic.
  - Segmented progress bars with `#f87000` active indicator.
  - Auto-advancement timer (5s for images, synced to video duration for videos).
  - Left tap / right tap navigation.
  - Press-and-hold to pause.
  - Play/pause toggle button, mute/unmute audio toggle button.
  - Keyboard navigation (Left Arrow, Right Arrow, Space, Escape).
  - VSolve verified pro pill and expiration tag.
  - Branded fallback artwork for missing/loading media.
- `frontend/apps/customer/features/stories/view/safety-stories-tray.tsx`:
  - Horizontal scrolling story thumbnail tray.
  - VSolve brand gradient rings for unviewed stories vs. muted rings for viewed stories.
  - Client-side countdown expiration filter.
  - `localStorage` persistence under key `vsolve_viewed_stories`.
- `frontend/apps/customer/app/page.tsx`: Integrated `SafetyStoriesTray` into both Desktop and Mobile homepage layouts.
- `frontend/apps/customer/features/stories/view/safety-stories.test.tsx`: Vitest component tests.

### Admin Portal (`frontend/apps/admin`)
- `frontend/apps/admin/features/session/nav-groups.ts`: Added navigation link `{ href: "/operations/stories", label: "Safety stories", icon: ShieldCheck }`.
- `frontend/apps/admin/features/stories/queries.ts`: React Query hooks (`useOpsStories`, `useCreateOpsStory`, `useUpdateOpsStory`, `useDeleteOpsStory`).
- `frontend/apps/admin/features/stories/view/stories-workspace.tsx`:
  - Key metrics cards (Total Stories, Live, Expired, Drafts).
  - Filter tabs ("All", "Active", "Expired", "Drafts").
  - Story cards with media thumbnail, countdown badge, file size, and quick actions.
  - Delete with safety confirmation.
- `frontend/apps/admin/features/stories/view/upload-story-dialog.tsx`:
  - Drag-and-drop file picker with instant client-side format & size validation.
  - Live media preview for images and videos before uploading.
  - Title, caption, display order, and publish toggle.
- `frontend/apps/admin/features/stories/view/edit-story-dialog.tsx`:
  - Title, caption, order, and publish status editor.
  - Explanatory banner confirming that 24h expiration deadline is preserved.
- `frontend/apps/admin/features/stories/view/story-preview-modal.tsx`:
  - In-browser simulated phone preview for operators.
- `frontend/apps/admin/app/(operations)/operations/stories/page.tsx`: Admin page route.
- `frontend/apps/admin/features/stories/view/stories-workspace.test.tsx`: Vitest tests for admin dashboard.

---

## 4. Current Database State (Active Stories)

| # | Title | Media | Size | Status | Author |
|---|---|---|---|---|---|
| 1 | **ID-Verified Experts** | Photo (JPEG) | 136.5 KB | Active (expires in 23h) | Operations Admin |
| 2 | **Sterilized Toolkits** | Photo (JPEG) | 141.8 KB | Active (expires in 22h) | Operations Admin |

---

## 5. Verification Results

- **Backend Pytest (`tests/stories/test_safety_stories.py`):** 8 passed in 1.17s.
- **Frontend Vitest (`apps/customer/features/stories/` & `apps/admin/features/stories/`):** 9 passed in 1.42s.
- **TypeScript Typecheck (`pnpm --filter customer exec tsc` & `admin`):** 0 errors, exit code 0.
- **Live Public Endpoint (`/api/v1/safety-stories/`):** Returns 2 active stories with valid media URLs.
- **Live Operations Endpoint (`/api/v1/ops/stories/`):** Returns 2 active stories with complete metadata.
