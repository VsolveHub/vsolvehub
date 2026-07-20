type BadgeProps = {
  status: string;
  children: React.ReactNode;
};

/** Status → colour map migrated from the old .badge-* classes. */
const STATUS_STYLES: Record<string, string> = {
  searching: "bg-amber-100 text-amber-800",
  requested: "bg-amber-100 text-amber-800",
  pending: "bg-amber-100 text-amber-800",
  assigned: "bg-blue-100 text-blue-800",
  accepted: "bg-blue-100 text-blue-800",
  confirmed: "bg-blue-100 text-blue-800",
  on_the_way: "bg-indigo-100 text-indigo-800",
  dispatched: "bg-indigo-100 text-indigo-800",
  arrived: "bg-emerald-100 text-emerald-800",
  in_progress: "bg-cyan-100 text-cyan-800",
  started: "bg-cyan-100 text-cyan-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-700",
};

export function Badge({ status, children }: BadgeProps) {
  const key = status.toLowerCase();
  const tone = STATUS_STYLES[key] ?? "bg-gray-100 text-gray-700";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {children}
    </span>
  );
}
