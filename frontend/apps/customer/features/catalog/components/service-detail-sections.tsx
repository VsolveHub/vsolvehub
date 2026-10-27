import { RemoteImage } from "@/components/remote-image";

import type { ServiceDetail } from "../queries";
import { addsToServiceCopy, warrantyText } from "../service-facts";

/**
 * Service-page sections laid out the way a customer compares a job: what each option is,
 * what protects them, and who turns up. Every line is read from the service payload or is
 * something the product enforces; nothing here states a figure the server did not send.
 */

type Variant = ServiceDetail["variants"][number];

/**
 * "Know the difference" — each option with what makes it different.
 *
 * Only options whose description says something beyond the service sentence, and only when
 * there are two or more of them: one explained option is not a comparison.
 */
export function ServiceOptionDifferences({ service }: { service: ServiceDetail }) {
  const explained = service.variants.filter((variant) =>
    addsToServiceCopy(variant.description, service.short_description, service.description ?? ""),
  );
  if (explained.length < 2) return null;

  return (
    <section aria-labelledby="difference-heading" className="mt-8 rounded-[1rem] bg-white p-7 sm:p-8 shadow-sm">
      <h2 id="difference-heading" className="text-[1.15rem] font-bold text-navy-900">
        Know the difference
      </h2>
      <ul className="mt-5 grid gap-5 sm:grid-cols-2">
        {explained.map((variant) => (
          <OptionDifference key={variant.id} variant={variant} />
        ))}
      </ul>
    </section>
  );
}

function OptionDifference({ variant }: { variant: Variant }) {
  return (
    <li className="flex items-start gap-4">
      {variant.image_url.trim() !== "" ? (
        <RemoteImage
          src={variant.image_url}
          alt=""
          width={80}
          height={80}
          className="size-20 shrink-0 rounded-xl bg-surface-sunken object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-[#FFF0E5] text-action"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      )}
      <div className="min-w-0">
        <h3 className="text-[0.98rem] font-semibold text-navy-900">{variant.name}</h3>
        <p className="mt-1 text-[0.9rem] leading-relaxed text-text-secondary">{variant.description}</p>
      </div>
    </li>
  );
}

/**
 * The assurance tiles. The warranty tile appears only when the service publishes one; the
 * other two are how every booking works — the server prices before payment, and extra time
 * or parts need the customer's approval. No damage-cover amount: there is no such policy.
 */
export function ServiceAssurance({ service }: { service: ServiceDetail }) {
  const warranty = warrantyText(service.policies);
  // "30-day warranty on the workmanship" → "30-day warranty" for a tile; the full line is
  // still in "What's included". A warranty worded any other way is shown as written.
  const warrantyLabel = warranty?.match(/^\d+[- ]day warranty/i)?.[0] ?? warranty;
  const tiles = [
    warrantyLabel ? { title: warrantyLabel, icon: <WarrantyArt /> } : null,
    { title: "Price shown before you pay", icon: <PriceArt /> },
    { title: "Extra work only with your approval", icon: <ApprovalArt /> },
  ].filter((tile): tile is { title: string; icon: React.JSX.Element } => tile !== null);

  // Laid out like a marketplace "cover" block: a coloured wordmark-style heading, three
  // flat grey tiles with large outline art and regular-weight text, then a full-width row.
  // The row goes to this page's FAQs — there is no separate claims page to send people to.
  return (
    <section aria-labelledby="assurance-heading" className="mt-8 rounded-[1rem] bg-white p-5 sm:p-8 shadow-sm">
      <h2
        id="assurance-heading"
        className="flex items-center gap-2 text-[1.6rem] font-extrabold leading-none tracking-tight text-[#0E7C86]"
      >
        <AssuranceMark />
        vsolve assurance
      </h2>
      {/* Three separate tiles side by side. Below 360px each would be ~70px wide and cut
          words in half, so there they stack — still one tile each. */}
      <ul className="mt-6 grid grid-cols-1 gap-3 min-[360px]:grid-cols-3">
        {tiles.map((tile) => (
          <li key={tile.title} className="flex min-h-[9.5rem] flex-col gap-5 rounded-xl bg-[#F5F5F5] p-4 sm:p-5">
            <span aria-hidden className="text-[#0F0F0F]">
              {tile.icon}
            </span>
            <span className="min-w-0 text-[0.95rem] font-medium leading-[1.35] text-[#0F0F0F] sm:text-[1.05rem]">
              {tile.title}
            </span>
          </li>
        ))}
      </ul>
      <a
        href="#service-faq-heading"
        className="mt-4 flex min-h-14 items-center justify-between gap-3 rounded-xl bg-[#F5F5F5] px-5 text-[1rem] font-medium text-[#0F0F0F] transition-colors hover:bg-[#EDEDED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
      >
        How we protect your booking
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-5 shrink-0" aria-hidden>
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clipRule="evenodd"
          />
        </svg>
      </a>
    </section>
  );
}

/** A tick resting on a line — the mark beside the assurance heading. */
function AssuranceMark() {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className="size-8 shrink-0" aria-hidden>
      <path d="M4 15.5 7.6 12l5.2 5.1L24.4 5.6 28 9.1 12.8 24.2 4 15.5Z" />
      <rect x="4" y="26" width="24" height="3.5" rx="1" />
    </svg>
  );
}

/**
 * Who turns up. Three facts the product enforces — identity review before a first job,
 * approval per kind of work, and the rating customers can leave after a visit — beside the
 * service's own cover photo. No training hours or certifications: nothing records them.
 */
export function ServiceProfessionals({ service }: { service: ServiceDetail }) {
  const facts = [
    "ID-verified before their first job",
    "Approved for this kind of work",
    "Rated by customers after their visits",
  ];

  return (
    <section
      aria-labelledby="professionals-heading"
      className="mt-8 flex overflow-hidden rounded-[1rem] bg-white shadow-sm"
    >
      <div className="min-w-0 flex-1 p-7 sm:p-8">
        <h2 id="professionals-heading" className="text-[1.15rem] font-bold text-navy-900">
          Verified professionals
        </h2>
        <ul className="mt-5 space-y-4">
          {facts.map((fact) => (
            <li key={fact} className="flex items-start gap-3 text-[0.95rem] text-navy-900">
              <span aria-hidden className="mt-0.5 text-action">
                <ShieldIcon />
              </span>
              {fact}
            </li>
          ))}
        </ul>
      </div>
      {service.cover ? (
        <div
          aria-hidden
          className="hidden w-2/5 shrink-0 bg-cover bg-center min-[420px]:block"
          style={{ backgroundImage: `url('${service.cover.url}')` }}
        />
      ) : null}
    </section>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
    </svg>
  );
}



/*
 * Tile art for the assurance row: 40px outline drawings in one stroke weight, the way a
 * marketplace "cover" row is drawn — a shield with a tick, a banknote, a receipt with a tick.
 * Drawn here rather than fetched: they are part of the page's furniture, not catalogue data.
 */
function WarrantyArt() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={2.2} className="size-10">
      <path
        strokeLinejoin="round"
        d="M24 5 9 10.5v12.2c0 9.6 6.3 16.6 15 20.3 8.7-3.7 15-10.7 15-20.3V10.5L24 5Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="m17 24.5 5 5 9.5-10" />
    </svg>
  );
}

function PriceArt() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={2.2} className="size-10">
      <rect x="4" y="12" width="40" height="24" rx="2" />
      <circle cx="24" cy="24" r="5.5" />
      <path strokeLinecap="round" d="M4 18.5A6.5 6.5 0 0 0 10.5 12M37.5 12A6.5 6.5 0 0 0 44 18.5M44 29.5A6.5 6.5 0 0 0 37.5 36M10.5 36A6.5 6.5 0 0 0 4 29.5" />
    </svg>
  );
}

function ApprovalArt() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={2.2} className="size-10">
      <path
        strokeLinejoin="round"
        d="M11 5h26v36l-3.25-2.5L30.5 41l-3.25-2.5L24 41l-3.25-2.5L17.5 41l-3.25-2.5L11 41V5Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="m17 21 5 5 9-9.5" />
    </svg>
  );
}
