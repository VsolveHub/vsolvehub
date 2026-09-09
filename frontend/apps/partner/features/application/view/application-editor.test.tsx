import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The editor frame, and the three ways it was quietly wrong.
 *
 * 1. It took its step content as a render prop, so every Server Component page
 *    that used it passed a function across the client boundary and React
 *    refused the whole tree. Those pages threw at runtime.
 * 2. Its button said "Save and continue" and only saved.
 * 3. A failed save must *not* continue, which is the half of the fix that is
 *    easy to get wrong in the other direction.
 */

const push = vi.fn();
let pathname = "/apply/about";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}));

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { ApplicationEditor, useApplicationEditor } = await import("./application-editor");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function refusal(status: number, code: string, message = "Refused.") {
  return {
    data: undefined,
    error: {
      error: { code, message, details: null, retryable: false, request_id: "r" },
    },
    response: new Response(null, { status }),
  };
}

const APPLICATION = {
  id: "app-1",
  partner_id: "p-1",
  status: "DRAFT",
  version: 2,
  display_name: "Ravi",
  biography: "",
  experience_years: 3,
  skill_codes: [],
  service_variant_ids: [],
  service_area_ids: [],
  consents: [],
  documents: [],
  transitions: [],
  change_request_message: null,
  submitted_at: null,
  reviewed_at: null,
  review_assigned_at: null,
  review_assigned_to_id: null,
  created_at: "2026-08-01T09:00:00Z",
  updated_at: "2026-08-01T09:00:00Z",
};

/** A step that reads the draft the way the real ones do. */
function Step() {
  const { draft, update, isReadOnly } = useApplicationEditor();
  return (
    <label>
      Display name
      <input
        value={draft.displayName}
        disabled={isReadOnly}
        onChange={(event) => update({ displayName: event.target.value })}
      />
    </label>
  );
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderEditor() {
  return render(
    <ApplicationEditor title="About you" description="Who the customer sees">
      <Step />
    </ApplicationEditor>,
    { wrapper },
  );
}

beforeEach(() => {
  pathname = "/apply/about";
  push.mockReset();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("steps receive the draft as children, not as a function", () => {
  it("renders an ordinary element and feeds it through context", async () => {
    // The property that makes a Server Component page legal: `children` is an
    // element, so it serialises into the RSC payload.
    client.GET.mockResolvedValue(ok(APPLICATION));

    renderEditor();

    expect(await screen.findByLabelText(/display name/i)).toHaveValue("Ravi");
    expect(screen.getByRole("heading", { name: "About you" })).toBeInTheDocument();
  });

  it("edits flow back through the context updater", async () => {
    client.GET.mockResolvedValue(ok(APPLICATION));

    renderEditor();
    const input = await screen.findByLabelText(/display name/i);
    fireEvent.change(input, { target: { value: "Ravi Kumar" } });

    expect(input).toHaveValue("Ravi Kumar");
    expect(screen.getByRole("button", { name: /save and continue/i })).toBeEnabled();
  });
});

describe("save and continue", () => {
  it("moves to the next step once the save succeeds", async () => {
    client.GET.mockResolvedValue(ok(APPLICATION));
    client.PATCH.mockResolvedValue(ok({ ...APPLICATION, version: 3, display_name: "Ravi Kumar" }));

    renderEditor();
    fireEvent.change(await screen.findByLabelText(/display name/i), {
      target: { value: "Ravi Kumar" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/apply/work"));
  });

  it("follows the shared sequence rather than a per-page destination", async () => {
    pathname = "/apply/areas";
    client.GET.mockResolvedValue(ok(APPLICATION));
    client.PATCH.mockResolvedValue(ok({ ...APPLICATION, version: 3 }));

    renderEditor();
    fireEvent.change(await screen.findByLabelText(/display name/i), {
      target: { value: "Ravi Kumar" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/apply/consent"));
  });

  it("stays put when the save is refused", async () => {
    // The other half of the fix. Moving on from work the server did not keep is
    // worse than not moving at all: the applicant never sees why it failed.
    client.GET.mockResolvedValue(ok(APPLICATION));
    client.PATCH.mockResolvedValue(refusal(409, "partner_application_version_conflict"));

    renderEditor();
    fireEvent.change(await screen.findByLabelText(/display name/i), {
      target: { value: "Ravi Kumar" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));

    await waitFor(() => expect(screen.getByText(/someone else changed/i)).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });

  it("shows an incomplete-application refusal without calling it a version conflict", async () => {
    client.GET.mockResolvedValue(ok(APPLICATION));
    client.PATCH.mockResolvedValue(
      refusal(409, "partner_application_incomplete", "AC Hostel (Standard) is not enabled."),
    );

    renderEditor();
    fireEvent.change(await screen.findByLabelText(/display name/i), {
      target: { value: "Ravi Kumar" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));

    await waitFor(() =>
      expect(screen.getByText(/ac hostel \(standard\) is not enabled/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/someone else changed/i)).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("stays put when the save fails on the network", async () => {
    client.GET.mockResolvedValue(ok(APPLICATION));
    client.PATCH.mockRejectedValue(new Error("offline"));

    renderEditor();
    fireEvent.change(await screen.findByLabelText(/display name/i), {
      target: { value: "Ravi Kumar" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));

    await waitFor(() => expect(screen.getByText(/could not save this/i)).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });

  it("navigates nowhere from the last step", async () => {
    pathname = "/apply/review";
    client.GET.mockResolvedValue(ok(APPLICATION));
    client.PATCH.mockResolvedValue(ok({ ...APPLICATION, version: 3 }));

    renderEditor();
    fireEvent.change(await screen.findByLabelText(/display name/i), {
      target: { value: "Ravi Kumar" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));

    await waitFor(() => expect(client.PATCH).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });

  it("sends only the fields this step changed", async () => {
    // Two applicants editing different steps must not overwrite each other.
    client.GET.mockResolvedValue(ok(APPLICATION));
    client.PATCH.mockResolvedValue(ok({ ...APPLICATION, version: 3 }));

    renderEditor();
    fireEvent.change(await screen.findByLabelText(/display name/i), {
      target: { value: "Ravi Kumar" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));

    await waitFor(() => expect(client.PATCH).toHaveBeenCalled());
    const body = client.PATCH.mock.calls[0]![1].body as Record<string, unknown>;
    expect(body).toHaveProperty("display_name", "Ravi Kumar");
    expect(body).not.toHaveProperty("biography");
  });
});

describe("a step the applicant has already finished", () => {
  /**
   * The trap this closes.
   *
   * The button was `disabled={!dirty}`, so revisiting a completed step and
   * changing nothing left the only forward control on the screen dead — no
   * error, no explanation, and no other way on except noticing a link back to
   * the overview and walking the sequence by hand.
   *
   * Saving and continuing are two things and only one of them needs a change to
   * act on.
   */
  it("continues without spending a request when nothing changed", async () => {
    client.GET.mockResolvedValue(ok(APPLICATION));

    renderEditor();
    await screen.findByLabelText(/display name/i);

    const button = screen.getByRole("button", { name: /continue/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/apply/work"));
    // Nothing changed, so there is nothing to send.
    expect(client.PATCH).not.toHaveBeenCalled();
  });

  it("says Save and continue", async () => {
    client.GET.mockResolvedValue(ok(APPLICATION));

    renderEditor();
    await screen.findByLabelText(/display name/i);

    expect(screen.getByRole("button", { name: /save and continue/i })).toBeInTheDocument();
  });

  it("goes nowhere from the last step, and still spends no request", async () => {
    // `nextStep` is null at the end of the sequence, so a clean review screen
    // has nothing to navigate to. It must not silently do nothing *and* claim to
    // have saved.
    pathname = "/apply/review";
    client.GET.mockResolvedValue(ok(APPLICATION));

    renderEditor();
    await screen.findByLabelText(/display name/i);
    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));

    expect(push).not.toHaveBeenCalled();
    expect(client.PATCH).not.toHaveBeenCalled();
  });
});

describe("an application that is not the applicant's to edit", () => {
  it("hides the save action rather than disabling it mysteriously", async () => {
    client.GET.mockResolvedValue(ok({ ...APPLICATION, status: "UNDER_REVIEW" }));

    renderEditor();

    expect(await screen.findByText(/with a reviewer/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save and continue/i })).not.toBeInTheDocument();
  });
});
