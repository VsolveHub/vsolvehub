import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PartnerRecord } from "../queries";

/**
 * Suspend, reinstate and offboard from the partner's record. They were reachable only from
 * Applications, so suspending a working partner meant finding their old application.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const { PartnerStanding, standingActions } = await import("./partner-standing");

function partner(status: string): PartnerRecord {
  return {
    id: "partner-1",
    display_name: "Ravi",
    phone_number: "+919876543210",
    application_id: "application-1",
    application_status: status,
    application_version: 4,
  } as PartnerRecord;
}

function renderStanding(status: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PartnerStanding partner={partner(status)} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const method of Object.values(client)) method.mockReset();
  client.POST.mockResolvedValue({ data: { id: "application-1" }, response: new Response(null, { status: 200 }) });
});

describe("partner standing", () => {
  it("offers only the moves the server allows from each status", () => {
    expect(standingActions("APPROVED").map((a) => a.target)).toEqual(["SUSPENDED", "OFFBOARDED"]);
    expect(standingActions("SUSPENDED").map((a) => a.target)).toEqual(["APPROVED", "OFFBOARDED"]);
    expect(standingActions("UNDER_REVIEW")).toEqual([]);
    expect(standingActions("OFFBOARDED")).toEqual([]);
  });

  it("calls the partner's number", () => {
    renderStanding("APPROVED");

    expect(screen.getByRole("link", { name: /Call \+919876543210/ })).toHaveAttribute("href", "tel:+919876543210");
  });

  it("needs a reason to suspend, and sends the version it was looking at", async () => {
    renderStanding("APPROVED");

    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Suspend" });
    expect(confirm).toBeDisabled();

    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "No-shows on three visits" } });
    fireEvent.click(confirm);

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    const [path, init] = client.POST.mock.calls[0] as [string, { params: unknown; body: unknown }];
    expect(path).toBe("/api/v1/operations/partner-applications/{application_id}/transition/");
    expect(init.params).toEqual({ path: { application_id: "application-1" } });
    expect(init.body).toEqual({ expected_version: 4, target_status: "SUSPENDED", reason: "No-shows on three visits" });
  });

  it("reinstates without a reason", async () => {
    renderStanding("SUSPENDED");

    fireEvent.click(screen.getByRole("button", { name: "Reinstate" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reinstate" }));

    await waitFor(() =>
      expect((client.POST.mock.calls[0] as [string, { body: unknown }])[1].body).toEqual({
        expected_version: 4,
        target_status: "APPROVED",
        reason: "",
      }),
    );
  });

  it("sends an application still in review to Applications instead", () => {
    renderStanding("UNDER_REVIEW");

    expect(screen.queryByRole("button", { name: "Suspend" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Decide on Applications" })).toHaveAttribute("href", "/reviews");
  });
});
