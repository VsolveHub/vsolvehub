import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@vsolve/ui";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enquiryDetail, question, siteVisit } from "../fixtures";

/**
 * One enquiry, end to end.
 *
 * The screen the flow-weight budget constrains: an A3 response is one screen,
 * so the requirement, the accept/decline pair and the rate composer are one
 * scroll rather than a wizard. The tests below are about what that screen is
 * allowed to say, and which composer it opens.
 */

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { EnquiryDetail } = await import("./enquiry-detail");

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

function refusal(status: number, code: string, message: string) {
  return {
    data: undefined,
    error: { code, message },
    response: new Response(null, { status }),
  };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

function renderDetail() {
  return render(
    <EnquiryDetail
      invitationId="11111111-1111-4111-8111-111111111111"
      basePath="/workforce/enquiries"
      backLabel="All enquiries"
    />,
    { wrapper },
  );
}

/**
 * Opens the accept confirmation and presses its confirm button.
 *
 * The trigger and the dialog's confirm button share the label "Accept" —
 * deliberately, because `ConfirmAction` requires the confirm button to name the
 * action rather than say "OK". The dialog's copy is what tells them apart.
 */
async function confirmAccept() {
  fireEvent.click(await screen.findByRole("button", { name: /^Accept$/i }));
  await screen.findByText(/You are not committing to a price yet/i);
  const buttons = screen.getAllByRole("button", { name: /^Accept$/i });
  fireEvent.click(buttons[buttons.length - 1]!);
}

beforeEach(() => {
  window.sessionStorage.clear();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("which composer opens", () => {
  it("opens the rate composer for a workforce enquiry", async () => {
    client.GET.mockResolvedValue(ok(enquiryDetail({ status: "ACCEPTED" })));
    renderDetail();

    expect(await screen.findByLabelText(/Rate per worker per day/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add a stage/i })).toBeNull();
  });

  it("opens the staged composer for a project enquiry", async () => {
    client.GET.mockResolvedValue(
      ok(enquiryDetail({ status: "ACCEPTED", archetype: "A5_CUSTOM_PROJECT" })),
    );
    renderDetail();

    expect(await screen.findByRole("button", { name: /Add a stage/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Rate per worker per day/i)).toBeNull();
  });

  it("opens no composer for a lifecycle this build does not carry", async () => {
    // The same rule as an unknown workspace key. A generic price form would
    // collect fields `_assert_a3_shape` and `_assert_a5_shape` both refuse.
    client.GET.mockResolvedValue(
      ok(enquiryDetail({ status: "ACCEPTED", archetype: "A9_SOMETHING_NEW" })),
    );
    renderDetail();

    expect(await screen.findByText(/cannot show a quote form for this kind of work/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Rate per worker per day/i)).toBeNull();
  });

  it("does not open a composer before the enquiry is accepted", async () => {
    // `submit_proposal` refuses: "Accept this enquiry before quoting on it."
    // A price form above an un-accepted enquiry invites a quote that cannot be
    // sent.
    client.GET.mockResolvedValue(ok(enquiryDetail({ status: "INVITED" })));
    renderDetail();

    await screen.findByRole("button", { name: /^Accept$/i });
    expect(screen.queryByLabelText(/Rate per worker per day/i)).toBeNull();
  });
});

describe("what the vendor is offered", () => {
  it("offers accept and decline on an open enquiry", async () => {
    client.GET.mockResolvedValue(ok(enquiryDetail({ status: "INVITED" })));
    renderDetail();

    expect(await screen.findByRole("button", { name: /^Accept$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Decline$/i })).toBeInTheDocument();
  });

  it("does not offer decline once a quote is in", async () => {
    // `decline_invitation` refuses QUOTED: "Withdraw the quote instead."
    client.GET.mockResolvedValue(ok(enquiryDetail({ status: "QUOTED" })));
    renderDetail();

    await screen.findByText(/You quoted/i);
    expect(screen.queryByRole("button", { name: /^Decline$/i })).toBeNull();
  });

  it("shows the recorded reason on a declined enquiry", async () => {
    client.GET.mockResolvedValue(
      ok(enquiryDetail({ status: "DECLINED", decline_reason_code: "no_capacity" })),
    );
    renderDetail();

    expect(await screen.findByText(/I am booked for these dates/i)).toBeInTheDocument();
  });

  it("states the capacity hold before the vendor accepts", async () => {
    // `accept_invitation` writes an ACTIVE CapacityHold over the requested
    // days. A vendor who does not know that will accept six Saturdays.
    client.GET.mockResolvedValue(ok(enquiryDetail({ status: "INVITED" })));
    renderDetail();

    expect(await screen.findByText(/holds your availability for 4 days/i)).toBeInTheDocument();
  });
});

describe("accepting", () => {
  it("confirms before taking the slot", async () => {
    client.GET.mockResolvedValue(ok(enquiryDetail({ status: "INVITED" })));
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: /^Accept$/i }));

    expect(await screen.findByText(/You are not committing to a price yet/i)).toBeInTheDocument();
    expect(client.POST).not.toHaveBeenCalled();
  });

  it("sends an idempotency key", async () => {
    client.GET.mockResolvedValue(ok(enquiryDetail({ status: "INVITED" })));
    client.POST.mockResolvedValue(ok(enquiryDetail({ status: "ACCEPTED" })));
    renderDetail();

    await confirmAccept();

    await waitFor(() => expect(client.POST).toHaveBeenCalled());
    const [, options] = client.POST.mock.calls[0] as [
      string,
      { params: { header: Record<string, string> } },
    ];
    expect(options.params.header["Idempotency-Key"]).toBeTruthy();
  });

  it("routes the KYC gate to verification rather than to a locked-out screen", async () => {
    // `m2_kyc_required` is a 403 that is an unfinished form, not a denial — the
    // progressive gate firing at the first accept, exactly where `M2-FE-102`
    // put it.
    client.GET.mockResolvedValue(ok(enquiryDetail({ status: "INVITED" })));
    client.POST.mockResolvedValue(
      refusal(403, "m2_kyc_required", "Verify your identity before accepting work."),
    );
    renderDetail();

    await confirmAccept();

    expect(await screen.findByText(/needs to verify you first/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Finish verification/i })).toBeInTheDocument();
  });
});

describe("clarification", () => {
  it("shows a question and the customer's answer on one record", async () => {
    client.GET.mockResolvedValue(
      ok(
        enquiryDetail({
          questions: [
            question({ answer: "Yes, it is already up.", answered_at: "2026-08-12T09:00:00Z" }),
          ],
        }),
      ),
    );
    renderDetail();

    expect(await screen.findByText(/Is scaffolding already up\?/i)).toBeInTheDocument();
    expect(screen.getByText(/Yes, it is already up\./i)).toBeInTheDocument();
  });

  it("says a question is unanswered rather than implying one is coming", async () => {
    client.GET.mockResolvedValue(ok(enquiryDetail({ questions: [question()] })));
    renderDetail();

    expect(await screen.findByText(/Vsolve does not chase an answer/i)).toBeInTheDocument();
  });

  it("warns against contact details before the vendor types any", async () => {
    // The only place in the Partner surface where free text reaches a customer,
    // so the only place the guidance can arrive in time to change it.
    client.GET.mockResolvedValue(ok(enquiryDetail()));
    renderDetail();

    expect(
      await screen.findByText(/Do not include phone numbers, WhatsApp handles or payment links/i),
    ).toBeInTheDocument();
  });
});

describe("site visits", () => {
  it("says a requested visit cannot be scheduled from either app", async () => {
    // `schedule_site_visit` and `complete_site_visit` exist in the domain and
    // are published on no route. Rendering a "Scheduled" step nobody can reach
    // would be faking the transition.
    client.GET.mockResolvedValue(ok(enquiryDetail({ site_visits: [siteVisit()] })));
    renderDetail();

    expect(await screen.findByText(/Scheduling a date is not built yet/i)).toBeInTheDocument();
  });

  it("offers no callback control, because no callback endpoint exists", async () => {
    client.GET.mockResolvedValue(ok(enquiryDetail()));
    renderDetail();

    await screen.findByText(/Site visit/i);
    expect(screen.queryByRole("button", { name: /call/i })).toBeNull();
    expect(screen.getByText(/does not arrange phone calls/i)).toBeInTheDocument();
  });
});

describe("what this screen may never show", () => {
  it("renders no customer contact at any status", async () => {
    // The projection withholds it; this asserts the client does not
    // reconstruct it, and it is the enforceable half of `M2-FE-307` — there is
    // no cached contact that could survive a revocation because none is ever
    // received.
    for (const status of ["INVITED", "ACCEPTED", "QUOTED"] as const) {
      queryClient.clear();
      client.GET.mockResolvedValue(ok(enquiryDetail({ status })));
      const { container, unmount } = renderDetail();
      await screen.findByText(/What the customer asked for/i);

      expect(container.textContent).not.toMatch(/\+91|\b[6-9]\d{9}\b/);
      unmount();
    }
  });

  it("states plainly that no contact is shared either way", async () => {
    client.GET.mockResolvedValue(ok(enquiryDetail()));
    renderDetail();

    expect(
      await screen.findByText(/will not see the customer’s name, address or phone number/i),
    ).toBeInTheDocument();
  });
});

describe("the read failing", () => {
  it("does not offer a retry for an enquiry that is not this vendor's", async () => {
    client.GET.mockResolvedValue(refusal(404, "not_found", "No such enquiry."));
    renderDetail();

    expect(await screen.findByText(/not yours to read/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Try again/i })).toBeNull();
  });
});
