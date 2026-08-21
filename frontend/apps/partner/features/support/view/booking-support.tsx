import { Card, buttonStyles } from "@vsolve/ui";
import { Headphones, Mail, MessageCircle, Phone } from "lucide-react";

const PHONE = "+917330764634";

export function BookingSupport({ reference }: { readonly reference: string }) {
  const message = encodeURIComponent(`Hi VsolveHub Partner Support, I need help with job ${reference}.`);
  const subject = encodeURIComponent(`Partner job support · ${reference}`);

  return (
    <Card className="p-0">
      <details className="group">
        <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="grid size-10 place-items-center rounded-full bg-action-soft text-action">
            <Headphones size={20} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-text">Booking support</span>
            <span className="block text-xs text-text-secondary">Schedule, customer, payment or safety</span>
          </span>
          <span className="text-xl text-text-muted transition-transform group-open:rotate-45" aria-hidden>+</span>
        </summary>
        <div className="border-t border-line px-4 py-4">
          <p className="text-sm leading-6 text-text-secondary">
            Contact us about schedule changes, site or customer issues, payment and invoice questions,
            damage or safety, or help after completion.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <a href={`https://wa.me/${PHONE.slice(1)}?text=${message}`} className={buttonStyles({ variant: "outline" })}><MessageCircle size={17} aria-hidden /> WhatsApp</a>
            <a href={`tel:${PHONE}`} className={buttonStyles({ variant: "outline" })}><Phone size={17} aria-hidden /> Call</a>
            <a href={`mailto:support@vsolvehub.com?subject=${subject}`} className={buttonStyles({ variant: "outline" })}><Mail size={17} aria-hidden /> Email</a>
          </div>
        </div>
      </details>
    </Card>
  );
}
