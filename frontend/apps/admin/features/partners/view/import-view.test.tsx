import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ImportResponse } from "../partner-import";

/**
 * Check, then import: proposal 0029.
 *
 * Import is offered only after a clean check of the same file, the problems are listed by row and
 * column, and the import carries the file's hash as its idempotency key so a double click or a
 * retry cannot create anyone twice.
 */

type PostInit = { bodySerializer: () => FormData; headers?: Record<string, string> };

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

// jsdom's File has no reliable `arrayBuffer`, and the hash itself is not what is under test.
vi.mock("../partner-import", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../partner-import")>()),
  fileSha256: vi.fn(async () => "hash-of-partners-csv"),
}));

const { ImportView } = await import("./import-view");

const ok = (data: unknown) => ({ data, response: new Response(null, { status: 200 }) });

function checkResult(overrides: Partial<ImportResponse> = {}): ImportResponse {
  return {
    mode: "check",
    file_sha256: "hash-of-partners-csv",
    summary: { total: 2, ready: 2, skipped: 0, errors: 0 },
    rows: [
      { row: 2, status: "ready", phone: "+919876543210", full_name: "Ravi", track: "SERVICES", errors: [] },
      { row: 3, status: "ready", phone: "+919812345678", full_name: "Asha", track: "STAY_HOST", errors: [] },
    ],
    ...overrides,
  };
}

const imported: ImportResponse = {
  mode: "import",
  file_sha256: "hash-of-partners-csv",
  summary: { total: 2, created: 2, skipped: 0, errors: 0 },
  rows: [],
};

function modeOf(init: PostInit): string | null {
  return init.bodySerializer().get("mode") as string | null;
}

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ImportView />
    </QueryClientProvider>,
  );
}

function chooseFile(name = "partners.csv", size?: number) {
  const file = new File(["phone,full_name,track\n"], name, { type: "text/csv" });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  fireEvent.change(screen.getByLabelText("CSV file"), { target: { files: [file] } });
}

beforeEach(() => {
  for (const method of Object.values(client)) method.mockReset();
  client.GET.mockImplementation((path: string) =>
    Promise.resolve(
      ok(
        path === "/api/v1/service-areas/"
          ? [
              { id: "a1", slug: "hyderabad", name: "Hyderabad", timezone: "Asia/Kolkata", is_accepting_partners: true },
              { id: "a2", slug: "pune", name: "Pune", timezone: "Asia/Kolkata", is_accepting_partners: false },
            ]
          : [{ id: "s1", code: "plumbing", name: "Plumbing", description: "" }],
      ),
    ),
  );
});

describe("partner import", () => {
  it("lists the required columns and the codes the file may use", async () => {
    renderView();

    const columns = screen.getByRole("table", { name: "Import file columns" });
    for (const name of ["phone", "full_name", "track", "service_area", "skills"]) {
      expect(within(columns).getByText(name)).toBeInTheDocument();
    }
    expect(await screen.findByText("hyderabad")).toBeInTheDocument();
    expect(screen.getByText("plumbing")).toBeInTheDocument();
    // Only areas accepting partners are offered: an import into a closed area would be refused.
    expect(screen.queryByText("pune")).not.toBeInTheDocument();
  });

  it("checks the file first and offers import only after a clean check", async () => {
    client.POST.mockResolvedValue(ok(checkResult()));
    renderView();

    expect(screen.queryByRole("button", { name: /import \d+ partners?/i })).not.toBeInTheDocument();
    chooseFile();
    fireEvent.click(screen.getByRole("button", { name: "Check file" }));

    const importButton = await screen.findByRole("button", { name: "Import 2 partners" });
    expect(importButton).toBeEnabled();
    const [path, init] = client.POST.mock.calls[0] as [string, PostInit];
    expect(path).toBe("/api/v1/operations/partners/import/");
    expect(modeOf(init)).toBe("check");
    // A check changes nothing, so it carries no idempotency key.
    expect(init.headers).toBeUndefined();
  });

  it("lists every problem by row and column and blocks the import", async () => {
    client.POST.mockResolvedValue(
      ok(
        checkResult({
          summary: { total: 2, ready: 1, skipped: 0, errors: 1 },
          rows: [
            { row: 2, status: "ready", phone: "+919876543210", full_name: "Ravi", track: "SERVICES", errors: [] },
            {
              row: 3,
              status: "error",
              phone: "98123",
              full_name: "",
              track: "SERVICES",
              errors: [
                { column: "phone", message: "Enter a 10-digit Indian mobile number." },
                { column: "skills", message: "Unknown skill: carpentery." },
              ],
            },
          ],
        }),
      ),
    );
    renderView();

    chooseFile();
    fireEvent.click(screen.getByRole("button", { name: "Check file" }));

    expect(await screen.findByText("Enter a 10-digit Indian mobile number.")).toBeInTheDocument();
    expect(screen.getByText("Unknown skill: carpentery.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import 1 partner" })).toBeDisabled();
  });

  it("imports after confirming, keyed by the checked file's hash", async () => {
    client.POST.mockImplementation((_path: string, init: PostInit) =>
      Promise.resolve(ok(modeOf(init) === "check" ? checkResult() : imported)),
    );
    renderView();

    chooseFile();
    fireEvent.click(screen.getByRole("button", { name: "Check file" }));
    fireEvent.click(await screen.findByRole("button", { name: "Import 2 partners" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/creates 2 partner accounts with draft applications/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Import" }));

    expect(await screen.findByRole("heading", { name: "2 partners imported" })).toBeInTheDocument();
    const [, init] = client.POST.mock.calls[1] as [string, PostInit];
    expect(modeOf(init)).toBe("import");
    expect(init.headers).toEqual({ "Idempotency-Key": "hash-of-partners-csv" });
  });

  it("clears the last file's results when a new file is chosen", async () => {
    client.POST.mockResolvedValue(ok(checkResult()));
    renderView();

    chooseFile();
    fireEvent.click(screen.getByRole("button", { name: "Check file" }));
    expect(await screen.findByText("Check results")).toBeInTheDocument();

    chooseFile("other.csv");
    expect(screen.queryByText("Check results")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /import \d+ partners?/i })).not.toBeInTheDocument();
  });

  it("refuses a file over 1 MB before uploading it", async () => {
    renderView();

    chooseFile("big.csv", 2 * 1024 * 1024);
    fireEvent.click(screen.getByRole("button", { name: "Check file" }));

    expect(await screen.findByText(/over 1 MB/i)).toBeInTheDocument();
    expect(client.POST).not.toHaveBeenCalled();
  });

  it("explains an older server reply instead of rendering it", async () => {
    // The pre-0029 endpoint answers `{ dry_run, results }`, which has no `summary` or `rows`.
    client.POST.mockResolvedValue(
      ok({ dry_run: true, results: { created: 1, skipped: 0, errors: 0, rows: [] } }),
    );
    renderView();

    chooseFile();
    fireEvent.click(screen.getByRole("button", { name: "Check file" }));

    expect(await screen.findByText(/older partner import/i)).toBeInTheDocument();
    expect(screen.queryByText("Check results")).not.toBeInTheDocument();
  });

  it("shows a refusal as an error, not as an empty result", async () => {
    client.POST.mockResolvedValue({
      error: { detail: "CSRF Failed" },
      response: new Response(null, { status: 403 }),
    });
    renderView();

    chooseFile();
    fireEvent.click(screen.getByRole("button", { name: "Check file" }));

    expect(await screen.findByText("This file was not imported")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Check results")).not.toBeInTheDocument());
  });
});
