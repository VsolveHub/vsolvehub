import { request } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";

/**
 * Operations partner import, built against contract proposal 0029
 * (`contracts/proposals/0029-operations-partner-import.md`).
 *
 * The published contract does not describe this endpoint's response yet, so the proposal's shape
 * lives here. When the backend publishes 0029, replace these types with `Schemas[...]` and drop
 * the cast in `runPartnerImport`.
 */

export type ImportMode = "check" | "import";
export type ImportRowStatus = "ready" | "created" | "skipped" | "error";

export interface ImportCellError {
  column: string;
  message: string;
}

export interface ImportRow {
  row: number;
  status: ImportRowStatus;
  phone: string;
  full_name: string;
  track: string;
  errors: ImportCellError[];
  message?: string;
  partner_id?: string;
}

export interface ImportSummary {
  total: number;
  ready?: number;
  created?: number;
  skipped: number;
  errors: number;
}

export interface ImportResponse {
  mode: ImportMode;
  file_sha256: string;
  summary: ImportSummary;
  rows: ImportRow[];
}

/** The server's limits, repeated here only so an oversized file is refused before upload. */
export const MAX_IMPORT_BYTES = 1024 * 1024;
export const MAX_IMPORT_ROWS = 500;

export interface ImportColumn {
  name: string;
  required: string;
  rule: string;
}

/** The file's columns, in template order. Mirrors the table in proposal 0029. */
export const IMPORT_COLUMNS: readonly ImportColumn[] = [
  { name: "phone", required: "Always", rule: "10-digit Indian mobile number" },
  { name: "full_name", required: "Always", rule: "2–120 characters" },
  {
    name: "track",
    required: "Always",
    rule: "SERVICES, STAY_HOST, RENTAL_OWNER or EMPLOYER",
  },
  {
    name: "service_area",
    required: "SERVICES only",
    rule: "An area code from the list below. Leave empty for other tracks",
  },
  {
    name: "skills",
    required: "SERVICES only",
    rule: "Skill codes from the list below, separated by | (e.g. plumbing|electrical)",
  },
  { name: "experience_years", required: "No", rule: "Whole number 0–60. Empty means 0" },
];

/**
 * A template with the headers and one example per kind of row. The services example uses real
 * codes from the server, so an untouched template passes its own check.
 */
export function importTemplateCsv({
  serviceArea,
  skills,
}: {
  serviceArea: string;
  skills: readonly string[];
}): string {
  return [
    IMPORT_COLUMNS.map((column) => column.name).join(","),
    `9876543210,Ravi Kumar,SERVICES,${serviceArea},${skills.join("|")},4`,
    "9812345678,Asha Reddy,STAY_HOST,,,",
  ]
    .join("\n")
    .concat("\n");
}

/** SHA-256 of the file, hex. The import's idempotency key, so a double click imports once. */
export async function fileSha256(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function runPartnerImport({
  file,
  mode,
  idempotencyKey,
}: {
  file: File;
  mode: ImportMode;
  /** Required for `import`; the server refuses an import without one. */
  idempotencyKey?: string;
}): Promise<ImportResponse> {
  const data = await request(() =>
    getApiClient().POST("/api/v1/operations/partners/import/", {
      body: { file, mode },
      // Multipart by hand: the client's default serialiser would send JSON.
      bodySerializer() {
        const form = new FormData();
        form.append("file", file, file.name);
        form.append("mode", mode);
        return form;
      },
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    }),
  );
  // The contract does not type this response yet, so check its shape here rather than render a
  // body this screen does not understand. The old endpoint replies with `results`, not `summary`.
  const body = data as unknown as Partial<ImportResponse> | undefined;
  if (!body || typeof body.summary !== "object" || !Array.isArray(body.rows)) {
    throw new Error(
      "The server is running an older partner import that this screen does not support. " +
        "Nothing was imported.",
    );
  }
  return body as ImportResponse;
}

/** One line per problem, for the problems table: a row can fail several columns at once. */
export function importProblems(rows: readonly ImportRow[]) {
  return rows.flatMap((row) =>
    row.status === "error"
      ? row.errors.map((error, index) => ({
          key: `${row.row}-${index}`,
          row: row.row,
          column: error.column,
          message: error.message,
        }))
      : [],
  );
}
