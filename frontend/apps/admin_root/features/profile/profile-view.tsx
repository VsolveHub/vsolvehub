"use client";

import { useCurrentSession, useLogout, useSwitchRole } from "@vsolve/query";
import { Badge, Button, Card, ErrorState, Spinner } from "@vsolve/ui";
import { ShieldCheck, UserCheck, Phone, KeyRound, ArrowRightLeft, LogOut, CheckCircle2 } from "lucide-react";

import { getApiClient } from "@/lib/api/browser";

export function ProfileView() {
  const apiClient = getApiClient();
  const sessionQuery = useCurrentSession(apiClient);
  const switchRole = useSwitchRole(apiClient);
  const logout = useLogout(apiClient);

  if (sessionQuery.isPending) {
    return (
      <div className="flex items-center justify-center py-16 text-text-secondary gap-2">
        <Spinner size="sm" />
        Loading profile details…
      </div>
    );
  }

  if (sessionQuery.isError || !sessionQuery.data?.user) {
    return (
      <div className="max-w-md mx-auto py-8">
        <ErrorState
          title="Could not load operator profile"
          message="We were unable to retrieve your current session information."
          actionLabel="Retry"
          onAction={() => sessionQuery.refetch()}
        />
      </div>
    );
  }

  const user = sessionQuery.data.user;
  const activeRole = sessionQuery.data.active_role ?? "operations";
  const grantedRoles = user.roles ?? ["operations"];
  const otherRoles = grantedRoles.filter((r) => r !== activeRole);

  const displayName = user.phone_number === "9999999999" || !user.phone_number
    ? "Priya Nair"
    : `Staff ${user.phone_number}`;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Profile Banner */}
      <Card className="p-6 bg-surface border border-line rounded-card shadow-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-selected-surface flex items-center justify-center text-text-link font-bold text-xl border border-[#b0c2e8]">
            {displayName.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-text">{displayName}</h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#e8f6ed] text-[#0e7c3a] border border-[#a8ddbc]">
                <CheckCircle2 className="h-3 w-3" />
                Active Staff
              </span>
            </div>
            <p className="text-sm text-text-secondary mt-0.5">
              Operations Staff Console • Logged in via Mobile OTP
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => logout.mutate()}
          loading={logout.isPending}
          loadingLabel="Signing out"
          className="text-text-secondary hover:text-text shrink-0"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>
      </Card>

      {/* Main Grid: Details & Security */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Account & Role Grants Card */}
        <Card className="p-6 bg-surface border border-line rounded-card shadow-card space-y-5">
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <UserCheck className="h-5 w-5 text-text-link" />
            <h2 className="text-base font-bold text-text">Operator Identity & Grants</h2>
          </div>

          <div className="space-y-4 text-sm">
            <div>
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block">
                Registered Mobile Number
              </span>
              <div className="mt-1 flex items-center gap-2 text-text font-medium">
                <Phone className="h-4 w-4 text-text-muted" />
                <span>{user.phone_number || "Not provided"}</span>
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block">
                Current Active Session Role
              </span>
              <div className="mt-1.5 flex items-center gap-2">
                <Badge tone="info" className="capitalize font-bold">
                  {activeRole}
                </Badge>
                <span className="text-xs text-text-secondary">
                  (Selected in Django Session)
                </span>
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block">
                All Assigned System Roles
              </span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {grantedRoles.map((role) => (
                  <span
                    key={role}
                    className={[
                      "px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize",
                      role === activeRole
                        ? "bg-selected-surface text-text-link border-[#b0c2e8] font-bold"
                        : "bg-surface-sunken text-text-secondary border-line",
                    ].join(" ")}
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>

            {otherRoles.length > 0 && (
              <div className="pt-3 border-t border-line">
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block mb-2">
                  Switch Active Role
                </span>
                <div className="flex flex-wrap gap-2">
                  {otherRoles.map((role) => (
                    <Button
                      key={role}
                      size="sm"
                      variant="outline"
                      onClick={() => switchRole.mutate(role)}
                      loading={switchRole.isPending}
                      loadingLabel="Switching"
                      className="text-xs capitalize"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
                      Switch to {role}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Security & Session Information Card */}
        <Card className="p-6 bg-surface border border-line rounded-card shadow-card space-y-5">
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <ShieldCheck className="h-5 w-5 text-text-link" />
            <h2 className="text-base font-bold text-text">Security & Authentication</h2>
          </div>

          <div className="space-y-4 text-sm">
            <div>
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block">
                Authentication Method
              </span>
              <div className="mt-1 flex items-center gap-2 text-text font-medium">
                <KeyRound className="h-4 w-4 text-text-muted" />
                <span>Passwordless Mobile OTP (SMS)</span>
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block">
                Step-Up Verification Status
              </span>
              <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                Step-up OTP verification is enforced for high-privilege operations such as Payout runs and Finance refund approvals.
              </p>
            </div>

            <div>
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block">
                System Boundary & Authorization
              </span>
              <div className="mt-1.5 p-3 rounded-md bg-surface-sunken border border-line text-xs text-text-secondary space-y-1">
                <div className="font-semibold text-text">Django DRF Business Monolith</div>
                <div>Session authorization enforced by server-side projections on every endpoint request.</div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
