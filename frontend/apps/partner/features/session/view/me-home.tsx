"use client";

import { hasWorkspaceAction, useLogout } from "@vsolve/query";
import { Button } from "@vsolve/ui";
import { Globe, Phone, Power, ShieldCheck, User, Users, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { PartnerPresence } from "@/features/presence/view/partner-presence";
import { usePartnerProfile } from "@/features/profile/queries";
import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";
import { WORKFORCE_WORKSPACE } from "@/features/workspace/registry";
import { getApiClient } from "@/lib/api/browser";

export function MeHome() {
  const logout = useLogout(getApiClient());
  const grants = usePartnerWorkspaceGrants();
  const canManageCrew = hasWorkspaceAction(grants.grants ?? [], WORKFORCE_WORKSPACE, "crew.manage");

  return (
    <main className="flex min-h-[calc(100dvh-9rem)] flex-col bg-canvas pb-8">
      <h1 className="sr-only">Partner Account & Settings</h1>

      {/* Clean Professional Profile Card */}
      <IdentityCard />

      {/* Live Availability Toggle Card */}
      <div className="px-4 pt-3">
        <PartnerPresence />
      </div>

      {/* Settings & Navigation Sections */}
      <div className="flex flex-1 flex-col px-4 pt-4 gap-4">
        {/* Account & Profile Section */}
        <section className="flex flex-col gap-1.5">
          <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-text-muted">
            Account & Profile
          </p>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs divide-y divide-line/60">
            <SettingsRow
              href="/me/profile"
              icon={User}
              title="Personal Profile"
              subtitle="Contact details, craft & KYC documents"
              actionLabel="View"
            />
            <SettingsRow
              href="/me/language"
              icon={Globe}
              title="App Language"
              subtitle="English (India)"
              actionLabel="Change"
            />
          </div>
        </section>

        {/* Work & Financials Section */}
        <section className="flex flex-col gap-1.5">
          <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-text-muted">
            Work & Financials
          </p>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs divide-y divide-line/60">
            <SettingsRow
              href="/money"
              icon={Wallet}
              title="Money & Earnings"
              subtitle="Daily earnings, passbook & settlements"
              actionLabel="Open"
            />
            {canManageCrew ? (
              <SettingsRow
                href="/me/crew"
                icon={Users}
                title="Contractor Crew"
                subtitle="Manage team roster & crew dispatch"
                actionLabel="Manage"
              />
            ) : null}
          </div>
        </section>

        {/* Help & Support Section */}
        <section className="flex flex-col gap-1.5">
          <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-text-muted">
            Support & Safety
          </p>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
            <a
              href="tel:+918008765832"
              className="flex items-center justify-between p-3.5 transition-colors hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-sunken text-navy-900 border border-line">
                  <Phone className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy-900 leading-tight">24/7 Partner Helpline</p>
                  <p className="text-xs text-text-secondary mt-0.5">+91 (800) 876-5832 • Dedicated Assistance</p>
                </div>
              </div>
              <span className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1 text-xs font-semibold text-navy-900 shadow-xs">
                Call
              </span>
            </a>
          </div>
        </section>

        {/* Sign Out Action */}
        <div className="pt-2">
          <Button
            variant="outline"
            block
            size="lg"
            icon={<Power className="h-4 w-4 text-red-600" />}
            onClick={() => logout.mutate()}
            loading={logout.isPending}
            loadingLabel="Signing out"
            className="border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300 font-semibold"
          >
            Sign Out
          </Button>
        </div>
      </div>
    </main>
  );
}

/**
 * Clean, executive partner identity card with authentic dynamic state.
 */
function IdentityCard() {
  const profile = usePartnerProfile();
  const trade = profile.data?.skills[0] ?? null;
  const displayName = profile.data?.display_name ?? "Partner";
  const initial = displayName.charAt(0).toUpperCase() || "P";

  return (
    <div className="mx-4 mt-3 rounded-2xl border border-line bg-surface p-4 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          {/* Subtle clean avatar */}
          <div className="relative shrink-0">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-navy-900 text-base font-bold text-white shadow-xs">
              {initial}
            </div>
            <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-surface bg-emerald-500" />
          </div>

          {/* Name & Details */}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold text-navy-900 leading-tight">
              {displayName}
            </h2>
            <p className="truncate text-xs text-text-secondary mt-0.5">
              {profile.data?.phone_number ?? "—"}
            </p>
            {trade ? (
              <span className="inline-block mt-1.5 rounded-md border border-line bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-navy-800">
                {trade}
              </span>
            ) : null}
          </div>
        </div>

        {/* Status Pill */}
        <div className="shrink-0 self-start">
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
            <ShieldCheck className="h-3 w-3 text-emerald-600" /> Verified
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Standard settings list row without chevron arrows.
 */
function SettingsRow({
  href,
  icon: Icon,
  title,
  subtitle,
  actionLabel,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actionLabel: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between p-3.5 transition-colors hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-sunken text-navy-900 border border-line">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy-900 leading-tight">{title}</p>
          {/*
            `line-clamp-2`, not `truncate`. Every subtitle here names what the
            row actually contains — "Contact details, craft & KYC documents" —
            and at 375px a single line cuts each one mid-noun, which is where
            the useful half lives. Two lines fit all of them on a phone and the
            clamp still bounds the row.
          */}
          <p className="text-xs text-text-secondary line-clamp-2 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <span className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1 text-xs font-semibold text-navy-900 shadow-xs">
        {actionLabel}
      </span>
    </Link>
  );
}
