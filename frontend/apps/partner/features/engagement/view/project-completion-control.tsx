"use client";

import { Button, Dialog, Field, Input, useT } from "@vsolve/ui";
import { describeError, type Engagement } from "@vsolve/query";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { useCompleteProjectWithCode } from "../queries";

export function ProjectCompletionControl({ engagement }: { readonly engagement: Engagement }) {
  const t = useT();
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
        <CheckCircle2 size={18} aria-hidden /> {t("work.projectCompletion.completed")}
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
        {t("work.projectCompletion.endProject")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("work.projectCompletion.dialogTitle")}
        description={t("work.projectCompletion.dialogDescription")}
        dismissable={!completion.isPending}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={completion.isPending}>
              {t("work.projectCompletion.notYet")}
            </Button>
            <Button
              onClick={submit}
              loading={completion.isPending}
              loadingLabel={t("work.projectCompletion.completing")}
              disabled={code.replace(/\D/g, "").length < 4}
            >
              {t("work.projectCompletion.completeProject")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field
            label={t("work.projectCompletion.codeLabel")}
            required
            description={t("work.projectCompletion.codeDescription")}
            error={error?.message}
          >
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t("work.projectCompletion.codePlaceholder")}
              className="text-center text-xl font-bold tracking-[0.3em]"
              disabled={completion.isPending}
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
