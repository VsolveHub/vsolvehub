import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { ImportView } = await import("./import-view");

function chooseFile() {
  const input = screen.getByLabelText("CSV file");
  const file = new File(["phone,full_name,city\n"], "partners.csv", { type: "text/csv" });
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  for (const method of Object.values(client)) method.mockReset();
});

describe("partner import", () => {
  it("posts through the API client, which carries the CSRF token", async () => {
    client.POST.mockResolvedValue({
      data: {
        dry_run: true,
        results: { created: 1, skipped: 0, errors: 0, rows: [{ row: 2, status: "created", phone: "+919800000123" }] },
      },
      response: new Response(null, { status: 200 }),
    });
    render(<ImportView />);

    chooseFile();
    fireEvent.click(screen.getByRole("button", { name: "Check file" }));

    expect(await screen.findByText(/dry run results — nothing was created/i)).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "would create" })).toBeInTheDocument();
    expect(client.POST).toHaveBeenCalledWith(
      "/api/v1/operations/partners/import/",
      expect.objectContaining({ bodySerializer: expect.any(Function) }),
    );
  });

  it("shows a refusal as an error, not as an all-zero result", async () => {
    // A bare fetch without the CSRF token was refused by Django, and the 403
    // body rendered as "Results" with Created 0, Skipped 0, Errors 0.
    client.POST.mockResolvedValue({
      error: { detail: "CSRF Failed" },
      response: new Response(null, { status: 403 }),
    });
    render(<ImportView />);

    chooseFile();
    fireEvent.click(screen.getByRole("button", { name: "Check file" }));

    expect(await screen.findByText(/could not import this file/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/results/i)).not.toBeInTheDocument());
  });
});
