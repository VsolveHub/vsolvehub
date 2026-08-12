"use client";

import { Field, Textarea } from "@vsolve/ui";
import type { ComponentType } from "react";

import {
  ACCESS_CONSTRAINTS,
  OPTIONAL_NOTE_MAX,
  isOptionalDetailSet,
  readOptionalDetail,
  validateOptionalDetail,
  type AccessConstraint,
  type CallbackWindow,
  type CommunicationChannel,
  type OptionalDetailIssue,
} from "../model/optional-details";
import { type OptionalDetail } from "../model/screens";
import { useRequirement } from "./requirement-context";

/**
 * The four optional extras — `M2-FE-207`, `FLOW-02`.
 *
 * Each was a screen before the flow audit. They are now panels the Customer
 * opens from review, and the difference is not cosmetic: a step is something
 * everybody walks through, a panel is something a minority chooses. Four steps
 * for four minorities is how a four-screen flow became eight.
 *
 * ## Nothing here has a save button
 *
 * Every change dispatches into the same draft as the rest of the requirement
 * and travels with the one submit on review. That is why these panels have no
 * pending state and no error state of their own to show: there is no request
 * behind them to be pending on. Inventing a "Saved" tick would be claiming a
 * round trip that never happened.
 *
 * ## What a panel may promise
 *
 * Nothing about a professional's behaviour. "Ask us to call you" is a request to
 * Vsolve, whose support desk can keep it. "Prefer WhatsApp" is a preference
 * recorded against channels the server already permits — it discloses no phone
 * number and grants nobody access to one, and the copy says so, because a
 * Customer reading "WhatsApp" reasonably assumes their number just moved.
 */

/* --------------------------------------------------------------------------
   Copy
   -------------------------------------------------------------------------- */

/** The heading and the one line under it, per panel. */
export const OPTIONAL_DETAIL_INTRO: Record<OptionalDetail, string> = {
  callback_preference:
    "If it is easier to explain out loud, we will ring you. This is us calling, not a professional — nobody sees your number from here.",
  site_visit_interest:
    "Some jobs cannot be quoted from photos. Tell us you are open to a visit and professionals can offer one. If a visit carries a fee, you will see the amount and agree to it first — nothing is charged from here.",
  access_constraints:
    "Anything that makes getting to the work harder. Professionals price these in, so saying it now avoids a surprise on the day.",
  preferred_communication:
    "Which of these to try first once you are working with someone. Your number is only shared after you choose a professional, whichever you pick here.",
};

const CALLBACK_WINDOW_LABELS: Record<CallbackWindow, string> = {
  MORNING: "Morning (9am – 12pm)",
  AFTERNOON: "Afternoon (12pm – 5pm)",
  EVENING: "Evening (5pm – 8pm)",
  ANY: "Any time is fine",
};

const CALLBACK_WINDOW_ORDER: readonly CallbackWindow[] = [
  "ANY",
  "MORNING",
  "AFTERNOON",
  "EVENING",
];

const ACCESS_CONSTRAINT_LABELS: Record<AccessConstraint, string> = {
  NO_LIFT: "No lift — stairs only",
  NO_PARKING: "Nowhere to park nearby",
  ENTRY_PERMISSION: "Entry needs permission or ID at the gate",
  RESTRICTED_HOURS: "Work is only allowed at certain hours",
  PETS_ON_SITE: "There are pets on site",
};

const CHANNEL_LABELS: Record<CommunicationChannel, string> = {
  CALL: "A phone call",
  WHATSAPP: "WhatsApp",
  IN_APP: "Messages in the app only",
};

const CHANNEL_ORDER: readonly CommunicationChannel[] = ["CALL", "WHATSAPP", "IN_APP"];

const ISSUE_COPY: Record<OptionalDetailIssue, string> = {
  RESTRICTED_HOURS_NEED_DETAIL:
    "Please say which hours. A professional cannot plan around a restriction we have not described, and will price for hours they may not be allowed to work.",
};

/* --------------------------------------------------------------------------
   Shared pieces
   -------------------------------------------------------------------------- */

/**
 * A checkbox or radio with its own label block.
 *
 * Written here rather than pulled from `packages/ui` on purpose: the shared
 * package is frozen mid-wave, and a choice control is exactly the sort of thing
 * two sessions invent twice on the same day. If Session B needs one, it goes
 * through the promotion request in execution plan §7 at a gate.
 */
function Choice({
  id,
  type,
  name,
  checked,
  onChange,
  label,
  hint,
}: {
  id: string;
  type: "checkbox" | "radio";
  name?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type={type}
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className={
          type === "radio"
            ? "mt-1 size-5 border-line text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            : "mt-1 size-5 rounded border-line text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        }
      />
      <label htmlFor={id} className="text-sm leading-6 text-text">
        {label}
        {hint ? <span className="mt-0.5 block text-text-secondary">{hint}</span> : null}
      </label>
    </div>
  );
}

/**
 * A capped note with a live remaining count.
 *
 * The count only appears near the cap. A counter present from character one
 * reads as a target, and none of these notes has a length anybody wants.
 */
function Note({
  id,
  label,
  description,
  value,
  onChange,
  invalid,
}: {
  id: string;
  label: string;
  description?: string;
  value: string;
  onChange: (text: string) => void;
  invalid?: boolean;
}) {
  const remaining = OPTIONAL_NOTE_MAX - value.length;

  return (
    <Field label={label} description={description}>
      <Textarea
        id={id}
        rows={3}
        maxLength={OPTIONAL_NOTE_MAX}
        value={value}
        aria-invalid={invalid === true ? true : undefined}
        aria-describedby={remaining <= 60 ? `${id}-remaining` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {remaining <= 60 ? (
        <p id={`${id}-remaining`} className="mt-1 text-sm text-text-secondary" role="status">
          {remaining} characters left
        </p>
      ) : null}
    </Field>
  );
}

/* --------------------------------------------------------------------------
   The panels
   -------------------------------------------------------------------------- */

function CallbackPanel() {
  const { state, dispatch } = useRequirement();
  const value = readOptionalDetail(state.optionalDetails, "callback_preference");

  function set(patch: Partial<typeof value>) {
    dispatch({
      type: "SET_OPTIONAL_DETAIL",
      key: "callback_preference",
      value: { ...value, ...patch },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Choice
        id="callback-requested"
        type="checkbox"
        checked={value.requested}
        onChange={(requested) => set({ requested })}
        label="Yes, give me a call about this"
      />

      {value.requested ? (
        <fieldset className="m-0 border-0 p-0">
          <legend className="text-sm font-semibold text-text">When suits you?</legend>
          <div className="mt-2 flex flex-col gap-2">
            {CALLBACK_WINDOW_ORDER.map((window) => (
              <Choice
                key={window}
                id={`callback-window-${window}`}
                type="radio"
                name="callback-window"
                checked={value.window === window}
                onChange={() => set({ window })}
                label={CALLBACK_WINDOW_LABELS[window]}
              />
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}

function SiteVisitPanel() {
  const { state, dispatch } = useRequirement();
  const value = readOptionalDetail(state.optionalDetails, "site_visit_interest");

  function set(patch: Partial<typeof value>) {
    dispatch({
      type: "SET_OPTIONAL_DETAIL",
      key: "site_visit_interest",
      value: { ...value, ...patch },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Choice
        id="site-visit-requested"
        type="checkbox"
        checked={value.requested}
        onChange={(requested) => set({ requested })}
        label="I am happy for someone to visit before quoting"
        hint="This is not a booking. A professional offers a visit, you see any fee, and you decide."
      />

      <Note
        id="site-visit-note"
        label="Anything a visitor should know?"
        description="Optional. When you are on site, which entrance, who to ask for."
        value={value.note}
        onChange={(note) => set({ note })}
      />
    </div>
  );
}

function AccessPanel() {
  const { state, dispatch } = useRequirement();
  const value = readOptionalDetail(state.optionalDetails, "access_constraints");
  const issue = validateOptionalDetail(state.optionalDetails, "access_constraints");

  function set(patch: Partial<typeof value>) {
    dispatch({
      type: "SET_OPTIONAL_DETAIL",
      key: "access_constraints",
      value: { ...value, ...patch },
    });
  }

  function toggle(constraint: AccessConstraint, checked: boolean) {
    set({
      constraints: checked
        ? [...value.constraints, constraint]
        : value.constraints.filter((entry) => entry !== constraint),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="m-0 border-0 p-0">
        <legend className="text-sm font-semibold text-text">
          Any of these apply?
        </legend>
        <div className="mt-2 flex flex-col gap-2">
          {ACCESS_CONSTRAINTS.map((constraint) => (
            <Choice
              key={constraint}
              id={`access-${constraint}`}
              type="checkbox"
              checked={value.constraints.includes(constraint)}
              onChange={(checked) => toggle(constraint, checked)}
              label={ACCESS_CONSTRAINT_LABELS[constraint]}
            />
          ))}
        </div>
      </fieldset>

      <Note
        id="access-note"
        label={
          value.constraints.includes("RESTRICTED_HOURS")
            ? "Which hours, and anything else about getting in"
            : "Anything else about getting in"
        }
        description="Optional unless you ticked restricted hours — then tell us which hours."
        value={value.note}
        onChange={(note) => set({ note })}
        invalid={issue !== null}
      />

      {issue !== null ? (
        <p role="alert" className="text-sm text-danger-text">
          {ISSUE_COPY[issue]}
        </p>
      ) : null}
    </div>
  );
}

function CommunicationPanel() {
  const { state, dispatch } = useRequirement();
  const value = readOptionalDetail(state.optionalDetails, "preferred_communication");

  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="text-sm font-semibold text-text">Try this first</legend>
      <div className="mt-2 flex flex-col gap-2">
        {CHANNEL_ORDER.map((channel) => (
          <Choice
            key={channel}
            id={`channel-${channel}`}
            type="radio"
            name="preferred-channel"
            checked={value.channel === channel}
            onChange={() =>
              dispatch({
                type: "SET_OPTIONAL_DETAIL",
                key: "preferred_communication",
                value: { channel },
              })
            }
            label={CHANNEL_LABELS[channel]}
          />
        ))}
      </div>
    </fieldset>
  );
}

const PANELS: Record<OptionalDetail, ComponentType> = {
  callback_preference: CallbackPanel,
  site_visit_interest: SiteVisitPanel,
  access_constraints: AccessPanel,
  preferred_communication: CommunicationPanel,
};

export interface OptionalDetailPanelProps {
  detail: OptionalDetail;
  /** The id of the disclosure button that controls this region. */
  labelledBy: string;
}

export function OptionalDetailPanel({ detail, labelledBy }: OptionalDetailPanelProps) {
  const Panel = PANELS[detail];

  return (
    <div
      // A region rather than a plain div: the disclosure buttons sit in a list
      // and, once one is open, the panel is what a keyboard user lands in next.
      // Naming it from the button that opened it is what tells them where they
      // are without a heading they never asked for.
      role="region"
      aria-labelledby={labelledBy}
      className="mt-2 rounded-control border border-line bg-surface p-4"
    >
      <p className="max-w-prose text-sm leading-6 text-text-secondary">
        {OPTIONAL_DETAIL_INTRO[detail]}
      </p>
      <div className="mt-4">
        <Panel />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Summaries
   -------------------------------------------------------------------------- */

/**
 * What the review row says about a panel the Customer has filled in.
 *
 * Null when they have not expressed anything — deliberately not "Not set",
 * because three of the four panels open on a default and a row reading "Phone
 * call" for someone who never opened it is the screen putting words in their
 * mouth.
 */
export function summariseOptionalDetail(
  bag: Readonly<Record<string, unknown>>,
  detail: OptionalDetail,
): string | null {
  if (!isOptionalDetailSet(bag, detail)) return null;

  switch (detail) {
    case "callback_preference": {
      const value = readOptionalDetail(bag, "callback_preference");
      return value.window === "ANY"
        ? "Call me any time"
        : `Call me — ${CALLBACK_WINDOW_LABELS[value.window].toLowerCase()}`;
    }

    case "site_visit_interest": {
      const value = readOptionalDetail(bag, "site_visit_interest");
      if (value.requested) return "Open to a site visit";
      return "Visit notes added";
    }

    case "access_constraints": {
      const value = readOptionalDetail(bag, "access_constraints");
      const parts = value.constraints.map((code) => ACCESS_CONSTRAINT_LABELS[code]);
      if (parts.length === 0) return "Access notes added";
      // Two named, then a count. A row that lists five constraints stops being
      // a summary and the Customer has to read it to find the one they wanted
      // to change.
      return parts.length <= 2
        ? parts.join(", ")
        : `${parts.slice(0, 2).join(", ")} and ${parts.length - 2} more`;
    }

    case "preferred_communication":
      return CHANNEL_LABELS[readOptionalDetail(bag, "preferred_communication").channel];

    default:
      return null;
  }
}

export { ACCESS_CONSTRAINT_LABELS, CALLBACK_WINDOW_LABELS, CHANNEL_LABELS, ISSUE_COPY };
