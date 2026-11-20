import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@vsolve/ui";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withI18n } from "@/i18n/test-utils";

/**
 * The job form for an employer: which categories come first, and what is said when the server
 * refuses a job that asks candidates to pay.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { PostJobWizard } = await import("./post-job-wizard");

const MONEY_MESSAGE = "Jobs on V Solve Hub can't ask candidates to pay. Remove “registration fee”.";

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function refusal(status: number, code: string, message: string) {
  return {
    data: undefined,
    error: { error: { code, message, details: null, retryable: false, request_id: "r" } },
    response: new Response(null, { status }),
  };
}

function role(id: string, name: string) {
  return {
    id,
    name,
    skills: ["Cleaning"],
    responsibilities: ["Clean the house"],
    job_type: "FULL_TIME",
    shift: "DAY",
    work_mode: "ON_SITE",
    salary_min_rupees: 8000,
    salary_max_rupees: 15000,
  };
}

const OPTIONS = {
  categories: [
    { name: "Retail & Sales", roles: [role("r1", "Sales Executive")] },
    { name: "Healthcare", roles: [role("r2", "Staff Nurse")] },
    { name: "Home & Personal", roles: [role("r3", "House Help / Maid")] },
  ],
  job_types: [{ value: "FULL_TIME", label: "Full time" }],
  experience_bands: [],
  qualifications: [],
  languages: [],
  benefits: [],
  shifts: [],
  work_modes: [],
  weekly_offs: [],
  urgencies: [],
  salary_periods: [],
  salary_bands: [],
  cities: ["Hyderabad"],
};

function serve(hiringAs: string | undefined) {
  client.GET.mockImplementation((path: string) => {
    if (path === "/api/v1/jobs/options") return Promise.resolve(ok(OPTIONS));
    if (path === "/api/v1/partner/application/") {
      return Promise.resolve(
        ok({ id: "app-1", status: "APPROVED", track: "EMPLOYER", version: 5, employer: { hiring_as: hiringAs } }),
      );
    }
    return Promise.resolve(ok({}));
  });
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return withI18n(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  push.mockReset();
  window.scrollTo = vi.fn() as typeof window.scrollTo;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => queryClient.clear());

const categoryNames = () =>
  screen
    .getAllByRole("button", { pressed: false })
    .map((button) => button.textContent)
    .filter((name) => OPTIONS.categories.some((category) => category.name === name));

describe("the job categories", () => {
  it("put household help first for someone hiring for themselves", async () => {
    serve("INDIVIDUAL");
    render(<PostJobWizard />, { wrapper });

    await screen.findByRole("button", { name: "Home & Personal" });
    await waitFor(() =>
      expect(categoryNames()).toEqual(["Home & Personal", "Retail & Sales", "Healthcare"]),
    );
  });

  it("keep every category available to them", async () => {
    serve("INDIVIDUAL");
    render(<PostJobWizard />, { wrapper });

    await screen.findByRole("button", { name: "Home & Personal" });
    expect(screen.getByRole("button", { name: "Retail & Sales" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Healthcare" })).toBeInTheDocument();
  });

  it("stay in the server's order for a business", async () => {
    serve("BUSINESS");
    render(<PostJobWizard />, { wrapper });

    await screen.findByRole("button", { name: "Home & Personal" });
    expect(categoryNames()).toEqual(["Retail & Sales", "Healthcare", "Home & Personal"]);
  });
});

describe("a job that asks candidates to pay", () => {
  it("is refused with the server's own message, at the foot of the form", async () => {
    serve("BUSINESS");
    client.POST.mockResolvedValue(refusal(400, "job_text_asks_for_money", MONEY_MESSAGE));
    render(<PostJobWizard />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Retail & Sales" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sales Executive" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    fireEvent.click(await screen.findByRole("button", { name: "Hyderabad" }));
    // The form offers the same save inline and in its bottom bar.
    fireEvent.click((await screen.findAllByRole("button", { name: "See preview" }))[0]!);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(MONEY_MESSAGE);
    expect(client.POST).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });
});
