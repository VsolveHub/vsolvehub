import { cn } from "@vsolve/ui";

/**
 * What stands in place of an invoice line, until one exists to show.
 *
 * Partner accounts cannot read the customer's tax document today: there is no
 * partner-side document endpoint, and `RentalBooking` and `StayEnquiry` carry no
 * customer identity at all. The request is tracked in
 * `contracts/proposals/0027-partner-booking-detail-and-documents.md`.
 *
 * ## Why a stated absence rather than nothing
 *
 * A detail panel that simply has no invoice row is indistinguishable from one
 * whose invoice section failed to render. A partner reconciling a booking then
 * cannot tell whether they are owed a document or looking at a bug — and the
 * cheaper reading, "this platform does not give me invoices", is the one they
 * will keep.
 *
 * So the block stays in place and says what is true. It carries no number, no
 * series prefix and no placeholder that could be mistaken for a real document
 * reference: inventing `INV-0000` to fill the space is exactly the fabricated
 * evidence the shared `Timeline` refuses to draw.
 */
export function InvoiceNotice({
  className,
  children = "The tax invoice for this booking is not shared with Partner accounts yet. The amounts above are what the customer was charged.",
}: {
  className?: string;
  children?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-dashed border-line-strong bg-surface-sunken p-3",
        className,
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-muted">
        Invoice
      </p>
      <p className="mt-1 text-sm text-text-secondary">{children}</p>
    </div>
  );
}
