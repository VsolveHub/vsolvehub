import { Card, buttonStyles } from "@vsolve/ui";

const PHONE = "+917330764634";

export function BookingSupport({ reference }: { readonly reference: string }) {
  const message = encodeURIComponent(`Hi VsolveHub, I need help with booking ${reference}.`);
  const subject = encodeURIComponent(`Booking support · ${reference}`);

  return (
    <section aria-labelledby={`support-${reference}`} className="mt-6">
      <Card className="p-0">
        <details className="group">
          <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="grid size-10 place-items-center rounded-full bg-action-soft text-action">
              <span className="text-lg" aria-hidden>?</span>
            </span>
            <span className="min-w-0 flex-1">
              <span id={`support-${reference}`} className="block font-semibold text-text">
                Need help with this booking?
              </span>
              <span className="block text-xs text-text-secondary">
                Schedule, professional, payment, invoice or safety
              </span>
            </span>
            <span className="text-xl text-text-muted transition-transform group-open:rotate-45" aria-hidden>+</span>
          </summary>
          <div className="border-t border-line px-4 py-4">
            <p className="text-sm leading-6 text-text-secondary">
              Keep this reference ready. Choose the quickest channel for scheduling, a professional issue,
              payment or invoice help, damage or safety, and post-service support.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <a href={`https://wa.me/${PHONE.slice(1)}?text=${message}`} className={buttonStyles({ variant: "outline" })}>
                WhatsApp
              </a>
              <a href={`tel:${PHONE}`} className={buttonStyles({ variant: "outline" })}>
                Call
              </a>
              <a href={`mailto:support@vsolvehub.com?subject=${subject}`} className={buttonStyles({ variant: "outline" })}>
                Email
              </a>
            </div>
            <p className="mt-3 text-xs text-text-muted">For immediate danger, contact local emergency services first.</p>
          </div>
        </details>
      </Card>
    </section>
  );
}
