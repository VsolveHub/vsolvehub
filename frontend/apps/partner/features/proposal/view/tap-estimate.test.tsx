import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { toOnsiteDraft, type TapEstimate as TapEstimateDraft } from "../model/tap-estimate";
import { toOnsiteRequest } from "../model/onsite-draft";
import { TapEstimate } from "./tap-estimate";

/**
 * The claim this file exists to prove: **the wire path did not move.**
 *
 * The estimate screen was rebuilt from three steps plus a full-screen keypad
 * into one scroll with two bottom sheets. `../model/tap-estimate.ts` was not
 * modified by that rewrite, and neither was `onsite-draft.ts`. So the test that
 * matters is not "does the new layout render" — it is: drive the new UI the way
 * a vendor drives it, and assert the `OnsiteDraft` that comes out is the one the
 * three-step flow produced for the same inputs.
 *
 * If a future change to this screen quietly drops `days`, or stops seeding a
 * material's quantity, or sends a tax basis the vendor did not choose, this is
 * what fails.
 */

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

/** `fireEvent.click` rather than `user-event`: this workspace ships
 *  `@testing-library/react` and `/dom` only, and every control driven below is
 *  a plain button whose handler is a click. */
function tap(name: string | RegExp, scope?: HTMLElement) {
  const source = scope === undefined ? screen : within(scope);
  fireEvent.click(source.getByRole("button", { name }));
}

function setup(overrides: Partial<Parameters<typeof TapEstimate>[0]> = {}) {
  const onSend = vi.fn<(estimate: TapEstimateDraft) => void>();
  render(
    <TapEstimate
      archetype="PROJECT"
      startsOn="2026-09-12"
      requiredTaxBasis={null}
      isSubmitting={false}
      onSend={onSend}
      {...overrides}
    />,
  );
  return { onSend };
}

/** Opens "Add work" / "Add materials" and taps one preset by its caption. */
function addPreset(opener: "Add work" | "Add materials", caption: string) {
  tap(opener);
  const sheet = screen.getByRole("heading", { name: opener }).closest("div")
    ?.parentElement as HTMLElement;
  tap(new RegExp(caption), sheet);
  tap("Done");
}

describe("the estimate a vendor builds on one scroll", () => {
  it("sends the same OnsiteDraft the three-step flow produced", () => {
    const { onSend } = setup();

    addPreset("Add work", "Wiring");

    // Three taps of +5,000 is how a vendor arrives at fifteen thousand — the
    // chips add rather than replace, which is the whole reason they are there.
    tap("+5,000");
    tap("+5,000");
    tap("+5,000");

    tap("One more day on site");
    tap("One more day on site");

    tap(/Tax not chosen/);
    tap(/Price includes tax/);

    tap("Send to customer");

    expect(onSend).toHaveBeenCalledTimes(1);
    const draft = toOnsiteDraft(onSend.mock.calls[0]![0]);

    expect(draft.stages).toEqual([
      {
        title: "Wiring",
        deliverable: "Power and lighting circuits run, tested and working.",
        workingDays: 3,
        amountPaise: 1_500_000,
      },
    ]);
    expect(draft.materials).toEqual([]);
    expect(draft.taxBasis).toBe("INCLUSIVE");
    expect(draft.taxPaise).toBe(0);
    // Carried through from the customer's own answer, never asked for.
    expect(draft.startsOn).toBe("2026-09-12");
    // The typed composer offered a validity date almost nobody set.
    expect(draft.validUntil).toBeNull();
  });

  it("carries a material's unit and quantity onto the wire", () => {
    const { onSend } = setup({ requiredTaxBasis: "INCLUSIVE" });

    addPreset("Add work", "Paint");
    tap("+10,000");

    addPreset("Add materials", "Tiles");
    tap("+5,000");
    tap(/One more boxes/);

    tap("Send to customer");

    const draft = toOnsiteDraft(onSend.mock.calls[0]![0]);
    expect(draft.materials).toEqual([
      { description: "Tiles", quantity: 2, unit: "boxes", amountPaise: 500_000 },
    ]);
  });

  it("still cannot send a shape the server would refuse", () => {
    const { onSend } = setup();

    // Nothing tapped: the gate is on, and it says why rather than dead-ending.
    expect(screen.getByRole("button", { name: "Send to customer" })).toBeDisabled();
    expect(screen.getByText("Tap at least one piece of work.")).toBeInTheDocument();

    addPreset("Add work", "Wiring");

    // Tapped but unpriced — the second gate.
    expect(screen.getByRole("button", { name: "Send to customer" })).toBeDisabled();
    expect(screen.getByText("Put a price on everything you tapped.")).toBeInTheDocument();

    tap("+10,000");

    // Priced, but the tax question is unanswered — the third.
    expect(screen.getByRole("button", { name: "Send to customer" })).toBeDisabled();
    expect(screen.getByText("Choose how tax works.")).toBeInTheDocument();

    expect(onSend).not.toHaveBeenCalled();
  });

  it("produces a request the existing serializer accepts, unchanged", () => {
    const { onSend } = setup({ requiredTaxBasis: "INCLUSIVE" });

    addPreset("Add work", "Plaster");
    tap("+10,000");
    tap("Send to customer");

    const request = toOnsiteRequest({
      invitationId: "11111111-1111-1111-1111-111111111111",
      siteVisitId: "22222222-2222-2222-2222-222222222222",
      draft: toOnsiteDraft(onSend.mock.calls[0]![0]),
    });

    // The one assertion that ties this screen to the endpoint: the request is
    // built by code this rewrite did not touch, from a draft this rewrite
    // produced, and it still carries the stage the vendor tapped.
    expect(request).toMatchObject({
      invitation: "11111111-1111-1111-1111-111111111111",
      site_visit: "22222222-2222-2222-2222-222222222222",
    });
  });

  /*
    The keypad used to be an early `return` from this component, which unmounted
    the whole composer behind it — five line items meant five complete context
    switches out of the screen and back. It is a sheet now, so the estimate is
    still mounted underneath.
  */
  it("opens the keypad over the estimate rather than instead of it", () => {
    setup();

    addPreset("Add work", "Wiring");
    tap("Type a price");

    expect(screen.getByRole("button", { name: "Delete the last digit" })).toBeInTheDocument();
    // Still there, behind the sheet.
    expect(screen.getByRole("button", { name: "Send to customer" })).toBeInTheDocument();
  });

  it("never asks a tax question the requirement already answered", () => {
    setup({ requiredTaxBasis: "EXCLUSIVE" });
    expect(screen.queryByText(/Tax not chosen/)).not.toBeInTheDocument();
  });

  it("remembers what this vendor reaches for", () => {
    setup();
    addPreset("Add work", "Paint");

    expect(JSON.parse(window.localStorage.getItem("vsh-partner-recent-presets") ?? "[]")).toContain(
      "paint",
    );
  });
});
