import { Button } from "./button";

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
export function LoadMore({ hasMore, loading, onLoadMore, label = "Load more", className }: LoadMoreProps) {
  if (!hasMore) return null;
  return (
    <div className={["flex justify-center py-2", className].filter(Boolean).join(" ")}>
      <Button variant="outline" loading={loading} loadingLabel="Loading" onClick={onLoadMore}>
        {label}
      </Button>
    </div>
  );
}
