import Link from "next/link";

import type { Category, ServiceCard as ServiceCardData } from "../queries";
import { groupServicesBySubcategory } from "../grouping";
import { serviceHref } from "./service-card";

interface WorkforceCatalogProps {
  category: Category;
  services: readonly ServiceCardData[];
  activeTrade: string | null;
}

const CHIP =
  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action";

/** A visual-first catalogue for the workforce marketplace. */
export function WorkforceCatalog({
  category,
  services,
  activeTrade,
}: WorkforceCatalogProps) {
  const { groups, ungrouped } = groupServicesBySubcategory(
    services,
    category.subcategories,
    activeTrade,
  );
  const visibleServices = [...groups.flatMap((group) => group.services), ...ungrouped];

  return (
    <>
      <section className="group relative mt-4 overflow-hidden rounded-[24px] bg-[#102238] px-5 py-8 text-white sm:rounded-[32px] sm:px-10 sm:py-12 lg:grid lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-12">
        <div className="absolute -left-16 -top-20 size-64 rounded-full bg-[#F97316]/15 blur-3xl" />
        <div className="relative z-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FDBA74]">
            Workforce, made visual
          </p>
          <h1 className="mt-3 max-w-2xl text-balance text-3xl font-bold tracking-[-0.035em] sm:text-5xl lg:text-6xl">
            Pick a trade. Build a crew.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-white/70 sm:text-lg">
            Choose the skill first. Set people and days next. See the area rate before you book.
          </p>

          <ol className="mt-7 grid max-w-2xl grid-cols-1 gap-2 sm:grid-cols-3" aria-label="How crew booking works">
            <VisualStep number="01" label="Choose service" active />
            <VisualStep number="02" label="Set crew" />
            <VisualStep number="03" label="See rate" />
          </ol>
        </div>

        <CrewMap />
      </section>

      <section className="py-9 sm:py-11" aria-labelledby="choose-service-heading">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#C2410C]">
              Step 1
            </p>
            <h2 id="choose-service-heading" className="mt-1 text-2xl font-bold text-text sm:text-3xl">
              Choose the crew you need
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-text-secondary">
            No request is created while you browse.
          </p>
        </div>

        {category.subcategories.length > 0 ? (
          <nav aria-label="Workforce trades" className="mt-6 overflow-x-auto pb-2">
            <ul className="flex min-w-max gap-2">
              <li>
                <Link
                  href={`/catalog/${category.slug}`}
                  aria-current={activeTrade === null ? "page" : undefined}
                  className={`${CHIP} ${
                    activeTrade === null
                      ? "border-[#EA580C] bg-[#FFF1E7] text-[#9A3412]"
                      : "border-line bg-surface text-text hover:-translate-y-0.5 hover:border-line-strong"
                  }`}
                >
                  All crews
                </Link>
              </li>
              {category.subcategories.map((trade) => {
                const selected = trade.slug === activeTrade;
                return (
                  <li key={trade.id}>
                    <Link
                      href={`/catalog/${category.slug}?trade=${trade.slug}`}
                      aria-current={selected ? "page" : undefined}
                      className={`${CHIP} ${
                        selected
                          ? "border-[#EA580C] bg-[#FFF1E7] text-[#9A3412]"
                          : "border-line bg-surface text-text hover:-translate-y-0.5 hover:border-line-strong"
                      }`}
                    >
                      {trade.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}

        {visibleServices.length === 0 ? (
          <div className="mt-8 rounded-[24px] border border-dashed border-line p-10 text-center">
            <p className="font-semibold text-text">No crews are published in this trade yet.</p>
            <Link href={`/catalog/${category.slug}`} className="mt-3 inline-flex min-h-11 items-center font-semibold text-text-link">
              Show every service
            </Link>
          </div>
        ) : (
          <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {visibleServices.map((service, index) => (
              <WorkforceServiceCard
                key={service.id}
                service={service}
                categorySlug={category.slug}
                index={index}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function VisualStep({
  number,
  label,
  active = false,
}: {
  number: string;
  label: string;
  active?: boolean;
}) {
  return (
    <li
      className={
        active
          ? "rounded-[16px] bg-white p-3 text-[#102238]"
          : "rounded-[16px] border border-white/10 bg-white/[0.06] p-3 text-white/65"
      }
    >
      <span className={active ? "text-xs font-bold text-[#EA580C]" : "text-xs font-bold text-white/40"}>
        {number}
      </span>
      <span className="mt-3 block text-xs font-semibold sm:text-sm">{label}</span>
    </li>
  );
}

function CrewMap() {
  return (
    <div className="relative mx-auto mt-10 aspect-square w-full max-w-[390px] lg:mt-0" aria-hidden="true">
      <div className="absolute inset-[8%] rounded-full border border-dashed border-white/20 transition-transform duration-700 ease-out group-hover:rotate-12 motion-reduce:transform-none" />
      <div className="absolute inset-[22%] rounded-full border border-white/10 transition-transform duration-700 ease-out group-hover:-rotate-12 motion-reduce:transform-none" />
      <div className="absolute inset-[33%] grid place-items-center rounded-full bg-[#F97316] shadow-[0_0_70px_rgba(249,115,22,0.35)]">
        <TradeIcon kind="crew" className="size-16 text-white" />
      </div>
      {[
        "left-[7%] top-[43%]",
        "right-[8%] top-[18%]",
        "bottom-[7%] right-[28%]",
        "left-[27%] top-[5%]",
      ].map((position, index) => (
        <span
          key={position}
          className={`absolute ${position} grid size-14 place-items-center rounded-[18px] border border-white/15 bg-white/10 backdrop-blur transition-transform duration-300 ease-out group-hover:-translate-y-1 motion-reduce:transform-none`}
        >
          <TradeIcon kind={index % 2 === 0 ? "tools" : "helmet"} className="size-7 text-[#FDBA74]" />
        </span>
      ))}
    </div>
  );
}

function WorkforceServiceCard({
  service,
  categorySlug,
  index,
}: {
  service: ServiceCardData;
  categorySlug: string;
  index: number;
}) {
  const kind = iconKind(`${service.slug} ${service.name}`);
  return (
    <Link
      href={serviceHref(service, categorySlug)}
      className="group relative flex min-h-60 flex-col overflow-hidden rounded-[22px] border border-line bg-surface p-5 shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:border-[#FDBA74] hover:shadow-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-action motion-reduce:transform-none sm:min-h-64 sm:rounded-[24px]"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="grid size-12 place-items-center rounded-[16px] bg-[#FFF1E7] text-[#C2410C] transition-transform duration-300 group-hover:rotate-3 group-hover:scale-105 motion-reduce:transform-none sm:size-14 sm:rounded-[18px]">
          <TradeIcon kind={kind} className="size-6 sm:size-7" />
        </span>
        <span className="text-xs font-bold tabular-nums text-text-muted">{`${index + 1}`.padStart(2, "0")}</span>
      </div>
      <h3 className="mt-5 text-balance text-lg font-bold text-text transition-colors group-hover:text-[#C2410C] sm:mt-6 sm:text-xl">
        {service.name}
      </h3>
      <p className="mt-2 line-clamp-2 flex-1 text-sm leading-6 text-text-secondary">
        {service.short_description}
      </p>
      <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
        <span className="text-sm font-bold text-text">Build this crew</span>
        <span className="grid size-9 place-items-center rounded-full bg-[#102238] text-white transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transform-none">
          <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
            <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </Link>
  );
}

type IconKind = "crew" | "tools" | "helmet" | "paint" | "electric" | "water" | "clean";

function iconKind(value: string): IconKind {
  const text = value.toLowerCase();
  if (text.includes("paint")) return "paint";
  if (text.includes("electric")) return "electric";
  if (text.includes("plumb") || text.includes("water")) return "water";
  if (text.includes("clean") || text.includes("housekeep")) return "clean";
  if (text.includes("construct") || text.includes("mason")) return "helmet";
  return "tools";
}

function TradeIcon({ kind, className }: { kind: IconKind; className: string }) {
  if (kind === "paint") {
    return <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true"><path d="M7 5h14v8H7zM21 9h4v8h-9v10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (kind === "electric") {
    return <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true"><path d="m18 3-9 15h7l-2 11 9-15h-7z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" /></svg>;
  }
  if (kind === "water") {
    return <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true"><path d="M16 4s8 9 8 16a8 8 0 0 1-16 0c0-7 8-16 8-16Z" stroke="currentColor" strokeWidth="2.2" /><path d="M12 21c.7 2 2 3 4 3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>;
  }
  if (kind === "clean") {
    return <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true"><path d="m18 4-5 15m-4-2 12 4-2 7-12-4z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (kind === "helmet") {
    return <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true"><path d="M6 20a10 10 0 0 1 20 0M4 20h24v5H4zM16 8v8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (kind === "crew") {
    return <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true"><circle cx="12" cy="11" r="4" stroke="currentColor" strokeWidth="2.2" /><circle cx="23" cy="13" r="3" stroke="currentColor" strokeWidth="2.2" /><path d="M4 27c0-6 3-9 8-9s8 3 8 9m0-7c4 0 7 2 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>;
  }
  return <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true"><path d="m7 25 8-8m3-3 7-7m-4-2 6 6M5 9l6 6-4 4-6-6zM17 19l6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
