"use client";

import { Button, Card, ErrorState, Field, Input, Select, Textarea } from "@vsolve/ui";
import { useState } from "react";
import type { Schemas } from "@vsolve/api-client";

import { ruleFailure } from "../model/failures";
import {
  DEPENDENCY_LABELS,
  MODE_LABELS,
  REASON_MAX_LENGTH,
  REASON_MIN_LENGTH,
  validateDraft,
  type DraftInput,
} from "../model/lifecycle";
import { useProposeRule } from "../queries";

/**
 * Proposing a rule — the maker half of maker-checker.
 *
 * ## Why this is a form of ids, not a picker
 *
 * The published contract has no Operations read that lists service variants, so
 * a searchable picker here would have to be backed by something invented. The
 * form takes the ids the operator already has in front of them and says where to
 * get them. When a variant read publishes, this becomes a picker; until then it
 * does not pretend to be one.
 *
 * ## Proposing is not deciding
 *
 * This is the one write on the surface an operator may take alone, precisely
 * because it changes nothing: the draft governs no bookings until a second
 * person activates it. The confirmation copy says so, so nobody proposes a rule
 * believing they have just applied it.
 */

const EMPTY: DraftInput = {
  leftVariantId: "",
  rightVariantId: "",
  mode: "",
  dependency: "NONE",
  effectiveFrom: "",
  effectiveTo: "",
  changeReason: "",
};

/**
 * A local wall-clock entry becomes an absolute instant.
 *
 * `datetime-local` has no offset, so the operator is naming a time in their own
 * timezone. Sending the raw string would let the server read it as UTC and shift
 * an Indian effective date by five and a half hours.
 */
function toInstant(localValue: string): string {
  return new Date(localValue).toISOString();
}

export function ProposeRule({ onProposed }: { onProposed: (ruleId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState<DraftInput>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const propose = useProposeRule();

  const errors = validateDraft(input);
  const showErrors = submitted;
  const failure = ruleFailure(propose.error);

  function set<K extends keyof DraftInput>(key: K, value: DraftInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  function submit() {
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;

    propose.mutate(
      {
        leftVariantId: input.leftVariantId,
        rightVariantId: input.rightVariantId,
        mode: input.mode as Schemas["ModeEnum"],
        dependency: input.dependency,
        effectiveFrom: toInstant(input.effectiveFrom),
        effectiveTo: input.effectiveTo ? toInstant(input.effectiveTo) : null,
        changeReason: input.changeReason,
      },
      {
        onSuccess: (rule) => {
          setInput(EMPTY);
          setSubmitted(false);
          setOpen(false);
          onProposed(rule.id);
        },
      },
    );
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Propose a rule
      </Button>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="text-base font-bold text-text">Propose a compatibility rule</h2>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        This saves a draft. It governs no bookings until another Operations
        reviewer activates it — you will not be able to activate it yourself.
      </p>

      {failure ? (
        <ErrorState
          inline
          className="mt-4"
          severity={failure.severity === "warning" ? "warning" : "error"}
          title={failure.title}
          message={failure.message}
        />
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field
          label="First service variant"
          description="The variant id, copied from the catalog."
          required
          error={showErrors ? errors.leftVariantId : undefined}
        >
          <Input
            value={input.leftVariantId}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => set("leftVariantId", event.target.value)}
          />
        </Field>

        <Field
          label="Second service variant"
          description="The other side of the pair."
          required
          error={showErrors ? errors.rightVariantId : undefined}
        >
          <Input
            value={input.rightVariantId}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => set("rightVariantId", event.target.value)}
          />
        </Field>

        <Field
          label="How they may be booked together"
          required
          error={showErrors ? errors.mode : undefined}
        >
          <Select
            placeholder="Choose one"
            value={input.mode}
            onChange={(event) => set("mode", event.target.value as DraftInput["mode"])}
          >
            {Object.entries(MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Required order"
          description="Only meaningful when the work happens one job at a time."
          error={showErrors ? errors.dependency : undefined}
        >
          <Select
            value={input.dependency}
            onChange={(event) =>
              set("dependency", event.target.value as Schemas["DependencyEnum"])
            }
          >
            {Object.entries(DEPENDENCY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Starts applying"
          description="Your local time."
          required
          error={showErrors ? errors.effectiveFrom : undefined}
        >
          <Input
            type="datetime-local"
            value={input.effectiveFrom}
            onChange={(event) => set("effectiveFrom", event.target.value)}
          />
        </Field>

        <Field
          label="Stops applying"
          description="Leave empty for a rule with no end date."
          error={showErrors ? errors.effectiveTo : undefined}
        >
          <Input
            type="datetime-local"
            value={input.effectiveTo}
            onChange={(event) => set("effectiveTo", event.target.value)}
          />
        </Field>
      </div>

      <Field
        className="mt-4"
        label="Why this rule is needed"
        description={`The reviewer reads this before deciding. At least ${REASON_MIN_LENGTH} characters.`}
        required
        error={showErrors ? errors.changeReason : undefined}
      >
        <Textarea
          rows={3}
          maxLength={REASON_MAX_LENGTH}
          value={input.changeReason}
          onChange={(event) => set("changeReason", event.target.value)}
        />
      </Field>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={submit} loading={propose.isPending} loadingLabel="Saving the draft">
          Save draft
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setSubmitted(false);
            propose.reset();
          }}
        >
          Cancel
        </Button>
      </div>
    </Card>
  );
}
