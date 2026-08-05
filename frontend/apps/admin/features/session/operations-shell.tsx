"use client";

import type { ReactNode } from "react";

import { WorkspaceShell, type Workspace } from "./workspace-shell";

/**
 * The signed-in Operations shell.
 *
 * All of the authorization branching lives in `WorkspaceShell`, which Finance
 * also uses. What is Operations-specific is the role code, the product name and
 * the list of workspaces — and that is all this file holds. Keeping a second
 * copy of the guard here is how "switch your role" and "you do not have access"
 * eventually stop agreeing between two consoles that ask Django the same
 * question.
 */

const OPERATIONS_ROLE = "operations";

const WORKSPACES: readonly Workspace[] = [
  { href: "/reviews", label: "Partner applications" },
  { href: "/operations/compatibility-rules", label: "Compatibility rules" },
  { href: "/operations/dispatch", label: "Dispatch recovery" },
  { href: "/operations/manual-offers", label: "Offer work" },
  { href: "/operations/assisted-checkouts", label: "Assisted checkout" },
  { href: "/operations/partner-availability", label: "Partner availability" },
];

export function OperationsShell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceShell
      role={OPERATIONS_ROLE}
      name="Operations"
      signInDescription="Staff sign-in. Use the mobile number your access was granted to."
      workspaces={WORKSPACES}
    >
      {children}
    </WorkspaceShell>
  );
}
