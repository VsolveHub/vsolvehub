"use client";

import { useState } from "react";
import { Button } from "@vsolve/ui";

import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

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
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("dry_run", dryRun.toString());
      
      const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/operations/partners/import/`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      console.error(e);
      alert("Import failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface border border-line rounded-card p-6 shadow-card max-w-2xl mx-auto mt-8">
      <h1 className="text-2xl font-bold text-text mb-6">Import Partners</h1>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-text mb-2">CSV File</label>
          <input 
            type="file" 
            accept=".csv"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-text border border-line rounded-md p-2"
          />
          <p className="mt-2 text-xs text-text-muted">Requires headers: phone, full_name, city</p>
        </div>

        <div className="flex items-center gap-2">
          <input 
            type="checkbox" 
            id="dryRun"
            checked={dryRun}
            onChange={e => setDryRun(e.target.checked)}
            className="rounded border-line text-brand focus:ring-brand"
          />
          <label htmlFor="dryRun" className="text-sm text-text">Dry run (validate only)</label>
        </div>

        <Button 
          disabled={!file || loading} 
          onClick={handleImport}
          loading={loading}
          loadingLabel="Importing"
        >
          {dryRun ? "Validate Import" : "Execute Import"}
        </Button>

        {result && (
          <div className="mt-8 pt-6 border-t border-line">
            <h2 className="text-lg font-bold text-text mb-4">Results {result.dry_run ? "(Dry Run)" : ""}</h2>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-success-surface p-4 rounded-lg text-success-text">
                <span className="block text-sm font-medium">Created</span>
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
              <div className="max-h-64 overflow-y-auto border border-line rounded-lg text-sm">
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
                        <td className="p-2">{r.status}</td>
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
