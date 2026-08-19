"use client";

import { Field, Input, Select } from "@vsolve/ui";

import { FieldLabel, ScreenHeading } from "@/features/booking/view/mobile-screen";
import { ChipGroup } from "@/features/booking/view/parts/chip-group";
import { Segmented } from "@/features/booking/view/parts/segmented";
import type { RequirementQuestionView } from "@/features/requirement/adapters";
import { fitsOnChips, fitsOnSegments, unitFor } from "../model/questions";
import { ServicePicker, hasServiceDetail } from "./parts/service-picker";
import { SqftCard } from "./parts/sqft-card";

/**
 * A5 · 1 — What needs doing?
 *
 * Four taps and a number. The customer is never asked to pick an archetype and
 * is never told how matching works — both are the platform's problem, inferred
 * server-side from these answers.
 *
 * ## The controls are chosen from the data
 *
 * A short choice list is a segmented track, a longer one is chips, a number is a
 * keypad card. Which questions exist, in what order, with what options, is the
 * catalogue's — so a variant that publishes a different brief still renders,
 * with the same four controls rather than a text box each.
 *
 * ## "Not sure" is a real answer
 *
 * The budget question is optional and its last option says so out loud. A
 * customer who does not know their budget on a project nobody has priced is the
 * ordinary case, and forcing a band makes them invent one — which is worse than
 * silence, because a vendor quotes against it.
 */

export interface WhatScreenProps {
  questions: readonly RequirementQuestionView[];
  answers: Readonly<Record<string, unknown>>;
  onAnswer: (questionCode: string, value: unknown) => void;
}

export function WhatScreen({ questions, answers, onAnswer }: WhatScreenProps) {
  return (
    <>
      <ScreenHeading title="What needs doing?" />

      {questions.map((question) => {
        const value = answers[question.code];

        if (question.kind === "number") {
          return (
            <SqftCard
              key={question.code}
              label={question.label}
              value={typeof value === "number" ? value : null}
              onChange={(next) => onAnswer(question.code, next)}
              hint={question.help}
              unit={unitFor(question)}
            />
          );
        }

        // A choice whose options the catalogue describes in detail gets cards
        // and a dialog, not chips: "Retail fit-out" and "Shell and core
        // completion" differ in what a vendor turns up expecting, and four words
        // is not enough to choose between them.
        if (question.kind === "choice" && hasServiceDetail(question.options ?? [])) {
          return (
            <div key={question.code}>
              <FieldLabel>{question.label}</FieldLabel>
              <ServicePicker
                options={question.options ?? []}
                value={typeof value === "string" ? value : null}
                onChange={(next) => onAnswer(question.code, next)}
              />
            </div>
          );
        }

        // A free-text answer keeps `Field`, which owns its own label — so this
        // branch must not add a second one above it.
        if (question.kind === "text") {
          return (
            <Field
              key={question.code}
              label={question.label}
              description={question.help}
              required={question.required}
            >
              <Input
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onAnswer(question.code, event.target.value)}
              />
            </Field>
          );
        }

        return (
          <div key={question.code}>
            <FieldLabel>{question.label}</FieldLabel>
            {question.kind === "choice" && fitsOnSegments(question) ? (
              <Segmented
                label={question.label}
                name={question.code}
                options={(question.options ?? []).map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                value={typeof value === "string" ? value : null}
                onChange={(next) => onAnswer(question.code, next)}
              />
            ) : question.kind === "choice" && fitsOnChips(question) ? (
              <ChipGroup
                label={question.label}
                name={question.code}
                options={(question.options ?? []).map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                value={typeof value === "string" ? value : null}
                onChange={(next) => onAnswer(question.code, next)}
              />
            ) : question.kind === "boolean" ? (
              <Segmented
                label={question.label}
                name={question.code}
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ]}
                value={value === true ? "yes" : value === false ? "no" : null}
                onChange={(next) => onAnswer(question.code, next === "yes")}
              />
            ) : (
              // A choice list too long for chips. A `<select>` rather than a
              // wall of cards: the catalogue published no detail for these, so
              // there is nothing a card would show that the option label does
              // not already say.
              <Select
                aria-label={question.label}
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onAnswer(question.code, event.target.value)}
              >
                <option value="">Choose one</option>
                {(question.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
            {question.help !== undefined && question.kind === "choice" ? (
              <p className="mt-1.5 text-xs leading-5 text-text-muted">{question.help}</p>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
