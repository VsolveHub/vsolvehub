"use client";

import type { Schemas } from "@vsolve/api-client";
import { useCurrentSession, useLogout } from "@vsolve/query";
import { Badge, Button, ConfirmAction, ErrorState, Sheet, buttonStyles, cn, useT } from "@vsolve/ui";
import { ChevronRight, LogOut, Mail, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { getApiClient } from "@/lib/api/browser";
import { PushOptInCard } from "@/features/notifications/view/partner-push-preferences";
import {
  isPrivacyRequestOpen,
  usePrivacyRequests,
  useRequestAccountDeletion,
} from "@/features/profile/queries";
import { LocaleSwitcher } from "@/features/session/view/locale-switcher";
import {
  PARTNER_SUPPORT_EMAIL,
  PARTNER_SUPPORT_HOURS_KEY,
  PARTNER_SUPPORT_PHONE,
  PARTNER_SUPPORT_PHONE_DISPLAY,
} from "@/features/support/contact";

import { applicationStatusPresentation, trackLabelKey } from "../model/status";

/**
 * The account menu and the help sheet in the onboarding header.
 *
 * Everything here reads what already exists — the session, the application, the one support
 * line in `features/support/contact.ts`, the privacy-request endpoint the customer app uses —
 * and changes nothing about the account except what the Partner explicitly asks for.
 */

type Application = Schemas["PartnerApplication"];

export function AccountButton({
  application,
  onOpenHelp,
}: {
  application: Application | null;
  onOpenHelp: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const session = useCurrentSession(getApiClient());
  const user = session.data?.user ?? null;
  const name = (application?.display_name || user?.full_name || "").trim();

  if (user === null) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("apply.account.open")}
        className="grid h-10 w-10 sm:h-11 sm:w-11 place-items-center rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <span className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-full bg-navy-900 text-[11px] sm:text-xs font-bold text-surface">
          {initials(name) || "•"}
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen} title={t("apply.account.title")}>
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-0.5">
            <p className="text-base font-bold text-text">{name || t("apply.account.noName")}</p>
            <p className="text-sm text-text-secondary">{user.phone_number}</p>
            {user.email ? <p className="text-sm text-text-secondary">{user.email}</p> : null}
            {application ? (
              <p className="text-sm text-text-secondary">{t(trackLabelKey(application.track))}</p>
            ) : null}
          </section>

          {application ? (
            <Link
              href="/apply"
              onClick={() => setOpen(false)}
              className="flex min-h-12 items-center justify-between gap-3 rounded-card border border-line px-3.5 py-2.5 hover:bg-surface-hover"
            >
              <span className="text-sm font-semibold text-text">{t("apply.account.status")}</span>
              <span className="flex items-center gap-1.5">
                <Badge tone={applicationStatusPresentation(application.status).tone}>
                  {t(applicationStatusPresentation(application.status).labelKey)}
                </Badge>
                <ChevronRight size={16} className="text-text-muted" aria-hidden />
              </span>
            </Link>
          ) : null}

          <div className="rounded-card border border-line px-3.5 py-3">
            <PushOptInCard variant="row" />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-card border border-line px-3.5 py-2.5">
            <span className="text-sm font-semibold text-text">{t("apply.account.language")}</span>
            <LocaleSwitcher />
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenHelp();
            }}
            className="flex min-h-12 items-center justify-between gap-3 rounded-card border border-line px-3.5 py-2.5 text-left hover:bg-surface-hover"
          >
            <span className="text-sm font-semibold text-text">{t("apply.help.title")}</span>
            <ChevronRight size={16} className="text-text-muted" aria-hidden />
          </button>

          <DeleteAccount />

          <SignOut />
        </div>
      </Sheet>
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
  // The prefilled message goes to the support desk, so it stays in English.
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

/**
 * Asks for the account to be deleted. A request, not an instant wipe: Operations completes it,
 * and records the law requires us to keep stay until they expire.
 */
function DeleteAccount() {
  const t = useT();
  const requests = usePrivacyRequests();
  const remove = useRequestAccountDeletion();
  const [confirming, setConfirming] = useState(false);

  const open = (requests.data ?? []).find(
    (item) => item.kind === "ERASURE" && isPrivacyRequestOpen(item),
  );

  return (
    <section className="flex flex-col gap-2 border-t border-line pt-4">
      {open ? (
        <p className="text-sm text-text-secondary">
          {t("apply.account.delete.requested", {
            date: new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(
              new Date(open.requested_at),
            ),
          })}
        </p>
      ) : (
        <Button
          variant="ghost"
          onClick={() => setConfirming(true)}
          disabled={requests.isPending}
          className="justify-start text-danger-text"
        >
          {t("apply.account.delete.cta")}
        </Button>
      )}

      {remove.isError ? (
        <ErrorState inline title={t("apply.account.delete.failed")} message={t("apply.common.checkConnectionAndRetry")} />
      ) : null}

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title={t("apply.account.delete.title")}
        consequence={t("apply.account.delete.consequence")}
        confirmLabel={t("apply.account.delete.confirm")}
        cancelLabel={t("common.cancel")}
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate(undefined, { onSuccess: () => setConfirming(false) })}
      />
    </section>
  );
}

function SignOut() {
  const t = useT();
  const logout = useLogout(getApiClient());

  return (
    <button
      type="button"
      onClick={() => logout.mutate()}
      disabled={logout.isPending}
      className={cn(
        "flex min-h-12 items-center justify-center gap-2 rounded-card border border-line px-4 text-sm font-bold text-text",
        "hover:bg-surface-hover disabled:opacity-60",
      )}
    >
      <LogOut size={16} aria-hidden />
      {logout.isPending ? t("common.signingOut") : t("common.signOut")}
    </button>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
