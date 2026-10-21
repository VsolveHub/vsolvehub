"use client";

import { useState } from "react";
import { describeError, useLogout } from "@vsolve/query";
import { Button, ErrorState, Dialog } from "@vsolve/ui";
import {
  ChevronRight,
  FileText,
  MapPin,
  MessageCircle,
  Pencil,
  Smartphone,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useCustomerSession } from "@/features/session/queries";
import { profileName } from "@/features/session/view/profile-mark";
import { getApiClient } from "@/lib/api/browser";

import { useCustomerProfile, useUpdateCustomerProfile } from "../queries";
import { PersonalDetailsForm } from "./personal-details-form";

export function ProfileOverview() {
  const session = useCustomerSession();
  const logout = useLogout(getApiClient());
  const router = useRouter();
  const name = profileName(session) || "Rajesh";
  const userInitial = name.trim().charAt(0).toUpperCase() || "R";
  const [isEditing, setIsEditing] = useState(false);

  const memberSince = session.dateJoined
    ? `V Solve Hub member since ${new Date(session.dateJoined).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}.`
    : "V Solve Hub member since 2 Oct 2025.";

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Dark Navy Profile Hero Card */}
      <section
        aria-labelledby="profile-overview-heading"
        className="overflow-hidden rounded-2xl bg-[#0B162C] p-5 shadow-sm sm:p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {/* White Circular Avatar */}
            <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-white text-3xl font-extrabold text-[#0B162C] shadow-md sm:size-[4.5rem]">
              {userInitial}
            </div>

            {/* Profile Info */}
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#94A3B8] sm:text-[11px]">
                PERSONAL PROFILE
              </p>
              <h2
                id="profile-overview-heading"
                className="mt-0.5 text-2xl font-bold leading-tight text-white sm:text-[1.75rem]"
              >
                {name}
              </h2>
              <p className="mt-1 text-xs text-[#94A3B8] sm:text-sm">
                {memberSince}
              </p>
            </div>
          </div>

          {/* Orange Outline Edit Button */}
          <div className="flex sm:shrink-0">
            <Link
              href="/account/edit"
              onClick={(e) => {
                // If on desktop width, allow opening the quick modal or navigate to /account/edit
                if (window.innerWidth >= 640) {
                  e.preventDefault();
                  setIsEditing(true);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#EA580C] px-4 py-2 text-sm font-bold text-[#EA580C] transition-colors hover:bg-[#EA580C]/10"
            >
              <Pencil className="size-4" strokeWidth={2.2} />
              <span>Edit</span>
            </Link>
          </div>
        </div>
      </section>

      {/* 2. White Menu List Card with the 7 Subpage Buttons */}
      <nav aria-label="Profile actions" className="overflow-hidden rounded-2xl border border-[#F1EFEB] bg-white shadow-xs">
        <div className="divide-y divide-[#F4F2EE]">
          {/* Row 1: Wallet */}
          <MenuItemLink
            href="/account/wallet"
            icon={<Wallet className="size-5 text-[#EA580C]" strokeWidth={2} />}
            title="Wallet"
            subtitle="Transactions & top-ups"
          />

          {/* Row 2: V Coins */}
          <MenuItemLink
            href="/account/coins"
            icon={<VCoinsIcon />}
            title="V Coins"
            subtitle="Earn, redeem & gifting"
          />

          {/* Row 3: Refer & Earn */}
          <MenuItemLink
            href="/account/referrals"
            icon={<Users className="size-5 text-[#EA580C]" strokeWidth={2} />}
            title="Refer & Earn"
            subtitle="Invite friends to earn rewards"
          />

          {/* Row 4: Addresses */}
          <MenuItemLink
            href="/account/addresses"
            icon={<MapPin className="size-5 text-[#EA580C]" strokeWidth={2} />}
            title="Addresses"
            subtitle="View and edit addresses"
          />

          {/* Row 5: Messages */}
          <MenuItemLink
            href="/account/messages"
            icon={<MessageCircle className="size-5 text-[#EA580C]" strokeWidth={2} />}
            title="Messages"
            subtitle="Inbox and updates"
          />

          {/* Row 6: Your documents */}
          <MenuItemLink
            href="/account/documents"
            icon={<FileText className="size-5 text-[#EA580C]" strokeWidth={2} />}
            title="Your documents"
            subtitle="Your verified documents"
          />

          {/* Row 7: Devices */}
          <MenuItemLink
            href="/account/sessions"
            icon={<Smartphone className="size-5 text-[#EA580C]" strokeWidth={2} />}
            title="Devices"
            subtitle="Where you're signed in"
          />
        </div>
      </nav>

      {/* 3. Sign Out Option */}
      <div className="mt-2 flex items-center justify-between rounded-xl bg-white p-4 border border-[#F1EFEB]">
        <div className="flex items-center gap-2 text-xs text-[#64748B]">
          <span className="font-semibold text-navy-900">Signed in as:</span> {session.phoneNumber || session.email}
        </div>
        <Button
          variant="ghost"
          onClick={() =>
            logout.mutate(undefined, {
              onSuccess: () => {
                router.replace("/login");
                router.refresh();
              },
            })
          }
          loading={logout.isPending}
          loadingLabel="Signing out"
          className="text-sm font-semibold text-[#D32F2F] hover:bg-red-50"
        >
          Sign out
        </Button>
      </div>

      {logout.isError ? (
        <ErrorState
          title="We could not sign you out"
          message={describeError(logout.error, "mutation").message}
          inline
        />
      ) : null}

      {/* Quick Edit Dialog for Desktop */}
      <Dialog
        open={isEditing}
        onOpenChange={setIsEditing}
        title="Edit profile"
        description="Update your personal information."
      >
        {isEditing && <ProfileEditDialogBody onClose={() => setIsEditing(false)} />}
      </Dialog>
    </div>
  );
}

function MenuItemLink({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between p-4 transition-colors hover:bg-[#FAF9F7]"
    >
      <div className="flex min-w-0 items-center gap-3.5">
        {/* Soft Peach / Cream Icon Box */}
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF6ED] transition-transform group-hover:scale-105">
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-[15.5px] font-bold text-[#0F172A] group-hover:text-[#EA580C] transition-colors">
            {title}
          </p>
          <p className="mt-0.5 text-[13px] text-[#64748B]">
            {subtitle}
          </p>
        </div>
      </div>

      <ChevronRight className="size-5 text-[#94A3B8] transition-transform group-hover:translate-x-0.5 group-hover:text-navy-900" />
    </Link>
  );
}

function VCoinsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="#EA580C" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={12} cy={12} r={9} />
      <path d="m8.5 8.5 3.5 7 3.5-7" />
    </svg>
  );
}

function ProfileEditDialogBody({ onClose }: { onClose: () => void }) {
  const session = useCustomerSession();
  const profile = useCustomerProfile(session.isAuthenticated);
  const update = useUpdateCustomerProfile();

  if (profile.isPending) {
    return (
      <div className="flex min-h-[160px] items-center justify-center">
        <span className="text-sm text-[#64748B]">Loading your profile details…</span>
      </div>
    );
  }

  if (profile.isError || profile.data === undefined) {
    return (
      <div className="py-4">
        <ErrorState
          title="We could not load your profile"
          message="Your details are still safe. Try loading them again."
          actionLabel="Try again"
          onAction={() => void profile.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="py-2">
      <PersonalDetailsForm
        key={`${profile.data.full_name}:${profile.data.display_name}:${profile.data.email}`}
        profile={profile.data}
        onSave={(input) =>
          update.mutate(input, {
            onSuccess: () => {
              onClose();
            },
          })
        }
        isSaving={update.isPending}
        error={update.error}
      />
    </div>
  );
}
