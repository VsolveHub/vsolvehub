import { render, screen, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

import { cart, cartItem, money, plan, planSet, planUnit, planUnitItem } from "../fixtures";
import { PlanComparison } from "./plan-comparison";

/**
 * The screen where a customer chooses how their booking is fulfilled.
 *
 * Every assertion below is about the same rule: the structure, the counts, the
 * timings and the money on screen are the server's answer, rendered. The tests
 * that matter most are the ones proving the four structures produce four
 * genuinely different screens — because the failure mode is a UI that shows
 * "your booking" identically whether it is one visit or three.
 */

const twoItemCart = cart({
  version: 4,
  items: [
    cartItem({ id: "item-1", service_name: "Fan installation" }),
    cartItem({ id: "item-2", service_name: "Geyser repair", variant_name: "Storage geyser" }),
  ],
});

function renderPlans(
  set: ReturnType<typeof planSet>,
  overrides: Partial<Parameters<typeof PlanComparison>[0]> = {},
) {
  const props = {
    planSet: set,
    cart: twoItemCart,
    selectedPlanId: null,
    isPricing: false,
    onSelect: vi.fn(),
    onContinue: vi.fn(),
    onReplan: vi.fn(),
    ...overrides,
  };
  render(<PlanComparison {...props} />);
  return props;
}

const sequentialPlan = plan({
  id: "plan-sequential",
  structure: "SINGLE_PARTNER_SEQUENTIAL",
  is_recommended: true,
  visit_count: 1,
  professional_count: 1,
  decisive_reasons: ["compatible_same_partner_sequential"],
  units: [
    planUnit({
      id: "u-1",
      items: [
        planUnitItem({ id: "pui-1", cart_item_id: "item-1" }),
        planUnitItem({ id: "pui-2", cart_item_id: "item-2" }),
      ],
    }),
  ],
});

const parallelPlan = plan({
  id: "plan-parallel",
  structure: "COORDINATED_PARALLEL",
  is_recommended: false,
  visit_count: 2,
  professional_count: 2,
  decisive_reasons: ["explicit_parallel_compatibility"],
  units: [
    planUnit({ id: "u-a", position: 0, items: [planUnitItem({ cart_item_id: "item-1" })] }),
    planUnit({
      id: "u-b",
      position: 1,
      items: [planUnitItem({ id: "pui-b", cart_item_id: "item-2" })],
    }),
  ],
});

const separatePlan = plan({
  id: "plan-separate",
  structure: "INDEPENDENT_VISITS",
  is_recommended: false,
  visit_count: 2,
  professional_count: 2,
  decisive_reasons: ["independent_visits_safe_default"],
  units: [
    planUnit({ id: "u-x", position: 0, items: [planUnitItem({ cart_item_id: "item-1" })] }),
    planUnit({
      id: "u-y",
      position: 1,
      starts_at: "2026-08-03T13:00:00Z",
      ends_at: "2026-08-03T14:00:00Z",
      items: [planUnitItem({ id: "pui-y", cart_item_id: "item-2" })],
    }),
  ],
});

const mixedPlan = plan({
  id: "plan-mixed",
  structure: "MIXED",
  is_recommended: false,
  visit_count: 2,
  professional_count: 2,
  decisive_reasons: ["compatible_lines_grouped", "visits_separated"],
  units: [
    planUnit({
      id: "u-m1",
      position: 0,
      items: [
        planUnitItem({ cart_item_id: "item-1" }),
        planUnitItem({ id: "pui-m", cart_item_id: "item-2" }),
      ],
    }),
    planUnit({ id: "u-m2", position: 1, items: [planUnitItem({ id: "pui-m2", cart_item_id: "item-2" })] }),
  ],
});

describe("structures are told apart", () => {
  it("says one professional does everything in a sequential plan", () => {
    renderPlans(planSet({ plans: [sequentialPlan] }));

    expect(screen.getByText("One professional, one visit")).toBeInTheDocument();
    expect(screen.getByText(/1 visit · 1 professional/)).toBeInTheDocument();
    // Both services in one unit, so one visit heading covers them.
    expect(screen.getByRole("heading", { name: "Visit 1" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Visit 2" })).not.toBeInTheDocument();
  });

  it("labels parallel units by professional rather than by visit order", () => {
    // Two people at once is not "visit 1 then visit 2", and numbering them that
    // way would read as a sequence the plan does not describe.
    renderPlans(planSet({ plans: [parallelPlan] }));

    expect(screen.getByText("Several professionals at the same time")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Professional 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Professional 2" })).toBeInTheDocument();
  });

  it("shows separate visits with their own distinct times", () => {
    renderPlans(planSet({ plans: [separatePlan] }));

    expect(screen.getByText("Separate visits")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Visit 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Visit 2" })).toBeInTheDocument();
    expect(screen.getByText(/Each job gets its own visit/)).toBeInTheDocument();
  });

  it("renders a mixed plan as its own structure, not as one of the other three", () => {
    renderPlans(planSet({ plans: [mixedPlan] }));

    expect(
      screen.getByText("A mix of shared and separate visits"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Some jobs can share a visit/)).toBeInTheDocument();
    expect(screen.getByText(/The rest need visits of their own/)).toBeInTheDocument();
  });
});

describe("choosing between alternatives", () => {
  it("separates the recommended plan from the rest without hiding either", () => {
    renderPlans(planSet({ plans: [sequentialPlan, separatePlan] }));

    expect(screen.getByText("Recommended")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Other options" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("preselects nothing and refuses to continue until the customer chooses", () => {
    renderPlans(planSet({ plans: [sequentialPlan, separatePlan] }));

    expect(screen.getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: /continue with this option/i })).toBeDisabled();
    expect(screen.getByText("Choose an option to continue.")).toBeInTheDocument();
  });

  it("reports the chosen plan by its server id", () => {
    const props = renderPlans(planSet({ plans: [sequentialPlan, separatePlan] }));

    fireEvent.click(screen.getAllByRole("radio")[1]!);
    expect(props.onSelect).toHaveBeenCalledWith("plan-separate");
  });

  it("continues only with an explicit selection", () => {
    const props = renderPlans(planSet({ plans: [sequentialPlan] }), {
      selectedPlanId: "plan-sequential",
    });

    fireEvent.click(screen.getByRole("button", { name: /continue with this option/i }));
    expect(props.onContinue).toHaveBeenCalledTimes(1);
  });
});

describe("money and services come from the response", () => {
  it("renders each amount as its own server field", () => {
    renderPlans(
      planSet({
        plans: [
          plan({
            subtotal: money(50000),
            platform_fee: money(2000),
            tax: money(9360),
            total: money(61360),
            units: [planUnit({ total: money(61360) })],
          }),
        ],
      }),
    );

    // The four figures are asserted independently. A component that summed the
    // first three would still show ₹613.60 here, so the test that matters is the
    // next one.
    expect(screen.getByText("₹500")).toBeInTheDocument();
    expect(screen.getByText("₹20")).toBeInTheDocument();
    expect(screen.getByText("₹93.60")).toBeInTheDocument();
    expect(screen.getAllByText("₹613.60").length).toBeGreaterThan(0);
  });

  it("shows the server total even when it does not equal the parts", () => {
    // Rounding, allocation and discounts all make this legitimate. A frontend
    // that recomputed the total would silently disagree with the price being
    // charged.
    renderPlans(
      planSet({
        plans: [
          plan({
            subtotal: money(10000),
            platform_fee: money(2000),
            tax: money(2160),
            total: money(99999),
            units: [planUnit({ total: money(99999) })],
          }),
        ],
      }),
    );

    expect(screen.getAllByText("₹999.99").length).toBeGreaterThan(0);
  });

  it("names each service from the cart item the plan referenced", () => {
    renderPlans(planSet({ plans: [sequentialPlan] }));

    expect(screen.getByText(/Fan installation — Ceiling fan/)).toBeInTheDocument();
    expect(screen.getByText(/Geyser repair — Storage geyser/)).toBeInTheDocument();
  });

  it("does not invent a name for an item the cart no longer has", () => {
    renderPlans(
      planSet({
        plans: [plan({ units: [planUnit({ items: [planUnitItem({ cart_item_id: "gone" })] })] })],
      }),
    );

    expect(
      screen.getByText("A service that is no longer in your cart"),
    ).toBeInTheDocument();
  });

  it("drops the positional marker from unit reasons rather than reading it aloud", () => {
    // `unit_0` identifies the unit; the visit heading already does that.
    renderPlans(planSet({ plans: [sequentialPlan] }));

    expect(screen.queryByText(/unit 0/i)).not.toBeInTheDocument();
    const unit = screen.getByRole("heading", { name: "Visit 1" }).closest("li")!;
    expect(
      within(unit).getByText(/One professional can safely do all of this/),
    ).toBeInTheDocument();
  });

  it("shows an unmapped reason code rather than dropping it", () => {
    // A code from a newer deployment is still the server's answer. Hiding it
    // would leave a plan with no stated reason at all.
    renderPlans(
      planSet({ plans: [plan({ decisive_reasons: ["some_future_reason_code"] })] }),
    );

    expect(screen.getByText("Some future reason code")).toBeInTheDocument();
  });
});

describe("plans that can no longer be used", () => {
  it("refuses to offer an invalidated set and offers replanning instead", () => {
    const props = renderPlans(planSet({ status: "INVALIDATED" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/no longer current/i);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /work out fresh options/i }));
    expect(props.onReplan).toHaveBeenCalledTimes(1);
  });

  it("says an expired set expired rather than that the cart changed", () => {
    renderPlans(planSet({ status: "EXPIRED" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/held for a short time/i);
  });

  it("says so honestly when no arrangement came back", () => {
    // An empty plan list is a complete answer, not a loading state.
    renderPlans(planSet({ plans: [] }));

    expect(screen.getByText(/No way to fulfil this booking came back/)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});

describe("while a plan is being priced", () => {
  it("disables the choices so the selection cannot change mid-request", () => {
    renderPlans(planSet({ plans: [sequentialPlan, separatePlan] }), {
      selectedPlanId: "plan-sequential",
      isPricing: true,
    });

    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toBeDisabled();
    }
  });

  it("marks the in-flight action busy rather than freezing the page", () => {
    renderPlans(planSet({ plans: [sequentialPlan] }), {
      selectedPlanId: "plan-sequential",
      isPricing: true,
    });

    expect(screen.getByRole("button", { name: /pricing your booking/i })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });
});
