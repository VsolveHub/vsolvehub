"use client";

import { Button, Dialog, cn } from "@vsolve/ui";
import { useState } from "react";

import {
  FIT_OUT_SERVICE_OPTIONS,
  fitOutServiceArtwork,
  type FitOutServiceOption,
} from "@/features/requirement/model/fit-out-services";

/**
 * Choosing the service, as cards you can open rather than labels you must guess.
 *
 * ## Why this is not the chip group
 *
 * Chips are right for a short scale — home / office / shop — where the label is
 * the whole answer. This question is not that. "Retail fit-out" and "Shell and
 * core completion" differ in what is included, what is excluded and what a
 * vendor will turn up expecting, and a customer picking between them from four
 * words is guessing at a decision that shapes every quote they receive.
 *
 * The catalogue publishes all of it — an eyebrow, the facts, an included list,
 * an excluded list and FAQs — and until now that detail lived on a service page
 * the flow no longer visits. So it moves here: the card carries enough to
 * recognise the right one, and the dialog carries enough to be sure.
 *
 * ## The card opens; the dialog commits
 *
 * Tapping a card does **not** answer the question. It opens the detail, and the
 * dialog's own action is what selects — so Escape, the backdrop and Close all
 * leave the previous answer alone. Same rule as every other dialog in this app,
 * and it matters more here than most: this is the answer the whole brief hangs
 * off, and changing it by brushing a card would be silent.
 */

export interface ServicePickerProps {
  /** The catalogue's own options, in the catalogue's order. */
  options: readonly { value: string; label: string; description?: string }[];
  value: string | null;
  onChange: (value: string) => void;
}

/**
 * The published detail for one option, when the catalogue has it.
 *
 * Matched on the option's own code. An option with no detail still renders — as
 * a plain card with its label and description — rather than being dropped,
 * because the server's list is the authority on what may be chosen and this is
 * only the authority on how much can be said about it.
 */
function detailFor(value: string): FitOutServiceOption | null {
  return FIT_OUT_SERVICE_OPTIONS.find((option) => option.value === value) ?? null;
}

/** True when enough of the list has published detail to be worth cards. */
export function hasServiceDetail(
  options: readonly { value: string }[],
): boolean {
  if (options.length === 0) return false;
  return options.some((option) => detailFor(option.value) !== null);
}

export function ServicePicker({ options, value, onChange }: ServicePickerProps) {
  const [open, setOpen] = useState<string | null>(null);
  /**
   * Whether the whole list is showing.
   *
   * Once a service is chosen the other three are answered questions, and leaving
   * them on the screen means scrolling past options you have already rejected to
   * reach the next one. So the list collapses to the choice.
   *
   * Browsing again is **not** un-choosing: the answer survives until the dialog
   * commits a different one, so opening the list and closing it leaves the brief
   * exactly as it was.
   */
  const [isBrowsing, setIsBrowsing] = useState(false);

  const opened = open === null ? null : detailFor(open);
  const openedOption = options.find((option) => option.value === open) ?? null;
  const chosenOption = options.find((option) => option.value === value) ?? null;

  const showList = chosenOption === null || isBrowsing;

  return (
    <div className="flex flex-col gap-2.5">
      {chosenOption !== null && !isBrowsing ? (
        <ChosenService
          option={chosenOption}
          detail={detailFor(chosenOption.value)}
          onViewDetails={() => setOpen(chosenOption.value)}
          onChange={() => setIsBrowsing(true)}
        />
      ) : null}

      {showList ? (
        <>
          {/* Two up on a phone, wider as the screen allows. A card at this size
              carries what distinguishes one service from another — the picture,
              the name, a line — and nothing else: the facts, the inclusions and
              the exclusions are in the dialog, where they are read once rather
              than repeated four times down the page. */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {options.map((option) => (
              <ServiceTile
                key={option.value}
                option={option}
                detail={detailFor(option.value)}
                isChosen={value === option.value}
                onOpen={() => setOpen(option.value)}
              />
            ))}
          </div>

          {chosenOption !== null ? (
            <Button variant="ghost" onClick={() => setIsBrowsing(false)}>
              Keep {chosenOption.label}
            </Button>
          ) : null}
        </>
      ) : null}

      <Dialog
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
        title={openedOption?.label ?? "Service details"}
        description={openedOption?.description ?? opened?.description}
        footer={
          open === null ? null : (
            <>
              <Button variant="ghost" onClick={() => setOpen(null)}>
                Close
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  onChange(open);
                  setOpen(null);
                  // Committing ends browsing: the list has done its job and the
                  // three unchosen services stop being on the screen.
                  setIsBrowsing(false);
                }}
              >
                Continue with this
              </Button>
            </>
          )
        }
      >
        {opened === null ? (
          <p className="py-2 text-sm leading-6 text-text-secondary">
            We will save this as your service selection and ask about the site and
            timing next.
          </p>
        ) : (
          <div className="flex flex-col gap-4 pb-2">
            <div
              aria-hidden
              className="h-36 rounded-card bg-cover bg-center"
              style={{ backgroundImage: `url("${fitOutServiceArtwork(opened)}")` }}
            />

            <div className="flex flex-wrap gap-1.5">
              {opened.facts.map((fact) => (
                <span
                  key={fact}
                  className="rounded-full bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-text-secondary"
                >
                  {fact}
                </span>
              ))}
            </div>

            {/* Included and excluded, in that order and never merged. The
                exclusions are the more useful half — they are the most common
                reason two quotes that look alike are not. */}
            <DetailList title="What is included" items={opened.included} tone="included" />
            <DetailList title="What is not included" items={opened.notIncluded} tone="excluded" />

            {opened.faqs.length > 0 ? (
              <section className="rounded-card border border-line bg-surface p-3.5">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-secondary">
                  Common questions
                </h3>
                <div className="mt-2 divide-y divide-line">
                  {opened.faqs.map((faq) => (
                    <details key={faq.question} className="py-2.5 first:pt-0 last:pb-0">
                      <summary className="cursor-pointer text-[13px] font-semibold text-text">
                        {faq.question}
                      </summary>
                      <p className="mt-1.5 text-[13px] leading-5 text-text-secondary">
                        {faq.answer}
                      </p>
                    </details>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </Dialog>
    </div>
  );
}

/**
 * One service in the grid.
 *
 * Deliberately thin. At two columns on a 390px screen a tile is about 175px
 * wide, and everything that will not read at that size belongs in the dialog:
 * the fact pills wrap to four lines, the inclusion list is unreadable, and the
 * description earns its place only clamped to two lines.
 *
 * What survives is what tells four services apart — the picture, the eyebrow and
 * the name. That is the job of a grid: recognition, not comparison.
 */
function ServiceTile({
  option,
  detail,
  isChosen,
  onOpen,
}: {
  option: { value: string; label: string; description?: string };
  detail: FitOutServiceOption | null;
  isChosen: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${option.label}.${isChosen ? " Currently selected." : ""} Open details`}
      className={cn(
        "flex flex-col overflow-hidden rounded-[14px] border text-left transition-colors duration-fast",
        isChosen
          ? "border-2 border-action-secondary bg-surface"
          : "border-line bg-surface hover:bg-surface-hover",
      )}
    >
      {detail !== null ? (
        <span
          aria-hidden
          className="relative block aspect-[4/3] bg-cover bg-center"
          style={{ backgroundImage: `url("${fitOutServiceArtwork(detail)}")` }}
        >
          <span className="absolute inset-x-1.5 top-1.5 line-clamp-1 rounded-full bg-surface/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-text">
            {detail.eyebrow}
          </span>
          {isChosen ? (
            <span className="absolute bottom-1.5 right-1.5 rounded-full bg-action-secondary px-1.5 py-0.5 text-[9px] font-bold text-action-secondary-text">
              Selected
            </span>
          ) : null}
        </span>
      ) : null}

      <span className="flex flex-1 flex-col p-2.5">
        <span className="text-[13.5px] font-bold leading-[18px] text-text">
          {option.label}
        </span>
        {option.description ?? detail?.description ? (
          <span className="mt-1 line-clamp-2 text-[11.5px] leading-4 text-text-muted">
            {option.description ?? detail?.description}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * The service once it is chosen, and the way back.
 *
 * This replaces the list rather than sitting above it. Three rejected options
 * left on screen are three things to scroll past on the way to the next
 * question, and they invite second-guessing a decision the customer has already
 * made — which is the opposite of what a brief should feel like.
 *
 * Two actions, and they are different: **View details** reopens the same dialog
 * for a fact they want to check, **Change** reopens the grid. Collapsing them
 * into one would make checking an inclusion list feel like undoing the choice.
 */
function ChosenService({
  option,
  detail,
  onViewDetails,
  onChange,
}: {
  option: { value: string; label: string; description?: string };
  detail: FitOutServiceOption | null;
  onViewDetails: () => void;
  onChange: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-[14px] border-2 border-action-secondary bg-surface">
      <div className="flex gap-3 p-3">
        {detail !== null ? (
          <span
            aria-hidden
            className="h-16 w-20 shrink-0 rounded-control bg-cover bg-center"
            style={{ backgroundImage: `url("${fitOutServiceArtwork(detail)}")` }}
          />
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[15px] font-bold leading-5 text-text">{option.label}</p>
            {/* The state in words, not only in the border weight. */}
            <span className="shrink-0 rounded-full bg-action-secondary px-2 py-0.5 text-[10px] font-bold text-action-secondary-text">
              Selected
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-[18px] text-text-secondary">
            {option.description ?? detail?.description}
          </p>
        </div>
      </div>

      {detail !== null && detail.facts.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-t border-line px-3 py-2">
          {detail.facts.map((fact) => (
            <span
              key={fact}
              className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-text-secondary"
            >
              {fact}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex border-t border-line">
        <button
          type="button"
          onClick={onViewDetails}
          className="min-h-11 flex-1 border-r border-line text-[13px] font-semibold text-text-link hover:bg-surface-hover"
        >
          View details
        </button>
        <button
          type="button"
          onClick={onChange}
          className="min-h-11 flex-1 text-[13px] font-semibold text-text-secondary hover:bg-surface-hover"
        >
          Change
        </button>
      </div>
    </div>
  );
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
  if (items.length === 0) return null;

  return (
    <section
      className={cn(
        "rounded-card border p-3.5",
        tone === "included"
          ? "border-success-line bg-success-surface"
          : "border-line bg-surface-sunken",
      )}
    >
      <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-secondary">
        {title}
      </h3>
      <ul className="mt-2 flex list-none flex-col gap-1.5 p-0 text-[13px] leading-5 text-text">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span
              aria-hidden
              className={
                tone === "included" ? "font-bold text-success-text" : "text-text-muted"
              }
            >
              {tone === "included" ? "+" : "−"}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
