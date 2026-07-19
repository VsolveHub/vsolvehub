import { FlaticonIcon } from "@/components/ui/FlaticonIcon";

export function EmptyState({ onShowAll }: { onShowAll: () => void }) {
  return (
    <div className="text-center py-16 bg-slate-50 rounded-3xl border border-dashed border-gray-200">
      <span className="text-slate-300 inline-block mb-3">
        <FlaticonIcon name="search-alt" size={48} />
      </span>
      <p className="text-slate-500 text-sm font-semibold">No services found under this tab.</p>
      <button
        onClick={onShowAll}
        className="mt-4 px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-full text-xs font-bold cursor-pointer transition-colors"
      >
        Show All Services
      </button>
    </div>
  );
}
