import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cart, cartItem, groupQuote, quoteLine, quoteUnit } from "../fixtures";
import type { SchedulingGroup } from "../queries";
import { OrderSummary } from "./order-summary";

/**
 * The summary rail.
 *
 * The property worth defending is that an unpriced booking shows **no price**.
 * `CartItemDetail` carries no amount precisely so no screen can imply one, and a
 * plausible-looking "estimated total" here would be a number the planner never
 * produced.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.GET.mockReturnValue(new Promise(() => {}));
});

const ELECTRICIAN: SchedulingGroup = {
  key: "key-electrician",
  label: "Electrician",
  estimated_duration_minutes: 30,
  cart_item_ids: ["item-1"],
};

const SALON: SchedulingGroup = {
  key: "key-salon",
  label: "Salon Prime",
  estimated_duration_minutes: 130,
  cart_item_ids: ["item-2"],
};

const TWO_ITEM_CART = cart({
  items: [
    cartItem({ id: "item-1", service_name: "Switch repair" }),
    cartItem({ id: "item-2", service_name: "Waxing" }),
  ],
});

describe("before a price exists", () => {
  it("lists the work grouped the way it will actually happen", () => {
    render(<OrderSummary cart={TWO_ITEM_CART} groups={[ELECTRICIAN, SALON]} quote={null} />, {
      wrapper,
    });

    expect(screen.getByRole("heading", { name: "Electrician" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Salon Prime" })).toBeInTheDocument();
    expect(screen.getByText("Switch repair")).toBeInTheDocument();
    expect(screen.getByText("Waxing")).toBeInTheDocument();
  });

  it("says why there is no price yet instead of showing one", () => {
    render(<OrderSummary cart={TWO_ITEM_CART} groups={[ELECTRICIAN, SALON]} quote={null} />, {
      wrapper,
    });

    expect(screen.getByText(/once every visit has a time/i)).toBeInTheDocument();
    expect(screen.queryByText(/^₹/)).not.toBeInTheDocument();
  });

  it("falls back to one list when the grouping has not loaded", () => {
    render(<OrderSummary cart={TWO_ITEM_CART} groups={[]} quote={null} />, { wrapper });

    expect(screen.getByRole("heading", { name: /your services/i })).toBeInTheDocument();
  });
});

describe("once the server has priced it", () => {
  const PRICED = groupQuote({
    units: [
      quoteUnit({
        id: "unit-1",
        lines: [quoteLine({ id: "line-1", kind: "SERVICE", label: "Switch repair" })],
      }),
    ],
  });

  it("renders the server's own lines and total", () => {
    render(<OrderSummary cart={TWO_ITEM_CART} groups={[ELECTRICIAN]} quote={PRICED} />);

    expect(screen.getByRole("heading", { name: /total bill/i })).toBeInTheDocument();
    expect(screen.getByText("Switch repair")).toBeInTheDocument();
  });

  it("names the per-visit minimum rather than folding it into a subtotal", () => {
    const withMinimum = groupQuote({
      units: [
        quoteUnit({
          id: "unit-1",
          lines: [
            quoteLine({
              id: "line-1",
              kind: "MINIMUM_VISIT_ADJUSTMENT",
              label: "Minimum visit",
            }),
          ],
        }),
      ],
    });

    render(<OrderSummary cart={TWO_ITEM_CART} groups={[ELECTRICIAN]} quote={withMinimum} />);

    expect(screen.getByText(/minimum charge for this visit/i)).toBeInTheDocument();
  });

  it("offers a per-visit breakup only when there is more than one visit", () => {
    render(<OrderSummary cart={TWO_ITEM_CART} groups={[ELECTRICIAN]} quote={PRICED} />);

    expect(screen.queryByText(/view breakup/i)).not.toBeInTheDocument();
  });
});
