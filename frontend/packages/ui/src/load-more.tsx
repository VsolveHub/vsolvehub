import { Button } from "./button";
import { useTOrDefault } from "./i18n";

export interface LoadMoreProps {
  /** More rows exist on the server. Nothing renders when false. */
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  /** "Load more bookings". Defaults to "Load more". */
  label?: string;
  className?: string;
}

/** The one way a paged list asks for its next page. */
export function LoadMore({ hasMore, loading, onLoadMore, label, className }: LoadMoreProps) {
  const tf = useTOrDefault();
  if (!hasMore) return null;
  return (
    <div className={["flex justify-center py-2", className].filter(Boolean).join(" ")}>
      <Button
        variant="outline"
        loading={loading}
        loadingLabel={tf("ui.loadMore.loading", "Loading")}
        onClick={onLoadMore}
      >
        {label ?? tf("ui.loadMore.label", "Load more")}
      </Button>
    </div>
  );
}
