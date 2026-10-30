import { Plus } from "lucide-react";
import { Button, EmptyState, useT } from "@vsolve/ui";

export interface WorkspaceEmptyStateProps {
  onCreate: () => void;
}

export function WorkspaceEmptyState({ onCreate }: WorkspaceEmptyStateProps) {
  const t = useT();
  return (
    <EmptyState
      title={t("listings.empty.title")}
      description={t("listings.empty.description")}
      action={
        <Button type="button" onClick={onCreate}>
          <Plus className="size-4" /> {t("listings.empty.create")}
        </Button>
      }
    />
  );
}
