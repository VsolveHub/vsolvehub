"use client";

import { Field, Input, Select } from "@vsolve/ui";
import { Check, X } from "lucide-react";

import { FieldLabel, ScreenHeading } from "@/features/booking/view/mobile-screen";
import type { RequirementQuestionView } from "@/features/requirement/adapters";
import { iconForOption } from "../model/option-icons";
import { unitFor } from "../model/questions";
import { OptionTiles } from "./parts/option-tiles";
import { ServicePicker, hasServiceDetail } from "./parts/service-picker";
import { SqftCard } from "./parts/sqft-card";

/**
 * Step 1 of 2 — What needs doing?
 *
 * A few taps and maybe a number. The Customer is never asked to pick an
 * archetype, never told how matching works, and — since the M2-revamp — never
 * asked to *describe* anything: every choice is a picture-first tile, and the
 * one thing typed is a quantity on a keypad.
 *
 * ## The controls are chosen from the data
 *
 * A choice whose options carry published detail gets cards and a dialog
 * (`ServicePicker`); every other choice gets icon tiles; a boolean is two
 * tiles; a number is a keypad card. Which questions exist, in what order, with
 * what options, is the catalogue's — so a variant that publishes a different
 * brief still renders with the same four controls rather than a text box each.
 *
 * ## The text branch is a fact field, not a description box
 *
 * The catalogue can still publish a `TEXT` question and it renders as one
 * single-line input, because a required question with no control is a flow
 * whose Continue is disabled for a reason nothing on screen explains. It is a
 * seam, not an invitation: the M2-revamp's capture rule is that questions
 * collect choice/number/boolean facts, and a category configured with prose
 * questions should be fixed in the catalogue.
 */

export interface WhatScreenProps {
  questions: readonly RequirementQuestionView[];
  answers: Readonly<Record<string, unknown>>;
  onAnswer: (questionCode: string, value: unknown) => void;
}

/** Above this many options a grid stops being scannable and a list wins. */
const MAXIMUM_TILE_OPTIONS = 8;

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
        // and a dialog, not tiles: "Retail fit-out" and "Shell and core
        // completion" differ in what a vendor turns up expecting, and an icon
        // with four words is not enough to choose between them.
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

        // The fact-field seam — see the header note. Single line, never a
        // textarea: this flow does not collect descriptions.
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
            {question.kind === "choice" &&
            (question.options ?? []).length <= MAXIMUM_TILE_OPTIONS ? (
              <OptionTiles
                label={question.label}
                name={question.code}
                options={(question.options ?? []).map((option) => ({
                  value: option.value,
                  label: option.label,
                  description: option.description,
                  icon: iconForOption(option),
                }))}
                value={typeof value === "string" ? value : null}
                onChange={(next) => onAnswer(question.code, next)}
              />
            ) : question.kind === "boolean" ? (
              <OptionTiles
                label={question.label}
                name={question.code}
                columns={2}
                options={[
                  { value: "yes", label: "Yes", icon: Check },
                  { value: "no", label: "No", icon: X },
                ]}
                value={value === true ? "yes" : value === false ? "no" : null}
                onChange={(next) => onAnswer(question.code, next === "yes")}
              />
            ) : (
              // A choice list too long for a tile grid. A `<select>` rather
              // than a wall of tiles: past eight options a grid is a scroll,
              // and scanning a scroll of icons is slower than a list.
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
