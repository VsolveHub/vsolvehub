import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** The review queue can be narrowed to one kind of applicant, on top of its tabs. */

const api = vi.hoisted(() => {
  const queues: Record<string, string>[] = [];
  const row = (id: string, name: string, track: string) => ({
    id,
    status: "SUBMITTED",
    track,
    version: 2,
    display_name: name,
    submitted_at: "2026-11-20T09:00:00Z",
    review_assigned_to_id: null,
    review_assigned_at: null,
    updated_at: "2026-11-20T09:00:00Z",
  });
  const ok = (data: unknown) =>
    Promise.resolve({ data, error: undefined, response: new Response(null, { status: 200 }) });

  return {
    queues,
    client: {
      GET: (path: string, init?: { params?: { query?: Record<string, string> } }) => {
        if (path === "/api/v1/auth/session/") {
          return ok({ user: { id: "u-1", roles: ["operations"] }, active_role: "operations" });
        }
        queues.push(init?.params?.query ?? {});
        const track = init?.params?.query?.track;
        const all = [
          row("a1", "Ravi Kumar", "SERVICES"),
          row("a2", "Asha Rao", "EMPLOYER"),
          row("a3", "Meena Stays", "STAY_HOST"),
        ];
        return ok({
          next: null,
          previous: null,
          results: track ? all.filter((item) => item.track === track) : all,
        });
      },
    },
  };
});

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => api.client }));

const { ReviewQueue } = await import("./review-queue");

function renderQueue() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ReviewQueue selectedId={null} onSelect={() => undefined} />
    </QueryClientProvider>,
  );
}

const lastQuery = () => api.queues[api.queues.length - 1];

beforeEach(() => {
  api.queues.length = 0;
});

describe("the type filter", () => {
  it("lists every kind of applicant until one is chosen, each row saying which kind it is", async () => {
    renderQueue();

    const list = await screen.findByRole("list");
    expect(within(list).getByText("Ravi Kumar")).toBeInTheDocument();
    expect(within(list).getByText("Technician")).toBeInTheDocument();
    expect(within(list).getByText("Employer")).toBeInTheDocument();
    expect(within(list).getByText("Property host")).toBeInTheDocument();
    expect(lastQuery()).not.toHaveProperty("track");
  });

  it("offers each kind by the name Operations uses", async () => {
    renderQueue();

    const type = await screen.findByRole("combobox", { name: /type of applicant/i });
    expect(within(type).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "All types",
      "Technicians",
      "Property hosts",
      "Rental owners",
      "Employers",
    ]);
  });

  it("asks the server for only that kind", async () => {
    renderQueue();
    await screen.findByText("Ravi Kumar");

    fireEvent.change(screen.getByRole("combobox", { name: /type of applicant/i }), {
      target: { value: "EMPLOYER" },
    });

    await waitFor(() => expect(lastQuery()?.track).toBe("EMPLOYER"));
    expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
    expect(screen.queryByText("Ravi Kumar")).toBeNull();
  });

  it("keeps the tab's own filter, and the type keeps the tab", async () => {
    renderQueue();
    await screen.findByText("Ravi Kumar");

    fireEvent.click(screen.getByRole("tab", { name: "Under review" }));
    await waitFor(() => expect(lastQuery()?.status).toBe("UNDER_REVIEW"));

    fireEvent.change(screen.getByRole("combobox", { name: /type of applicant/i }), {
      target: { value: "EMPLOYER" },
    });
    await waitFor(() => expect(lastQuery()).toMatchObject({ status: "UNDER_REVIEW", track: "EMPLOYER" }));

    fireEvent.click(screen.getByRole("tab", { name: "Mine" }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ assigned_to_me: true, track: "EMPLOYER" }));
  });

  it("goes back to every kind on All types", async () => {
    renderQueue();
    await screen.findByText("Ravi Kumar");
    const type = screen.getByRole("combobox", { name: /type of applicant/i });

    fireEvent.change(type, { target: { value: "EMPLOYER" } });
    await waitFor(() => expect(lastQuery()?.track).toBe("EMPLOYER"));

    fireEvent.change(type, { target: { value: "" } });
    await waitFor(() => expect(lastQuery()).not.toHaveProperty("track"));
    expect(await screen.findByText("Ravi Kumar")).toBeInTheDocument();
  });
});
