import { Plus } from "lucide-react";
import { Button, EmptyState } from "@vsolve/ui";

export interface WorkspaceEmptyStateProps {
  onCreate: () => void;
}

export function WorkspaceEmptyState({ onCreate }: WorkspaceEmptyStateProps) {
  return (
    <EmptyState
      title="No listings in this view"
      description="Create a new opening to start collecting candidate applications."
      action={
        <Button type="button" onClick={onCreate}>
          <Plus className="size-4" /> Create Opening
        </Button>
      }
    />
  );
}
