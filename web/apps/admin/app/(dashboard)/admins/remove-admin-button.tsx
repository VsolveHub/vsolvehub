"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import { removeAdmin, type AdminFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Remove admin"
      title="Remove admin"
      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-danger disabled:pointer-events-none disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

export function RemoveAdminButton({ id, email }: { id: string; email: string }) {
  const [state, action] = useActionState<AdminFormState, FormData>(removeAdmin, {});

  return (
    <div className="flex items-center justify-end gap-2">
      {state.error ? <p className="text-xs text-danger">{state.error}</p> : null}
      <form
        action={action}
        onSubmit={(e) => {
          if (!confirm(`Remove ${email} from admin access?`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <SubmitButton />
      </form>
    </div>
  );
}
