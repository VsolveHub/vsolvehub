"use client";

import { useState } from "react";
import { request } from "@vsolve/api-client";
import { Button, ErrorState } from "@vsolve/ui";

import { getApiClient } from "@/lib/api/browser";

interface ImportRow {
  row: number;
  status: string;
  message?: string;
  phone?: string;
}

interface ImportResultsPayload {
  created?: number;
  skipped?: number;
  errors?: number;
  rows?: ImportRow[];
}

interface ImportResult {
  dry_run?: boolean;
  results?: ImportResultsPayload;
  error?: string;
}

export function ImportView() {
  const [file, setFile] = useState<File | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setFailure(null);
    setResult(null);
    try {
      // Through the API client, which carries the CSRF token: a bare fetch was refused by Django
      // and the refusal rendered as an all-zero "Results" panel.
      const data = await request(() =>
        getApiClient().POST("/api/v1/operations/partners/import/", {
          body: { file, dry_run: String(dryRun) },
          bodySerializer() {
            const form = new FormData();
            form.append("file", file, file.name);
            form.append("dry_run", String(dryRun));
            return form;
          },
        }),
      );
      // The contract publishes no response schema for this endpoint yet (backend ask), so the
      // shape the view already relied on is asserted here.
      setResult(data as unknown as ImportResult);
    } catch (error) {
      setFailure(
        error instanceof Error && error.message
          ? error.message
          : "The file was not imported. Check it is a CSV with the headers below and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface border border-line rounded-card p-4 sm:p-6 shadow-card max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-text mb-6">Import partners</h1>
      
      <div className="space-y-6">
        <div>
          <label htmlFor="partner-import-file" className="block text-sm font-medium text-text mb-2">CSV file</label>
          <input
            id="partner-import-file"
            type="file"
            accept=".csv,text/csv"
            aria-describedby="partner-import-headers"
            onChange={e => {
              // A new file makes the last file's results stale.
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setFailure(null);
            }}
            className="block w-full text-sm text-text border border-line rounded-md p-2"
          />
          <p id="partner-import-headers" className="mt-2 text-xs text-text-muted">Requires headers: phone, full_name, city</p>
        </div>

        <div className="flex items-center gap-2">
          <input 
            type="checkbox" 
            id="dryRun"
            checked={dryRun}
            onChange={e => setDryRun(e.target.checked)}
            className="h-4 w-4 rounded border-line text-brand focus:ring-brand"
          />
          <label htmlFor="dryRun" className="text-sm text-text">
            Dry run — check the file without creating anyone
          </label>
        </div>

        <Button 
          disabled={!file || loading} 
          onClick={handleImport}
          loading={loading}
          loadingLabel="Importing"
        >
          {dryRun ? "Check file" : "Import partners"}
        </Button>
        {!dryRun ? (
          <p className="text-sm text-warning-text">
            This creates partner accounts for every valid row. Run a dry run first if you have not.
          </p>
        ) : null}

        {failure ? (
          <ErrorState inline title="We could not import this file" message={failure} />
        ) : null}

        {result && (
          <div className="mt-8 pt-6 border-t border-line">
            <h2 className="text-lg font-bold text-text mb-4">{result.dry_run ? "Dry run results — nothing was created" : "Import results"}</h2>
            <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
              <div className="bg-success-surface p-4 rounded-lg text-success-text">
                <span className="block text-sm font-medium">{result.dry_run ? "Would create" : "Created"}</span>
                <span className="block text-2xl font-bold">{result.results?.created ?? 0}</span>
              </div>
              <div className="bg-warning-surface p-4 rounded-lg text-warning-text">
                <span className="block text-sm font-medium">Skipped</span>
                <span className="block text-2xl font-bold">{result.results?.skipped ?? 0}</span>
              </div>
              <div className="bg-danger-surface p-4 rounded-lg text-danger-text">
                <span className="block text-sm font-medium">Errors</span>
                <span className="block text-2xl font-bold">{result.results?.errors ?? 0}</span>
              </div>
            </div>
            
            {(result.results?.rows?.length ?? 0) > 0 && (
              <div className="max-h-64 overflow-auto border border-line rounded-lg text-sm">
                <table className="w-full text-left">
                  <thead className="bg-surface-hover sticky top-0">
                    <tr>
                      <th className="p-2 font-medium">Row</th>
                      <th className="p-2 font-medium">Status</th>
                      <th className="p-2 font-medium">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {result.results?.rows?.slice(0, 50).map((r: ImportRow, i: number) => (
                      <tr key={i}>
                        <td className="p-2">{r.row}</td>
                        {/* The server reports "created" on a dry run too; nothing was. */}
                        <td className="p-2">{result.dry_run && r.status === "created" ? "would create" : r.status}</td>
                        <td className="p-2">{r.message || r.phone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
