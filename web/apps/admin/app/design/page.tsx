import type { Metadata } from "next";

import { DesignSystemGallery } from "./gallery";

/**
 * Internal design-system reference.
 *
 * Lives in the Operations app because it is internal documentation, and sits
 * outside the `(dashboard)` group so it renders without the sidebar or any
 * Supabase data dependency. `middleware.ts` still gates it — only `/login`,
 * `/auth/callback` and `/access-denied` are public — and the root layout marks
 * the whole app `noindex`.
 *
 * This is the "or equivalent isolated component documentation" option in B1.
 * Storybook was considered and deferred: it brings its own builder, config
 * surface and a large dependency tree, and Milestone 1 has no Vite (plan 09 §1).
 * A route in an app that already exists costs nothing, renders with the real
 * token pipeline rather than a parallel one, and doubles as the target for
 * visual-regression snapshots once Playwright is set up in B11.
 */
export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

export default function DesignSystemPage() {
  return <DesignSystemGallery />;
}
