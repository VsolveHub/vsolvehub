import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MarketplaceQueue } from "./marketplace-queue";
import OpsRentalsPage from "@/app/(operations)/operations/rentals/page";
import OpsStaysPage from "@/app/(operations)/operations/stays/page";

vi.mock("@/lib/api/browser", () => ({
  getApiClient: () => ({
    GET: vi.fn(async () => ({
      data: { next: null, previous: null, results: [] },
      error: undefined,
      response: { ok: true },
    })),
    POST: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/operations/rentals",
  useSearchParams: () => new URLSearchParams("tab=listings"),
}));

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("operations moderation queue", () => {
  it("asks for a reason only after an action is chosen", async () => {
    render(
      <MarketplaceQueue
        heading="Rental assets"
        queryKey="ops-rentals-test"
        load={async () => [
          {
            id: "asset-1",
            title: "Drill",
            public_state: "PENDING_REVIEW",
            partyName: "Host",
            moderation_status: "PENDING",
          },
        ]}
        moderate={async () => undefined}
      />,
      { wrapper },
    );

    expect(await screen.findByRole("button", { name: "Approve" })).toBeEnabled();
    expect(screen.queryByLabelText(/reason/i)).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("heading", { name: "Approve this listing" })).toBeInTheDocument();
    expect(screen.getByLabelText(/reason/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Approve" }).at(-1)).toBeDisabled();
  });

  it("does not mount a second operations shell on rentals or stays", async () => {
    const { unmount } = render(<OpsRentalsPage />, { wrapper });
    expect(await screen.findByRole("heading", { name: "Rental assets" })).toBeInTheDocument();
    expect(screen.queryByText("Checking your access")).not.toBeInTheDocument();
    unmount();

    render(<OpsStaysPage />, { wrapper });
    expect(await screen.findByRole("heading", { name: "Stay properties" })).toBeInTheDocument();
    expect(screen.queryByText("Checking your access")).not.toBeInTheDocument();
  });
});
