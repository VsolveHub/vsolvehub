"use client";

import { Button, Dialog, Field, Input } from "@vsolve/ui";
import { describeError, type Engagement } from "@vsolve/query";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { useCompleteProjectWithCode } from "../queries";

export function ProjectCompletionControl({ engagement }: { readonly engagement: Engagement }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const completion = useCompleteProjectWithCode(engagement.id);
  const terminal = ["COMPLETED", "WARRANTY", "CLOSED"].includes(engagement.status);
  const allFunded = engagement.stages.every(
    (stage) => stage.status === "CANCELLED" || stage.funding_state === "FUNDED",
  );

  if (terminal) {
    return (
      <p className="flex items-center gap-2 text-sm font-semibold text-success-text">
        <CheckCircle2 size={18} aria-hidden /> Project completed
      </p>
    );
  }

  if (!allFunded || engagement.status === "DISPUTED" || engagement.status === "CANCELLED") {
    return null;
  }

  const error = completion.isError ? describeError(completion.error, "mutation") : null;
  const submit = () => {
    const digits = code.replace(/\D/g, "");
    if (digits.length < 4) return;
    completion.mutate(
      { code: digits },
      {
        onSuccess: () => {
          setOpen(false);
          setCode("");
        },
      },
    );
  };

  return (
    <>
      <Button type="button" size="lg" onClick={() => setOpen(true)} className="w-full sm:w-auto">
        End project
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="End this project"
        description="Ask the customer for the completion code shown in their booking. This closes every stage and the project."
        dismissable={!completion.isPending}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={completion.isPending}>
              Not yet
            </Button>
            <Button
              onClick={submit}
              loading={completion.isPending}
              loadingLabel="Completing"
              disabled={code.replace(/\D/g, "").length < 4}
            >
              Complete project
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field
            label="Completion code"
            required
            description="The customer must share this only after checking the finished work."
            error={error?.message}
          >
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Enter code"
              className="text-center text-xl font-bold tracking-[0.3em]"
              disabled={completion.isPending}
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
