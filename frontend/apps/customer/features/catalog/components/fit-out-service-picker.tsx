"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, Dialog, buttonStyles, cn } from "@vsolve/ui";

import {
  FIT_OUT_SERVICE_OPTIONS,
  fitOutServiceArtwork,
  type FitOutServiceOption,
} from "@/features/requirement/model/fit-out-services";

function requestHref(serviceSlug: string, option: FitOutServiceOption): string {
  const query = new URLSearchParams({ selected_service: option.value });
  return `/requests/new/${serviceSlug}?${query.toString()}`;
}

function DetailList({
  title,
  items,
  tone,
}: {
  title: string;
  items: readonly string[];
  tone: "included" | "excluded";
}) {
  return (
    <section
      className={cn(
        "rounded-card border p-4",
        tone === "included"
          ? "border-success-line bg-success-surface"
          : "border-line bg-surface-sunken",
      )}
    >
      <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">
        {title}
      </h3>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-text">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span
              aria-hidden="true"
              className={tone === "included" ? "font-bold text-success-text" : "text-text-muted"}
            >
              {tone === "included" ? "+" : "-"}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FitOutCard({
  option,
  onOpen,
}: {
  option: FitOutServiceOption;
  onOpen: (option: FitOutServiceOption) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(option)}
      className="group block h-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-action"
    >
      <Card className="h-full overflow-hidden border-line-strong p-0 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-action/60 group-hover:shadow-md">
        <div className="p-4">
          <div className="relative overflow-hidden rounded-[18px] border border-white/10 bg-surface-sunken">
            <div
              aria-hidden="true"
              className="h-36 bg-cover bg-center sm:h-40"
              style={{ backgroundImage: `url("${fitOutServiceArtwork(option)}")` }}
            />
            <span className="absolute left-3 top-3 rounded-full bg-surface/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-text shadow-sm backdrop-blur">
              {option.eyebrow}
            </span>
          </div>

          <div className="mt-4">
            <h3 className="text-base font-bold text-text">{option.label}</h3>
            <p className="mt-1 text-sm leading-6 text-text-secondary">{option.description}</p>
          </div>

          <ul className="mt-3 flex flex-wrap gap-2">
            {option.facts.map((fact) => (
              <li
                key={fact}
                className="rounded-full bg-surface-sunken px-2.5 py-1 text-xs font-medium text-text-secondary"
              >
                {fact}
              </li>
            ))}
          </ul>

          <p className="mt-4 text-sm font-semibold text-text-link group-hover:underline">
            View details and choose
          </p>
        </div>
      </Card>
    </button>
  );
}

export function FitOutServicePicker({ serviceSlug }: { serviceSlug: string }) {
  const [selected, setSelected] = useState<FitOutServiceOption | null>(null);

  return (
    <section className="border-y border-line py-7">
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-text-muted">
          Pick the closest service
        </p>
        <h2 className="mt-2 text-xl font-bold text-text">Choose one fit-out type</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          No typing needed. Open a service, check what is included and not included, then continue
          with that selection.
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {FIT_OUT_SERVICE_OPTIONS.map((option) => (
          <FitOutCard key={option.value} option={option} onOpen={setSelected} />
        ))}
      </div>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={selected?.label ?? "Service details"}
        description={selected?.description}
        className="max-w-4xl"
        footer={
          selected === null ? null : (
            <>
              <Button variant="outline" onClick={() => setSelected(null)}>
                Close
              </Button>
              <Link
                href={requestHref(serviceSlug, selected)}
                className={buttonStyles({ size: "md" })}
              >
                Continue with this service
              </Link>
            </>
          )
        }
      >
        {selected === null ? null : (
          <div className="space-y-5 pb-3">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="rounded-card border border-line bg-surface-sunken p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-text-muted">
                  Good fit when
                </p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {selected.facts.map((fact) => (
                    <li
                      key={fact}
                      className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-text-secondary"
                    >
                      {fact}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm leading-6 text-text-secondary">
                  We will save this as your service selection and ask only for location and timing
                  next.
                </p>
              </div>
              <div
                aria-hidden="true"
                className="min-h-44 rounded-[20px] bg-cover bg-center"
                style={{ backgroundImage: `url("${fitOutServiceArtwork(selected)}")` }}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <DetailList title="What is included" items={selected.included} tone="included" />
              <DetailList title="What is not included" items={selected.notIncluded} tone="excluded" />
            </div>

            <section className="rounded-card border border-line bg-surface p-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">
                FAQs
              </h3>
              <div className="mt-3 divide-y divide-line">
                {selected.faqs.map((faq) => (
                  <details key={faq.question} className="group py-3 first:pt-0 last:pb-0">
                    <summary className="cursor-pointer text-sm font-semibold text-text marker:text-text-muted">
                      {faq.question}
                    </summary>
                    <p className="mt-2 text-sm leading-6 text-text-secondary">{faq.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          </div>
        )}
      </Dialog>
    </section>
  );
}
