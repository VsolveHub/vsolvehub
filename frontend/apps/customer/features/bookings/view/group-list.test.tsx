import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtures } from "@vsolve/testing";

import { group, unit, unitLine } from "../fixtures";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { BookingGroupRow } = await import("./group-list");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

const COVER_URL = "https://cdn.example/gas-stove.jpg";

const category = fixtures.category({ slug: "technician", name: "Technician" });
const serviceCard = fixtures.serviceCard({
  slug: "gas-stove-repair",
  name: "Gas Stove Repair",
  category_slug: "technician",
  icon_key: "gas-stove",
  cover: {
    id: "media-1",
    kind: "COVER",
    url: COVER_URL,
    alt_text: "Gas Stove Repair",
  },
});

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
  client.GET.mockImplementation((path: string) => {
    if (path === "/api/v1/categories/") return Promise.resolve(ok([category]));
    if (path === "/api/v1/categories/{category_slug}/services/") {
      return Promise.resolve(ok([serviceCard]));
    }
    return Promise.resolve(ok(null));
  });
});

afterEach(() => {
  queryClient.clear();
});

describe("BookingGroupRow", () => {
  it("shows the service name, status badge, visit time and price — not status essays", async () => {
    render(
      <BookingGroupRow
        group={group({
          status: "BOOKED",
          recovery_action: "NONE",
          units: [
            unit({
              status: "BOOKED",
              starts_at: "2026-09-04T08:00:00Z",
              lines: [
                unitLine({
                  code: "task.gas-stove-repair",
                  label: "Gas Stove Repair",
                }),
              ],
            }),
          ],
        })}
      />,
      { wrapper },
    );

    expect(screen.getByRole("heading", { name: "Gas Stove Repair" })).toBeInTheDocument();
    expect(screen.getByText("Booked")).toBeInTheDocument();
    expect(screen.getByText(/₹317/)).toBeInTheDocument();
    expect(screen.queryByText(/everything is confirmed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/1 visit/i)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(document.querySelector("img")?.getAttribute("src")).toBe(COVER_URL);
    });
  });

  it("shows a replan action instead of the visit time when recovery asks for it", () => {
    render(
      <BookingGroupRow
        group={group({
          status: "REPLAN_REQUIRED",
          recovery_action: "REPLAN",
          units: [
            unit({
              lines: [
                unitLine({
                  code: "task.gas-stove-repair",
                  label: "Gas Stove Repair",
                }),
              ],
            }),
          ],
        })}
      />,
      { wrapper },
    );

    expect(screen.getByText("Choose a new arrangement")).toBeInTheDocument();
    expect(screen.getByText("Needs a new time")).toBeInTheDocument();
    expect(screen.queryByText(/₹/)).not.toBeInTheDocument();
  });

  it("keeps expired bookings recognisable by the same service image", async () => {
    render(
      <BookingGroupRow
        group={group({
          status: "EXPIRED",
          units: [
            unit({
              status: "CANCELLED",
              lines: [
                unitLine({
                  code: "task.gas-stove-repair",
                  label: "Gas Stove Repair",
                }),
              ],
            }),
          ],
        })}
      />,
      { wrapper },
    );

    expect(screen.getByText("Expired")).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector("img")?.getAttribute("src")).toBe(COVER_URL);
    });
  });
});
