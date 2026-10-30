import type { ReactNode } from "react";

import { CustomerShell } from "@/features/session/view/customer-shell";

/**
 * The session gate for `/jobs/**`: the same engagement screens as `/engagements/**` under the
 * older address, so the same gate. Without it a signed-out visitor saw the screen fail with
 * an authentication error instead of being sent to sign in and back.
 */
export default function JobsLayout({ children }: { children: ReactNode }) {
  return <CustomerShell>{children}</CustomerShell>;
}
