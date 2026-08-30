"use client";

import { Card, Field, Input, cn } from "@vsolve/ui";
import { Check, X } from "lucide-react";

import { iconForOption } from "@/features/project-request/model/option-icons";
import { OptionTiles, toggleValue } from "@/features/project-request/view/parts/option-tiles";
import type { RequirementQuestionView } from "../adapters";
import { shouldShowTextQuestion } from "../model/event-brief";
import { useRequirement } from "./requirement-context";

/**
 * Screen 1 — What needs doing, on the desktop brief.
 *
 * The same server-authored question model as the phone screen, rendered with
 * the same rule: the Customer recognises, they do not read.
 *
 * ## Curated cards, or tiles — never an invented card
 *
 * The four fit-out options have authored artwork, facts and included/not-
 * included lists (`CHOICE_VISUALS`), and a choice whose *every* option is
 * curated renders those cards. Anything else — an occasion, a venue, a budget
 * band — renders the phone's icon tiles. This used to fall back to a hashed
 * gradient with "Illustrative selection" and "Mock scope only" printed on it,
 * which is placeholder copy in front of a paying Customer; the tiles say only
 * what the catalogue said.
 */

export interface WhatScreenProps {
  categoryName: string;
  questions: readonly RequirementQuestionView[];
  isChoosing?: boolean;
  onChoiceSelect?: (questionCode: string, value: string) => void;
  /**
   * Question codes the catalogue configured that this build cannot render.
   *
   * Passed in rather than hidden by the adapter, because a required question
   * with no control leaves "Next" disabled and nothing on screen explaining it.
   * See `toQuestionSet` for what lands here and why.
   */
  unsupportedQuestions?: readonly string[];
  /**
   * Suppresses this screen's own heading.
   *
   * The one-page brief wraps each capture screen in a numbered section that
   * supplies the heading, and two headings for one section is a broken document
   * outline rather than a cosmetic duplicate.
   */
  hideHeading?: boolean;
}

interface ChoiceOptionVisual {
  eyebrow: string;
  facts: readonly string[];
  included: readonly string[];
  notIncluded: readonly string[];
  palette: readonly [string, string, string];
  imageLabel: string;
}

const CHOICE_VISUALS: Record<string, ChoiceOptionVisual> = {
  "office-fit-out": {
    eyebrow: "Move-in ready workspace",
    facts: ["18 desks", "2 meeting rooms", "Power + data"],
    included: ["Partition layout", "Electrical and data points", "Ceiling and lighting", "Paint and basic finishes"],
    notIncluded: ["Loose furniture purchase", "IT hardware", "Brand signage"],
    palette: ["#0F2742", "#2E5C7A", "#D7E5EF"],
    imageLabel: "Office",
  },
  "retail-fit-out": {
    eyebrow: "Customer-facing floor",
    facts: ["Display wall", "Front counter", "Lighting plan"],
    included: ["Display wall carpentry", "Counter placement", "Track and ambient lighting", "Customer movement plan"],
    notIncluded: ["Inventory racks", "POS machines", "Exterior permissions"],
    palette: ["#5C3317", "#C26B3C", "#F4D3B0"],
    imageLabel: "Retail",
  },
  "hospitality-fit-out": {
    eyebrow: "Guest-facing space",
    facts: ["Seating zones", "Serve counter", "Hard-wearing finishes"],
    included: ["Counter and service zones", "Guest seating layout", "Wall and floor finishes", "Lighting mood plan"],
    notIncluded: ["Kitchen equipment", "Food licence work", "Loose tables and chairs"],
    palette: ["#214B42", "#6F9B6B", "#E1ECD8"],
    imageLabel: "Hospitality",
  },
  "shell-core-completion": {
    eyebrow: "Bare space finish-out",
    facts: ["Partitions", "Ceilings + flooring", "MEP coordination"],
    included: ["Internal partitions", "False ceiling scope", "Flooring base finish", "Electrical and plumbing coordination"],
    notIncluded: ["Structural changes", "Lift or common-area work", "Authority approvals"],
    palette: ["#38455B", "#7C8CA8", "#E7ECF5"],
    imageLabel: "Shell",
  },
};

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function choiceArtwork(
  option: { value: string; label: string; description?: string },
  visual: ChoiceOptionVisual,
): string {
  const [dark, mid, light] = visual.palette;

  const motif =
    option.value === "office-fit-out"
      ? '<rect x="22" y="24" width="50" height="18" rx="4" fill="rgba(255,255,255,0.18)" /><rect x="80" y="24" width="50" height="18" rx="4" fill="rgba(255,255,255,0.18)" /><rect x="138" y="24" width="50" height="18" rx="4" fill="rgba(255,255,255,0.18)" /><rect x="26" y="66" width="46" height="48" rx="8" fill="rgba(255,255,255,0.12)" /><rect x="84" y="66" width="46" height="48" rx="8" fill="rgba(255,255,255,0.12)" /><rect x="142" y="66" width="46" height="48" rx="8" fill="rgba(255,255,255,0.12)" /><path d="M18 132h164" stroke="rgba(255,255,255,0.22)" stroke-width="4" />'
      : option.value === "retail-fit-out"
        ? '<rect x="22" y="28" width="24" height="84" rx="6" fill="rgba(255,255,255,0.14)" /><rect x="54" y="40" width="24" height="72" rx="6" fill="rgba(255,255,255,0.14)" /><rect x="86" y="24" width="24" height="88" rx="6" fill="rgba(255,255,255,0.14)" /><rect x="118" y="38" width="24" height="74" rx="6" fill="rgba(255,255,255,0.14)" /><rect x="150" y="52" width="24" height="60" rx="6" fill="rgba(255,255,255,0.14)" /><path d="M18 132h164" stroke="rgba(255,255,255,0.22)" stroke-width="4" /><circle cx="36" cy="24" r="10" fill="rgba(255,255,255,0.18)" /><circle cx="76" cy="20" r="8" fill="rgba(255,255,255,0.12)" /><circle cx="152" cy="28" r="9" fill="rgba(255,255,255,0.18)" />'
        : option.value === "hospitality-fit-out"
          ? '<path d="M18 110c20-18 44-26 72-26s52 8 72 26v22H18z" fill="rgba(255,255,255,0.16)" /><rect x="26" y="76" width="18" height="30" rx="6" fill="rgba(255,255,255,0.12)" /><rect x="52" y="68" width="18" height="38" rx="6" fill="rgba(255,255,255,0.12)" /><rect x="78" y="62" width="18" height="44" rx="6" fill="rgba(255,255,255,0.12)" /><rect x="104" y="68" width="18" height="38" rx="6" fill="rgba(255,255,255,0.12)" /><rect x="130" y="76" width="18" height="30" rx="6" fill="rgba(255,255,255,0.12)" /><circle cx="40" cy="30" r="7" fill="rgba(255,255,255,0.2)" /><circle cx="100" cy="20" r="7" fill="rgba(255,255,255,0.2)" /><circle cx="160" cy="30" r="7" fill="rgba(255,255,255,0.2)" />'
          : '<rect x="24" y="24" width="152" height="92" rx="12" fill="rgba(255,255,255,0.10)" /><path d="M24 58h152M24 86h152M72 24v92M120 24v92" stroke="rgba(255,255,255,0.2)" /><rect x="34" y="34" width="34" height="18" rx="4" fill="rgba(255,255,255,0.16)" /><rect x="132" y="96" width="34" height="14" rx="4" fill="rgba(255,255,255,0.16)" />';

  const title = visual.imageLabel;
  const subtitle = option.description ?? visual.eyebrow;

  return svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140" fill="none" role="img" aria-label="${escapeXml(title)}">
      <defs>
        <linearGradient id="g" x1="20" y1="18" x2="184" y2="132" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="${dark}" />
          <stop offset="55%" stop-color="${mid}" />
          <stop offset="100%" stop-color="${light}" />
        </linearGradient>
      </defs>
      <rect width="200" height="140" rx="20" fill="url(#g)" />
      <circle cx="176" cy="22" r="26" fill="rgba(255,255,255,0.06)" />
      <circle cx="30" cy="118" r="34" fill="rgba(255,255,255,0.05)" />
      <rect x="18" y="16" width="164" height="108" rx="16" fill="rgba(10,18,32,0.12)" />
      ${option.value === "shell-core-completion" ? '<path d="M24 112l22-24 28 18 24-22 26 14 30-30 24 16" stroke="rgba(255,255,255,0.18)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />' : ""}
      ${motif}
      <text x="24" y="126" fill="rgba(255,255,255,0.94)" font-family="system-ui, sans-serif" font-size="16" font-weight="700">${escapeXml(title)}</text>
      <text x="24" y="36" fill="rgba(255,255,255,0.78)" font-family="system-ui, sans-serif" font-size="10" font-weight="700" letter-spacing="1.2">${escapeXml(subtitle)}</text>
    </svg>
  `);
}

type Dispatch = ReturnType<typeof useRequirement>["dispatch"];

function QuestionHeading({ question }: { question: RequirementQuestionView }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-text">
        {question.label}
        {question.required ? (
          <span aria-hidden className="ml-0.5 text-danger-text">
            *
          </span>
        ) : (
          <span className="ml-1.5 font-normal text-text-muted">(optional)</span>
        )}
      </h3>
      {question.help ? <p className="mt-1 text-sm text-text-secondary">{question.help}</p> : null}
    </div>
  );
}

function selectedValues(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/** The authored fit-out cards. Only for a choice whose every option is curated. */
function renderCuratedChoice({
  question,
  value,
  dispatch,
  isChoosing,
  onChoiceSelect,
}: {
  question: RequirementQuestionView;
  value: unknown;
  dispatch: Dispatch;
  isChoosing: boolean;
  onChoiceSelect?: (questionCode: string, value: string) => void;
}) {
  const options = question.options ?? [];

  return (
    <section className="space-y-3">
      <QuestionHeading question={question} />

      <div role="radiogroup" aria-label={question.label} className="grid gap-3 md:grid-cols-2">
        {options.map((option, index) => {
          const checked = value === option.value;
          const visual = CHOICE_VISUALS[option.value];
          if (visual === undefined) return null;
          const image = choiceArtwork(option, visual);

          return (
            <label key={option.value} className="group block cursor-pointer">
              <input
                type="radio"
                name={question.code}
                checked={checked}
                disabled={isChoosing}
                onChange={() => {
                  dispatch({ type: "ANSWER", questionCode: question.code, value: option.value });
                  onChoiceSelect?.(question.code, option.value);
                }}
                className="sr-only"
              />

              <Card
                className={cn(
                  "h-full overflow-hidden border p-0 transition-all duration-200",
                  "focus-within:ring-2 focus-within:ring-action/30",
                  checked
                    ? "border-action bg-info-surface shadow-[0_0_0_1px_rgba(25,72,170,0.18)]"
                    : "border-line-strong hover:-translate-y-0.5 hover:border-action/50 hover:shadow-md",
                  isChoosing && "cursor-wait opacity-70",
                )}
              >
                <div className="p-5">
                  <div className="relative overflow-hidden rounded-[18px] border border-white/10 bg-surface-sunken">
                    <div
                      aria-hidden="true"
                      className="h-40 w-full bg-cover bg-center"
                      style={{ backgroundImage: `url("${image}")` }}
                    />
                    <div className="absolute left-3 top-3 rounded-full bg-surface/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text shadow-sm backdrop-blur">
                      {visual.eyebrow}
                    </div>
                    <div
                      className={cn(
                        "absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] shadow-sm backdrop-blur",
                        checked ? "bg-action text-white" : "bg-surface/90 text-text",
                      )}
                    >
                      {checked ? "Selected" : `Option ${index + 1}`}
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-base font-semibold text-text">{option.label}</p>
                    {option.description !== undefined ? (
                      <p className="mt-1 text-sm leading-6 text-text-secondary">{option.description}</p>
                    ) : null}

                    <ul className="mt-3 flex flex-wrap gap-2">
                      {visual.facts.map((fact) => (
                        <li
                          key={fact}
                          className="rounded-full bg-surface-sunken px-2.5 py-1 text-xs font-medium text-text-secondary"
                        >
                          {fact}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-card border border-success-line bg-success-surface p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text">
                          Included
                        </p>
                        <ul className="mt-2 space-y-1.5 text-xs leading-5 text-text-secondary">
                          {visual.included.map((item) => (
                            <li key={item} className="flex gap-1.5">
                              <span aria-hidden="true" className="text-success-text">
                                +
                              </span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="rounded-card border border-line bg-surface-sunken p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text">
                          Not included
                        </p>
                        <ul className="mt-2 space-y-1.5 text-xs leading-5 text-text-secondary">
                          {visual.notIncluded.map((item) => (
                            <li key={item} className="flex gap-1.5">
                              <span aria-hidden="true" className="text-text-muted">
                                -
                              </span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </label>
          );
        })}
      </div>
    </section>
  );
}

/** Icon tiles — single or multi — for every choice the catalogue did not curate. */
function renderTileChoice({
  question,
  value,
  dispatch,
  onChoiceSelect,
}: {
  question: RequirementQuestionView;
  value: unknown;
  dispatch: Dispatch;
  onChoiceSelect?: (questionCode: string, value: string) => void;
}) {
  const options = (question.options ?? []).map((option) => ({
    value: option.value,
    label: option.label,
    description: option.description,
    icon: iconForOption(option),
  }));

  return (
    <section className="space-y-3">
      <QuestionHeading question={question} />
      {question.kind === "multi" ? (
        <OptionTiles
          label={question.label}
          name={question.code}
          columns={3}
          options={options}
          values={selectedValues(value)}
          onToggle={(next) =>
            dispatch({
              type: "ANSWER",
              questionCode: question.code,
              value: toggleValue(selectedValues(value), next),
            })
          }
        />
      ) : (
        <OptionTiles
          label={question.label}
          name={question.code}
          columns={3}
          options={options}
          value={typeof value === "string" ? value : null}
          onChange={(next) => {
            dispatch({ type: "ANSWER", questionCode: question.code, value: next });
            onChoiceSelect?.(question.code, next);
          }}
        />
      )}
    </section>
  );
}

function renderQuestion({
  question,
  value,
  dispatch,
  isChoosing,
  onChoiceSelect,
}: {
  question: RequirementQuestionView;
  value: unknown;
  dispatch: Dispatch;
  isChoosing: boolean;
  onChoiceSelect?: (questionCode: string, value: string) => void;
}) {
  if (question.kind === "choice" || question.kind === "multi") {
    const curated =
      question.kind === "choice" &&
      (question.options ?? []).length > 0 &&
      (question.options ?? []).every((option) => CHOICE_VISUALS[option.value] !== undefined);
    return curated
      ? renderCuratedChoice({ question, value, dispatch, isChoosing, onChoiceSelect })
      : renderTileChoice({ question, value, dispatch, onChoiceSelect });
  }

  if (question.kind === "boolean") {
    return (
      <section className="space-y-3">
        <QuestionHeading question={question} />
        <OptionTiles
          label={question.label}
          name={question.code}
          columns={3}
          options={[
            { value: "yes", label: "Yes", icon: Check },
            { value: "no", label: "No", icon: X },
          ]}
          value={value === true ? "yes" : value === false ? "no" : null}
          onChange={(next) =>
            dispatch({ type: "ANSWER", questionCode: question.code, value: next === "yes" })
          }
        />
      </section>
    );
  }

  return (
    <Field
      key={question.code}
      label={question.label}
      description={question.help}
      required={question.required}
    >
      {question.kind === "number" ? (
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={typeof value === "number" ? String(value) : ""}
          onChange={(event) =>
            dispatch({
              type: "ANSWER",
              questionCode: question.code,
              value: event.target.value === "" ? null : Number(event.target.value),
            })
          }
        />
      ) : (
        // A single-line fact field, never a textarea. The M2-revamp removed
        // every describe-it-yourself seam from capture; a catalogue `TEXT`
        // question still renders so a required question cannot dead-end the
        // form, but it is an input for a fact, not a box for a paragraph.
        <Input
          value={typeof value === "string" ? value : ""}
          onChange={(event) =>
            dispatch({
              type: "ANSWER",
              questionCode: question.code,
              value: event.target.value,
            })
          }
        />
      )}
    </Field>
  );
}

export function WhatScreen({
  categoryName,
  questions,
  isChoosing = false,
  onChoiceSelect,
  unsupportedQuestions = [],
  hideHeading = false,
}: WhatScreenProps) {
  const { state, dispatch } = useRequirement();

  return (
    <div>
      {hideHeading ? null : (
        <h2 className="text-lg font-semibold text-text">What needs doing for {categoryName}?</h2>
      )}
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        Tap what fits. The site visit fills in the rest.
      </p>

      {unsupportedQuestions.length > 0 ? (
        <div
          role="alert"
          className="mt-4 rounded-card border border-warning-line bg-warning-surface p-4"
        >
          <p className="font-semibold text-text">
            This service is not fully set up for requests yet
          </p>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            Part of the form is missing on our side, so a request sent from here may be refused.
            Nothing you enter is charged for, and support can take the details over the phone
            instead.
          </p>
        </div>
      ) : null}

      {state.verdict !== null ? (
        <p
          // Polite rather than assertive: it updates as answers change, and an
          // assertive region would interrupt the Customer mid-question to read
          // out a sentence about what they just typed.
          aria-live="polite"
          className="mt-4 rounded-card border border-info-line bg-info-surface p-4 text-sm text-text"
        >
          {state.verdict.explanation}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-5">
        {questions.map((question) =>
          shouldShowTextQuestion(question, questions, state.answers) ? (
            <div key={question.code}>
              {renderQuestion({
                question,
                value: state.answers[question.code],
                dispatch,
                isChoosing,
                onChoiceSelect,
              })}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
