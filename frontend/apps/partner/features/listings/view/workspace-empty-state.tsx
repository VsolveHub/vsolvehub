import { BriefcaseBusiness, Plus } from "lucide-react";

export interface WorkspaceEmptyStateProps {
  onCreate: () => void;
}

export function WorkspaceEmptyState({ onCreate }: WorkspaceEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-16 text-center">
      <BriefcaseBusiness className="h-12 w-12 text-slate-300" />
      <h3 className="mt-3 text-base font-semibold text-slate-900">No listings in this view</h3>
      <p className="mt-1 text-sm text-slate-500">
        Create a new opening to start collecting candidate applications.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        <Plus className="h-4 w-4" /> Create Opening
      </button>
    </div>
  );
}
