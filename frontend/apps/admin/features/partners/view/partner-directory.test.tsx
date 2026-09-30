import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { PartnerDirectory } = await import("./partner-directory");

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.GET.mockImplementation((path: string) => {
    if (path === "/api/v1/partner/skills/") {
      return Promise.resolve({
        data: [{ code: "electrician", name: "Electrician" }],
        response: new Response(null, { status: 200 }),
      });
    }
    if (path === "/api/v1/operations/partners/") {
      return Promise.resolve({
        data: { results: [], next: null },
        response: new Response(null, { status: 200 }),
      });
    }
    return Promise.resolve({ data: undefined, response: new Response(null, { status: 404 }) });
  });
});

afterEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
});

describe("PartnerDirectory filters", () => {
  it("renders skill filter chips", async () => {
    render(
      <PartnerDirectory
        filters={{}}
        onFiltersChange={() => undefined}
        selectedId={null}
        onSelect={() => undefined}
      />,
      { wrapper },
    );

    expect(await screen.findByRole("button", { name: /^Electrician$/i })).toBeInTheDocument();
  });

  it("indicates active skills and allows clearing", async () => {
    const onFiltersChange = vi.fn();
    render(
      <PartnerDirectory
        filters={{ skills: ["electrician"] }}
        onFiltersChange={onFiltersChange}
        selectedId={null}
        onSelect={() => undefined}
      />,
      { wrapper },
    );

    const chip = await screen.findByRole("button", { name: /^Electrician$/i });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    const clearBtn = screen.getByRole("button", { name: /clear 1 skill filter/i });
    expect(clearBtn).toBeInTheDocument();
    fireEvent.click(clearBtn);
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ skills: [] }));
  });
});

describe("PartnersWorkspace history", () => {
  it("pushes one history entry for the first selection only", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    const { PartnersWorkspace } = await import("./partners-workspace");

    client.GET.mockImplementation((path: string) => {
      if (path === "/api/v1/partner/skills/") {
        return Promise.resolve({
          data: [],
          response: new Response(null, { status: 200 }),
        });
      }
      if (path === "/api/v1/operations/partners/") {
        return Promise.resolve({
          data: {
            results: [
              {
                id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                display_name: "Alex",
                experience_years: 3,
                application_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                application_status: "APPROVED",
                submitted_at: "2026-01-01T00:00:00Z",
                reviewed_at: "2026-01-02T00:00:00Z",
                skills: [],
                service_count: 1,
                service_area_count: 1,
                created_at: "2026-01-01T00:00:00Z",
              },
              {
                id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                display_name: "Blake",
                experience_years: 2,
                application_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
                application_status: "APPROVED",
                submitted_at: "2026-01-01T00:00:00Z",
                reviewed_at: null,
                skills: [],
                service_count: 1,
                service_area_count: 1,
                created_at: "2026-01-01T00:00:00Z",
              },
            ],
            next: null,
          },
          response: new Response(null, { status: 200 }),
        });
      }
      return Promise.resolve({ data: undefined, response: new Response(null, { status: 404 }) });
    });

    render(<PartnersWorkspace />, { wrapper });

    const alex = await screen.findByRole("button", { name: /Alex/i });
    fireEvent.click(alex);
    fireEvent.click(screen.getByRole("button", { name: /Blake/i }));

    expect(pushState).toHaveBeenCalledTimes(1);
    pushState.mockRestore();
  });
});
