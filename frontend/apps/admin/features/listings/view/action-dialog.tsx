import { Button, Dialog, ErrorState, Field, Textarea } from "@vsolve/ui";
import type { AdminListing } from "../queries";

export interface ActionDialogProps {
  action: "REMOVE" | "REINSTATE" | null;
  listing: AdminListing | null;
  onClose: () => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  submitting: boolean;
  onSubmit: () => void;
  /** The server's refusal, shown in the dialog so the typed reason is not lost. */
  error?: string | null;
}

export function ActionDialog({
  action,
  listing,
  onClose,
  reason,
  onReasonChange,
  submitting,
  onSubmit,
  error,
}: ActionDialogProps) {
  if (!action || !listing) return null;

  const isRemove = action === "REMOVE";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
      title={isRemove ? "Take down listing" : "Reinstate listing"}
      description={
        isRemove
          ? `Taking down “${listing.title}” immediately withdraws it from public search and notifies the employer.`
          : `Reinstate “${listing.title}” back to active circulation.`
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={isRemove ? "danger" : "primary"}
            disabled={isRemove && !reason.trim()}
            loading={submitting}
            loadingLabel={isRemove ? "Taking down" : "Reinstating"}
            onClick={onSubmit}
          >
            {isRemove ? "Take down listing" : "Reinstate listing"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label={isRemove ? "Policy violation reason" : "Reinstatement note"}
          required={isRemove}
          description={isRemove ? "Recorded on the listing's audit trail." : undefined}
        >
          <Textarea
            rows={3}
            placeholder={
              isRemove
                ? "e.g. Fraudulent recruitment, reported abuse, or scam job offer"
                : "Reason for reinstatement"
            }
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
          />
        </Field>
        {error ? <ErrorState inline title="That did not go through" message={error} /> : null}
      </div>
    </Dialog>
  );
}
