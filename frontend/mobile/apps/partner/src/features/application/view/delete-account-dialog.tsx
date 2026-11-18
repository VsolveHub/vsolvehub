// Ported from frontend/apps/partner/features/application/view/account-menu.tsx (delete dialog)
import { ApiRequestError } from "@vsolve/api-client";
import { useMobileLogout } from "@vsolve/mobile-core";
import { ConfirmAction, Text, useT } from "@vsolve/mobile-ui";
import { useState } from "react";

import { useCreatePrivacyRequest } from "@/features/account/privacy-queries";

/** A date the way the deletion copy says it: "18 Dec 2026", in India's time zone. */
function deletionDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(
    new Date(value),
  );
}

/**
 * "Delete your account?": the confirmation over the application, the same words and the same
 * request as the website.
 *
 * Filing it closes the account at once (Django signs the person out everywhere and keeps this
 * session only for a few minutes) and schedules the erasure 30 days out. So a success is followed
 * by a second notice with the date and a sign-out, never by the application carrying on as if
 * nothing happened.
 *
 * A failed request stays on screen with its reason. Saying "requested" when nothing was sent
 * would leave someone believing their data was being deleted when it was not.
 */
export function DeleteAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const deletion = useCreatePrivacyRequest();
  const signOut = useMobileLogout("/login");
  const [closedUntil, setClosedUntil] = useState<string | null>(null);

  const openWork =
    deletion.error instanceof ApiRequestError && deletion.error.code === "account_deletion_open_work";

  return (
    <>
      <ConfirmAction
        open={open}
        onOpenChange={(next) => {
          if (!next) deletion.reset();
          onOpenChange(next);
        }}
        title={t("apply.account.delete.title")}
        consequence={t("apply.account.delete.consequence")}
        confirmLabel={t("apply.account.delete.confirm")}
        cancelLabel={t("common.cancel")}
        destructive
        pending={deletion.isPending}
        onConfirm={() =>
          deletion.mutate("ERASURE", {
            onSuccess: (created) => {
              onOpenChange(false);
              setClosedUntil(created.scheduled_for ?? created.requested_at);
            },
          })
        }
      >
        {deletion.isError ? (
          <Text accessibilityRole="alert" className="text-sm font-semibold text-danger-text">
            {openWork ? t("apply.account.delete.openWork") : t("apply.account.delete.failed")}
          </Text>
        ) : null}
      </ConfirmAction>

      {/* The account is closed: say when it goes, then sign out either way. */}
      <ConfirmAction
        open={closedUntil !== null}
        onOpenChange={(next) => {
          if (!next) void signOut();
        }}
        title={t("apply.account.delete.closed.title")}
        consequence={
          closedUntil ? t("apply.account.delete.closed.body", { date: deletionDate(closedUntil) }) : ""
        }
        confirmLabel={t("apply.account.delete.closed.ok")}
        cancelLabel={t("apply.account.delete.closed.ok")}
        onConfirm={() => void signOut()}
      />
    </>
  );
}
