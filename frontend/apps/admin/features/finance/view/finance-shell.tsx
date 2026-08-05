"use client";

import type { ReactNode } from "react";

import { WorkspaceShell, type Workspace } from "@/features/session/workspace-shell";

/**
 * The signed-in Finance shell.
 *
 * A separate role from Operations, and Django treats it as one:
 * `HasRecentFinanceStepUp` requires `active_role.code == "finance"`, so somebody
 * holding both grants and acting as Operations is refused by every refund
 * endpoint. Rendering Finance inside the Operations shell would put the console
 * one role-switch away from working, with no screen saying so.
 */

const FINANCE_ROLE = "finance";

const WORKSPACES: readonly Workspace[] = [{ href: "/finance", label: "Refunds" }];

export function FinanceShell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceShell
      role={FINANCE_ROLE}
      name="Finance"
      signInDescription="Finance sign-in. Use the mobile number your access was granted to."
      workspaces={WORKSPACES}
    >
      {children}
    </WorkspaceShell>
  );
}
