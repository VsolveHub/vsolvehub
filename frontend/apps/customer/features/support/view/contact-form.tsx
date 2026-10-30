"use client";

import { ApiRequestError, request, type Schemas } from "@vsolve/api-client";
import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { getApiClient } from "@/lib/api/browser";
import { SUPPORT } from "@/lib/support";

// drf-spectacular suffixes request components with "Request", hence the double suffix.
type ContactMessage = Schemas["ContactMessageRequestRequest"];
type Topic = ContactMessage["topic"];

const TOPICS: { value: Topic; label: string }[] = [
  { value: "booking", label: "A booking or visit" },
  { value: "payment", label: "Payment or refund" },
  { value: "partner", label: "Working as a professional" },
  { value: "feedback", label: "Feedback or a complaint" },
  { value: "other", label: "Something else" },
];

const FIELD =
  "w-full rounded-xl border-0 bg-[#f4f1ec] px-4 py-2.5 text-sm font-medium text-navy-900 placeholder:text-text-secondary/70 focus:ring-2 focus:ring-[#b46535]/25 focus:outline-none";
const LABEL = "text-xs font-bold text-navy-900";

/**
 * The Contact form (contract 1.78.0): every message opens an Operations case.
 *
 * The success state quotes the case reference so the person can refer to it, and promises only
 * the reply time the team publishes. Never retried automatically — a retry after a timeout could
 * open the same case twice.
 */
export function ContactForm() {
  const [values, setValues] = useState<ContactMessage>({
    name: "",
    phone_number: "",
    email: "",
    topic: "booking",
    message: "",
    website: "",
  });

  const send = useMutation({
    mutationFn: (body: ContactMessage) =>
      request(() => getApiClient().POST("/api/v1/support/contact/", { body })),
    retry: false,
  });

  const fieldErrors = send.error instanceof ApiRequestError ? send.error.fieldErrors : {};
  const fieldError = (name: keyof ContactMessage) => fieldErrors[name]?.[0];

  const update = <K extends keyof ContactMessage>(key: K, value: ContactMessage[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (send.isPending) return;
    send.mutate(values);
  };

  if (send.isSuccess) {
    return (
      <div role="status" className="rounded-xl bg-[#ECFDF3] p-5 text-sm text-[#14532D]">
        <p className="font-bold">Thanks — your message has reached our support team.</p>
        <p className="mt-1 font-medium">
          Your reference is <span className="font-mono font-bold">{send.data.reference}</span>. We
          reply {SUPPORT.replyTime}.
          {SUPPORT.phone ? (
            <>
              {" "}
              For anything urgent about a visit today, call or WhatsApp{" "}
              <a className="font-bold underline" href={SUPPORT.phone.telHref}>
                {SUPPORT.phone.display}
              </a>
              .
            </>
          ) : null}
        </p>
      </div>
    );
  }

  const generalError =
    send.error && Object.keys(fieldErrors).length === 0
      ? send.error instanceof ApiRequestError && send.error.status === 429
        ? `You have sent several messages in a short time. Please wait a while${SUPPORT.phone ? `, or call or WhatsApp ${SUPPORT.phone.display}` : `, or write to ${SUPPORT.email}`}.`
        : `We could not send your message. Please try again, or write to ${SUPPORT.email}.`
      : null;

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      {generalError ? (
        <p role="alert" className="rounded-xl bg-[#FEF2F2] p-4 text-sm font-medium text-[#991B1B]">
          {generalError}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="contact-name" className={LABEL}>
            Name
          </label>
          <input
            id="contact-name"
            className={FIELD}
            autoComplete="name"
            maxLength={120}
            required
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            aria-invalid={Boolean(fieldError("name"))}
          />
          {fieldError("name") ? <FieldError text={fieldError("name")!} /> : null}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="contact-topic" className={LABEL}>
            What is it about?
          </label>
          <select
            id="contact-topic"
            className={FIELD}
            value={values.topic}
            onChange={(event) => update("topic", event.target.value as Topic)}
          >
            {TOPICS.map((topic) => (
              <option key={topic.value} value={topic.value}>
                {topic.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="contact-phone" className={LABEL}>
            Mobile number
          </label>
          <input
            id="contact-phone"
            className={FIELD}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="10-digit mobile number"
            value={values.phone_number}
            onChange={(event) => update("phone_number", event.target.value)}
            aria-invalid={Boolean(fieldError("phone_number"))}
          />
          {fieldError("phone_number") ? <FieldError text={fieldError("phone_number")!} /> : null}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="contact-email" className={LABEL}>
            Email <span className="font-medium text-text-secondary">(optional)</span>
          </label>
          <input
            id="contact-email"
            className={FIELD}
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => update("email", event.target.value)}
            aria-invalid={Boolean(fieldError("email"))}
          />
          {fieldError("email") ? <FieldError text={fieldError("email")!} /> : null}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="contact-message" className={LABEL}>
          Message
        </label>
        <textarea
          id="contact-message"
          className={`${FIELD} resize-none`}
          rows={5}
          minLength={10}
          maxLength={2000}
          required
          placeholder="Tell us what you need help with. If it is about a booking, include the date and service."
          value={values.message}
          onChange={(event) => update("message", event.target.value)}
          aria-invalid={Boolean(fieldError("message"))}
        />
        {fieldError("message") ? <FieldError text={fieldError("message")!} /> : null}
      </div>

      {/* Honeypot: hidden from people and screen readers, filled by form-spamming scripts. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="contact-website">Leave this empty</label>
        <input
          id="contact-website"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={(event) => update("website", event.target.value)}
        />
      </div>

      <p className="text-xs font-medium text-text-secondary">
        Give a mobile number or an email so we can reply. We use it only to answer this message.
      </p>

      <button
        type="submit"
        disabled={send.isPending}
        className="mt-1 w-full cursor-pointer self-end rounded-xl bg-[#EA580C] px-8 py-3 text-sm font-bold text-white shadow-xs transition-colors hover:bg-[#C2410C] disabled:cursor-wait disabled:opacity-70 sm:w-auto"
      >
        {send.isPending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}

function FieldError({ text }: { text: string }) {
  return <p className="text-xs font-semibold text-[#B91C1C]">{text}</p>;
}
