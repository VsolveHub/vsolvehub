"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button, DataTable, Dialog, ErrorState, type Column } from "@vsolve/ui";

import { useServiceAreas } from "@/features/m2-rate-cards/queries";

import {
  IMPORT_COLUMNS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  fileSha256,
  importProblems,
  importTemplateCsv,
  runPartnerImport,
  type ImportResponse,
  type ImportRow,
} from "../partner-import";
import { usePartnerSkills } from "../queries";

type Problem = ReturnType<typeof importProblems>[number];

const PROBLEM_COLUMNS: Column<Problem>[] = [
  { id: "row", header: "Row", cell: (problem) => problem.row, numeric: true },
  { id: "column", header: "Column", cell: (problem) => problem.column },
  { id: "message", header: "Problem", cell: (problem) => problem.message },
];

const SKIPPED_COLUMNS: Column<ImportRow>[] = [
  { id: "row", header: "Row", cell: (row) => row.row, numeric: true },
  { id: "phone", header: "Phone", cell: (row) => row.phone },
  {
    id: "message",
    header: "Why",
    cell: (row) => row.message ?? "Already registered",
  },
];

function failureMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function downloadTemplate(example: { serviceArea: string; skills: string[] }) {
  const url = URL.createObjectURL(
    new Blob([importTemplateCsv(example)], { type: "text/csv" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "partner-import-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function ImportView() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  // The checked file's hash. Import is offered only for the file that was checked.
  const [checkedHash, setCheckedHash] = useState<string | null>(null);
  const [check, setCheck] = useState<ImportResponse | null>(null);
  const [imported, setImported] = useState<ImportResponse | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState<"check" | "import" | null>(null);
  const [confirming, setConfirming] = useState(false);

  function reset(next: File | null) {
    setFile(next);
    setCheckedHash(null);
    setCheck(null);
    setImported(null);
    setFailure(null);
    setConfirming(false);
  }

  async function checkFile() {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setFailure("This file is over 1 MB. Split it into smaller files.");
      return;
    }
    setBusy("check");
    setFailure(null);
    setCheck(null);
    try {
      const hash = await fileSha256(file);
      setCheck(await runPartnerImport({ file, mode: "check" }));
      setCheckedHash(hash);
    } catch (error) {
      setFailure(
        failureMessage(error, "The file could not be checked. Try again."),
      );
    } finally {
      setBusy(null);
    }
  }

  async function importFile() {
    if (!file || !checkedHash) return;
    setBusy("import");
    setFailure(null);
    try {
      setImported(
        await runPartnerImport({
          file,
          mode: "import",
          idempotencyKey: checkedHash,
        }),
      );
      setConfirming(false);
    } catch (error) {
      setConfirming(false);
      setFailure(
        failureMessage(
          error,
          "The import did not finish. Nothing was created. Try again.",
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  const ready = check?.summary.ready ?? 0;
  const problems = check ? importProblems(check.rows) : [];
  const skipped = check
    ? check.rows.filter((row) => row.status === "skipped")
    : [];
  const canImport = check !== null && check.summary.errors === 0 && ready > 0;

  if (imported) {
    const created = imported.summary.created ?? 0;
    return (
      <section className="mx-auto max-w-3xl rounded-card border border-line bg-surface p-4 shadow-card sm:p-6">
        <h1 className="text-2xl font-bold text-text">
          {created === 1
            ? "1 partner imported"
            : `${created} partners imported`}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Each partner now has a draft application. They sign in to the Partner
          app with their phone, accept the agreements, upload their ID and
          submit. Their application then appears in review.
        </p>
        {imported.summary.skipped > 0 ? (
          <p className="mt-2 text-sm text-text-secondary">
            {imported.summary.skipped} already registered{" "}
            {imported.summary.skipped === 1 ? "phone was" : "phones were"}{" "}
            skipped and left unchanged.
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/operations/partners"
            className="inline-flex min-h-10 items-center rounded-control bg-action px-4 text-sm font-semibold text-action-text"
          >
            Go to partners
          </Link>
          <Button
            variant="outline"
            onClick={() => {
              reset(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            Import another file
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-6">
        <h1 className="text-2xl font-bold text-text">Import partners</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Each row becomes a draft partner application. Nobody is approved by
          importing. The partner signs in with their phone to accept the
          agreements, upload their ID and submit.
        </p>

        <h2 className="mt-6 text-base font-semibold text-text">
          What the file needs
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          A CSV with these columns, up to {MAX_IMPORT_ROWS} rows and 1 MB.
        </p>
        <div className="mt-3 overflow-x-auto rounded-control border border-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Import file columns</caption>
            <thead className="bg-surface-sunken">
              <tr>
                <th scope="col" className="p-2 font-medium">
                  Column
                </th>
                <th scope="col" className="p-2 font-medium">
                  Required
                </th>
                <th scope="col" className="p-2 font-medium">
                  Rule
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {IMPORT_COLUMNS.map((column) => (
                <tr key={column.name}>
                  <td className="p-2 font-mono text-xs">{column.name}</td>
                  <td className="p-2">{column.required}</td>
                  <td className="p-2 text-text-secondary">{column.rule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CodeLists />
      </section>

      <section className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-6">
        <label
          htmlFor="partner-import-file"
          className="block text-sm font-medium text-text"
        >
          CSV file
        </label>
        <input
          ref={inputRef}
          id="partner-import-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => reset(event.target.files?.[0] ?? null)}
          className="mt-2 block w-full rounded-control border border-line p-2 text-sm text-text"
        />
        <div className="mt-4">
          <Button
            disabled={!file || busy !== null}
            loading={busy === "check"}
            loadingLabel="Checking"
            onClick={() => void checkFile()}
          >
            Check file
          </Button>
        </div>

        {failure ? (
          <div className="mt-4">
            <ErrorState
              inline
              title="This file was not imported"
              message={failure}
            />
          </div>
        ) : null}

        {check ? (
          <div className="mt-6 space-y-4 border-t border-line pt-6">
            <h2 className="text-lg font-bold text-text">Check results</h2>
            <dl className="grid grid-cols-3 gap-2 sm:gap-4">
              <Count label="Ready to import" value={ready} tone="success" />
              <Count
                label="Already registered"
                value={check.summary.skipped}
                tone="warning"
              />
              <Count
                label="Rows with problems"
                value={check.summary.errors}
                tone="danger"
              />
            </dl>

            {problems.length > 0 ? (
              <>
                <p className="text-sm font-medium text-danger-text">
                  Fix these in the file, then check it again. Nothing is
                  imported while any row has a problem.
                </p>
                <DataTable
                  caption="Rows with problems"
                  data={problems}
                  columns={PROBLEM_COLUMNS}
                  keyExtractor={(problem) => problem.key}
                />
              </>
            ) : null}

            {skipped.length > 0 ? (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-text">
                  {skipped.length} already registered — skipped, left unchanged
                </summary>
                <div className="mt-2">
                  <DataTable
                    caption="Skipped rows"
                    data={skipped}
                    columns={SKIPPED_COLUMNS}
                    keyExtractor={(row) => String(row.row)}
                  />
                </div>
              </details>
            ) : null}

            {check.summary.errors === 0 && ready === 0 ? (
              <p className="text-sm text-text-secondary">
                There is nobody new to import in this file.
              </p>
            ) : null}

            <Button
              disabled={!canImport || busy !== null}
              onClick={() => setConfirming(true)}
            >
              {ready === 1 ? "Import 1 partner" : `Import ${ready} partners`}
            </Button>
          </div>
        ) : null}
      </section>

      {confirming ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && busy === null) setConfirming(false);
          }}
          title={
            ready === 1 ? "Import 1 partner?" : `Import ${ready} partners?`
          }
          description={`This creates ${ready === 1 ? "1 partner account" : `${ready} partner accounts`} with draft applications. Each partner signs in with their phone to finish and submit.`}
          footer={
            <>
              <Button
                variant="outline"
                disabled={busy !== null}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
              <Button
                loading={busy === "import"}
                loadingLabel="Importing"
                onClick={() => void importFile()}
              >
                Import
              </Button>
            </>
          }
        >
          <p className="text-sm text-text-secondary">
            The file is checked again as it is imported. If anything has changed
            since your check, nothing is created.
          </p>
        </Dialog>
      ) : null}
    </div>
  );
}

function Count({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "danger";
}) {
  const tones = {
    success: "bg-success-surface text-success-text",
    warning: "bg-warning-surface text-warning-text",
    danger: "bg-danger-surface text-danger-text",
  } as const;
  return (
    <div className={`rounded-lg p-3 sm:p-4 ${tones[tone]}`}>
      <dt className="text-xs font-medium sm:text-sm">{label}</dt>
      <dd className="text-2xl font-bold">{value}</dd>
    </div>
  );
}

/** The codes the file must use, read from the server so they never drift from what it accepts. */
function CodeLists() {
  const areas = useServiceAreas();
  const skills = usePartnerSkills();
  const openAreas = (areas.data ?? []).filter(
    (area) => area.is_accepting_partners,
  );
  const firstArea = openAreas[0];
  const firstSkill = skills.data?.[0];

  return (
    <>
      <div className="mt-3">
        <Button
          variant="outline"
          disabled={!firstArea || !firstSkill}
          onClick={() => {
            if (firstArea && firstSkill) {
              downloadTemplate({
                serviceArea: firstArea.slug,
                skills: [firstSkill.code],
              });
            }
          }}
        >
          Download template
        </Button>
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium text-text">
          Area and skill codes you can use
        </summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="font-semibold text-text">service_area</h3>
            {areas.isError ? (
              <p className="mt-1 text-danger-text">
                Area codes could not be loaded.
              </p>
            ) : areas.isPending ? (
              <p className="mt-1 text-text-secondary">Loading…</p>
            ) : openAreas.length === 0 ? (
              <p className="mt-1 text-text-secondary">
                No area is accepting partners right now.
              </p>
            ) : (
              <ul className="mt-1 space-y-1">
                {openAreas.map((area) => (
                  <li key={area.id}>
                    <code className="font-mono text-xs">{area.slug}</code>{" "}
                    <span className="text-text-secondary">— {area.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-text">skills</h3>
            {skills.isError ? (
              <p className="mt-1 text-danger-text">
                Skill codes could not be loaded.
              </p>
            ) : skills.isPending ? (
              <p className="mt-1 text-text-secondary">Loading…</p>
            ) : (
              <ul className="mt-1 max-h-48 space-y-1 overflow-auto">
                {(skills.data ?? []).map((skill) => (
                  <li key={skill.id}>
                    <code className="font-mono text-xs">{skill.code}</code>{" "}
                    <span className="text-text-secondary">— {skill.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </details>
    </>
  );
}
