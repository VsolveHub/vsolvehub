"use client";

import type { Schemas } from "@vsolve/api-client";
import { useCurrentSession, useLogout } from "@vsolve/query";
import { ConfirmAction, Sheet, buttonStyles, useT } from "@vsolve/ui";
import {
  Bell,
  ChevronRight,
  ClipboardList,
  HelpCircle,
  LogOut,
  Mail,
  MessageCircle,
  Phone,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { getApiClient } from "@/lib/api/browser";
import { PushOptInCard } from "@/features/notifications/view/partner-push-preferences";
import {
  isPrivacyRequestOpen,
  usePrivacyRequests,
  useRequestAccountDeletion,
} from "@/features/profile/queries";
import {
  PARTNER_SUPPORT_EMAIL,
  PARTNER_SUPPORT_HOURS_KEY,
  PARTNER_SUPPORT_PHONE,
  PARTNER_SUPPORT_PHONE_DISPLAY,
} from "@/features/support/contact";

type Application = Schemas["PartnerApplication"];

export function AccountButton({
  application,
  onOpenHelp,
}: {
  application: Application | null;
  onOpenHelp: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const session = useCurrentSession(getApiClient());
  const logout = useLogout(getApiClient());
  const requests = usePrivacyRequests();
  const removeDeletion = useRequestAccountDeletion();

  const user = session.data?.user ?? null;
  const name = (application?.display_name || user?.full_name || "").trim();
  const initial = (name[0] || user?.phone_number?.[0] || "R").toUpperCase();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on Escape key press
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (user === null) return null;

  const openDeletionRequest = (requests.data ?? []).find(
    (item) => item.kind === "ERASURE" && isPrivacyRequestOpen(item),
  );

  return (
    <>
      {/* Header Avatar Button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("apply.account.open")}
        className="grid h-10 w-10 sm:h-11 sm:w-11 place-items-center rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <span className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-full bg-navy-900 text-[11px] sm:text-xs font-bold text-surface">
          {initial}
        </span>
      </button>

      {/* Profile Menu Bottom Sheet Popup matching Mobile Expo Portal */}
      {mounted && open
        ? createPortal(
            <div className="fixed inset-0 z-50 flex flex-col justify-end">
              {/* Dim Backdrop */}
              <div
                className="fixed inset-0 bg-[#00112e]/45 backdrop-blur-[2px] transition-opacity"
                onClick={() => setOpen(false)}
                aria-hidden="true"
              />

              {/* Bottom Sheet Card */}
              <div
                role="dialog"
                aria-modal="true"
                aria-label={t("apply.account.title")}
                className="relative z-10 mx-auto w-full max-w-lg rounded-t-[28px] bg-white px-6 pt-3 pb-8 shadow-[0_-8px_30px_rgba(0,17,46,0.15)] animate-in slide-in-from-bottom duration-200"
              >
                {/* Grabber Handle */}
                <div className="mx-auto mb-5 h-1.5 w-11 rounded-full bg-[#d1d5db]" />

                {/* Header Row: Large Avatar + Name & Phone */}
                <div className="flex items-center gap-4 pb-4">
                  <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#fed7aa] bg-[#ffe9d6]">
                    <span className="text-[22px] font-extrabold text-[#f26a0f]">
                      {initial}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <p className="truncate text-lg font-extrabold text-[#0b1b3a]">
                      {name || "Your account"}
                    </p>
                    {user.phone_number ? (
                      <p className="text-sm text-[#6b7280]">{user.phone_number}</p>
                    ) : null}
                  </div>
                </div>

                {/* Hairline Divider */}
                <div className="mb-1 h-px bg-[#f1f5f9]" />

                {/* Menu Items List */}
                <div className="flex flex-col">
                  {/* 1. Profile */}
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      // `/me/profile` needs an approved Partner; an applicant gets the preview.
                      router.push("/apply/profile");
                    }}
                    className="flex w-full items-center justify-between py-3.5 px-1 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5">
                      <User size={20} className="text-[#0b1b3a]" strokeWidth={2} />
                      <span className="text-base font-semibold text-[#0b1b3a]">Profile</span>
                    </div>
                    <ChevronRight size={18} className="text-[#94a3b8]" />
                  </button>
                  <div className="h-px bg-[#f8fafc]" />

                  {/* 2. Application status */}
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      router.push("/apply");
                    }}
                    className="flex w-full items-center justify-between py-3.5 px-1 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5">
                      <ClipboardList size={20} className="text-[#0b1b3a]" strokeWidth={2} />
                      <span className="text-base font-semibold text-[#0b1b3a]">Application status</span>
                    </div>
                    <ChevronRight size={18} className="text-[#94a3b8]" />
                  </button>
                  <div className="h-px bg-[#f8fafc]" />

                  {/* 3. Notifications */}
                  <button
                    type="button"
                    onClick={() => {
                      setNotificationsOpen(true);
                    }}
                    className="flex w-full items-center justify-between py-3.5 px-1 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5">
                      <Bell size={20} className="text-[#0b1b3a]" strokeWidth={2} />
                      <span className="text-base font-semibold text-[#0b1b3a]">Notifications</span>
                    </div>
                    <ChevronRight size={18} className="text-[#94a3b8]" />
                  </button>
                  <div className="h-px bg-[#f8fafc]" />

                  {/* 4. Help & support */}
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onOpenHelp();
                    }}
                    className="flex w-full items-center justify-between py-3.5 px-1 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5">
                      <HelpCircle size={20} className="text-[#0b1b3a]" strokeWidth={2} />
                      <span className="text-base font-semibold text-[#0b1b3a]">Help & support</span>
                    </div>
                    <ChevronRight size={18} className="text-[#94a3b8]" />
                  </button>
                  <div className="h-px bg-[#f8fafc]" />

                  {/* 5. Delete account */}
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingDelete(true);
                    }}
                    className="flex w-full items-center justify-between py-3.5 px-1 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5">
                      <Trash2 size={20} className="text-[#dc2626]" strokeWidth={2} />
                      <span className="text-base font-semibold text-[#dc2626]">Delete account</span>
                    </div>
                    <ChevronRight size={18} className="text-[#94a3b8]" />
                  </button>
                  {openDeletionRequest ? (
                    <p className="px-2 pb-2 text-xs text-text-secondary">
                      {t("apply.account.delete.requested", {
                        date: new Intl.DateTimeFormat("en-IN", {
                          dateStyle: "medium",
                          timeZone: "Asia/Kolkata",
                        }).format(new Date(openDeletionRequest.requested_at)),
                      })}
                    </p>
                  ) : null}
                  <div className="h-px bg-[#f8fafc]" />

                  {/* 6. Sign out */}
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      logout.mutate();
                    }}
                    disabled={logout.isPending}
                    className="flex w-full items-center justify-between py-3.5 px-1 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 rounded-lg cursor-pointer disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3.5">
                      <LogOut size={20} className="text-[#64748b]" strokeWidth={2} />
                      <span className="text-base font-semibold text-[#475569]">Sign out</span>
                    </div>
                    <ChevronRight size={18} className="text-[#94a3b8]" />
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Notifications Submodal */}
      {mounted && notificationsOpen
        ? createPortal(
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <div
                className="fixed inset-0 bg-[#00112e]/50 backdrop-blur-sm"
                onClick={() => setNotificationsOpen(false)}
              />
              <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <h3 className="text-base font-bold text-text">Notifications</h3>
                  <button
                    type="button"
                    onClick={() => setNotificationsOpen(false)}
                    className="rounded-lg p-1 text-text-secondary hover:bg-surface-hover"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="py-4">
                  <PushOptInCard variant="card" />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Confirm Account Deletion Dialog */}
      <ConfirmAction
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={t("apply.account.delete.title")}
        consequence={t("apply.account.delete.consequence")}
        confirmLabel={t("apply.account.delete.confirm")}
        cancelLabel={t("common.cancel")}
        destructive
        pending={removeDeletion.isPending}
        onConfirm={() =>
          removeDeletion.mutate(undefined, {
            onSuccess: () => {
              setConfirmingDelete(false);
              setOpen(false);
            },
          })
        }
      />
    </>
  );
}

export function HelpSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const message = encodeURIComponent("Hi VsolveHub Partner Support, I need help with my application.");

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("apply.help.title")}
      description={t(PARTNER_SUPPORT_HOURS_KEY)}
    >
      <div className="flex flex-col gap-2">
        <a href={`tel:${PARTNER_SUPPORT_PHONE}`} className={buttonStyles({ variant: "outline", className: "justify-start" })}>
          <Phone size={17} aria-hidden /> {t("workspaces.support.call")} · {PARTNER_SUPPORT_PHONE_DISPLAY}
        </a>
        <a
          href={`https://wa.me/${PARTNER_SUPPORT_PHONE.slice(1)}?text=${message}`}
          className={buttonStyles({ variant: "outline", className: "justify-start" })}
        >
          <MessageCircle size={17} aria-hidden /> WhatsApp
        </a>
        <a href={`mailto:${PARTNER_SUPPORT_EMAIL}`} className={buttonStyles({ variant: "outline", className: "justify-start" })}>
          <Mail size={17} aria-hidden /> {t("workspaces.support.email")} · {PARTNER_SUPPORT_EMAIL}
        </a>
      </div>
    </Sheet>
  );
}
