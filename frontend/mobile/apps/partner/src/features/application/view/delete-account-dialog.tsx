// Ported from frontend/apps/partner/features/application/view/account-menu.tsx (delete dialog)
import { ConfirmAction, Text, useT } from "@vsolve/mobile-ui";

import { useCreatePrivacyRequest } from "@/features/account/privacy-queries";

/**
 * "Delete your account?": the confirmation over the application, the same words and the same
 * request as the website. It is a request, not an instant deletion: Django records it and the
 * team contacts the person to confirm.
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

  return (
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
          onSuccess: () => onOpenChange(false),
        })
      }
    >
      {deletion.isError ? (
        <Text accessibilityRole="alert" className="text-sm font-semibold text-danger-text">
          {t("apply.account.delete.failed")}
        </Text>
      ) : null}
    </ConfirmAction>
  );
}
