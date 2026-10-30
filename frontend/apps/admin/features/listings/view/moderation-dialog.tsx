import { CheckCircle2, XCircle } from "lucide-react";
import { Button, Dialog, ErrorState, Field, Textarea } from "@vsolve/ui";
import type { AdminListing } from "../queries";

export interface ModerationDialogProps {
  listing: AdminListing | null;
  onClose: () => void;
  isApproving: boolean;
  setIsApproving: (approving: boolean) => void;
  actionReason: string;
  setActionReason: (reason: string) => void;
  submitting: boolean;
  onSubmit: () => void;
  /** The server's refusal, shown in the dialog so the typed reason is not lost. */
  error?: string | null;
}

const CHOICE =
  "flex flex-1 flex-col items-center gap-1 rounded-card border p-3 text-center text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action";

export function ModerationDialog({
  listing,
  onClose,
  isApproving,
  setIsApproving,
  actionReason,
  setActionReason,
  submitting,
  onSubmit,
  error,
}: ModerationDialogProps) {
  if (!listing) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
      title="Moderation decision"
      description={listing.title}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={isApproving ? "primary" : "danger"}
            disabled={!isApproving && !actionReason.trim()}
            loading={submitting}
            loadingLabel="Saving decision"
            onClick={onSubmit}
          >
            {isApproving ? "Approve listing" : "Reject listing"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div role="group" aria-label="Decision" className="flex gap-2">
          <button
            type="button"
            aria-pressed={isApproving}
            onClick={() => setIsApproving(true)}
            className={`${CHOICE} ${
              isApproving
                ? "border-success-line bg-success-surface text-success-text ring-2 ring-success-line"
                : "border-line text-text-secondary hover:bg-surface-hover"
            }`}
          >
            <CheckCircle2 className="size-5" aria-hidden />
            Approve
          </button>
          <button
            type="button"
            aria-pressed={!isApproving}
            onClick={() => setIsApproving(false)}
            className={`${CHOICE} ${
              !isApproving
                ? "border-danger-line bg-danger-surface text-danger-text ring-2 ring-danger-line"
                : "border-line text-text-secondary hover:bg-surface-hover"
            }`}
          >
            <XCircle className="size-5" aria-hidden />
            Reject / return to draft
          </button>
        </div>

        <Field
          label={isApproving ? "Approval note" : "Rejection reason"}
          required={!isApproving}
          description={
            isApproving ? "Optional." : "The employer sees this so they can amend and resubmit."
          }
        >
          <Textarea
            rows={3}
            placeholder={
              isApproving
                ? "e.g. Verified standard job posting"
                : "Explain why this posting was rejected"
            }
            value={actionReason}
            onChange={(e) => setActionReason(e.target.value)}
          />
        </Field>
        {error ? <ErrorState inline title="That did not go through" message={error} /> : null}
      </div>
    </Dialog>
  );
}
