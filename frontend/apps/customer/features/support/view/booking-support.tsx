"use client";

import { Card, buttonStyles } from "@vsolve/ui";
import { Calendar, ChevronDown, CircleHelp, FileText, Headset, Receipt, UserRound } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { SUPPORT } from "@/lib/support";

const BOOKING_FAQS: readonly {
  id: string;
  question: string;
  answer: string;
  icon: ReactNode;
}[] = [
  {
    id: "faq-reschedule",
    question: "Can I reschedule this visit?",
    icon: <Calendar className="size-3.5" aria-hidden />,
    answer:
      "When this visit can be moved, Reschedule is on this page. It uses the same arrival windows as booking. If it cannot be moved, the reason is shown next to the button.",
  },
  {
    id: "faq-cancellation",
    question: "How does cancellation & refund work?",
    icon: <Receipt className="size-3.5" aria-hidden />,
    answer:
      "You can cancel a service request without penalty before a professional is assigned and accepts. Once a specialist is matched, a late cancellation fee may apply depending on the proximity to the service start time. When cancel is offered on this page, the fee and refund are shown before you confirm.",
  },
  {
    id: "faq-invoice",
    question: "How do I get my invoice?",
    icon: <FileText className="size-3.5" aria-hidden />,
    answer:
      "When payment has been captured, use View your receipt on this page. The receipt is the invoice for this booking.",
  },
  {
    id: "faq-professional",
    question: "Where can I see my professional details?",
    icon: <UserRound className="size-3.5" aria-hidden />,
    answer:
      "Assigned professional details are on this booking page after payment — name, services and experience. They stay hidden until the booking is paid for.",
  },
  {
    id: "faq-support",
    question: "How do I contact support?",
    icon: <Headset className="size-3.5" aria-hidden />,
    answer:
      "Use WhatsApp, Call or Email below. Keep this booking reference ready so we can find the right visit.",
  },
];

/**
 * Help for a booking: contact channels, and on the one-visit overview a FAQ list.
 *
 * Compact (default) is the original accordion used on visit and multi-visit pages.
 * `faq` adds the booking questions without changing the channels or the reference
 * they carry.
 */
export function BookingSupport({
  reference,
  variant = "compact",
}: {
  readonly reference: string;
  readonly variant?: "compact" | "faq";
}) {
  const message = encodeURIComponent(`Hi VsolveHub, I need help with booking ${reference}.`);
  const subject = encodeURIComponent(`Booking support · ${reference}`);

  const helpRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (variant === "faq" && helpRef.current !== null) {
      helpRef.current.open = true;
    }
  }, [variant]);

  return (
    <section aria-labelledby={`support-${reference}`} className={variant === "faq" ? undefined : "mt-6"}>
      <Card padding="none">
        <details id="booking-help" ref={helpRef} className="group">
          <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring [&::-webkit-details-marker]:hidden">
            <span className="grid size-10 place-items-center rounded-full bg-action-soft text-action">
              {variant === "faq" ? (
                <CircleHelp className="size-5" aria-hidden />
              ) : (
                <span className="text-lg" aria-hidden>
                  ?
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span id={`support-${reference}`} className="block font-semibold text-text">
                Need help with this booking?
              </span>
              <span className="block text-xs text-text-secondary">
                Schedule, professional, payment, invoice or safety
              </span>
            </span>
            <span
              className="text-xl text-text-muted transition-transform group-open:rotate-45"
              aria-hidden
            >
              +
            </span>
          </summary>
          <div className="border-t border-line px-4 py-4">
            {variant === "faq" ? (
              <ul className="mb-4 divide-y divide-line overflow-hidden rounded-control border border-line">
                {BOOKING_FAQS.map((item) => (
                  <li key={item.id}>
                    <details id={item.id} className="group/item">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-3 text-sm font-medium text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring [&::-webkit-details-marker]:hidden">
                        <span className="grid size-7 shrink-0 place-items-center rounded-control bg-surface-sunken text-text-secondary">
                          {item.icon}
                        </span>
                        <span className="min-w-0 flex-1">{item.question}</span>
                        <ChevronDown
                          className="size-4 shrink-0 text-text-muted transition-transform group-open/item:rotate-180"
                          aria-hidden
                        />
                      </summary>
                      <p className="px-3 pb-3 pl-[3.25rem] text-sm leading-6 text-text-secondary">
                        {item.answer}
                      </p>
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm leading-6 text-text-secondary">
                Keep this reference ready. Choose the quickest channel for scheduling, a professional
                issue, payment or invoice help, damage or safety, and post-service support.
              </p>
            )}
            <div className={`grid grid-cols-1 gap-2 ${SUPPORT.phone ? "sm:grid-cols-3" : ""}`}>
              {SUPPORT.phone ? (
                <>
                  <a
                    href={`${SUPPORT.phone.whatsappHref}?text=${message}`}
                    className={buttonStyles({ variant: "outline" })}
                  >
                    WhatsApp
                  </a>
                  <a href={SUPPORT.phone.telHref} className={buttonStyles({ variant: "outline" })}>
                    Call
                  </a>
                </>
              ) : null}
              <a
                href={`mailto:${SUPPORT.email}?subject=${subject}`}
                className={buttonStyles({ variant: "outline" })}
              >
                Email
              </a>
            </div>
            <p className="mt-3 text-xs text-text-muted">
              For immediate danger, contact local emergency services first.
            </p>
          </div>
        </details>
      </Card>
    </section>
  );
}
