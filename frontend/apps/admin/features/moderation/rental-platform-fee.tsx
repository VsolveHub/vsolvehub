"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Field, Input } from "@vsolve/ui";
import { useEffect, useState } from "react";

import { fetchOpsRentalPlatformFee, saveOpsRentalPlatformFee } from "./queries";

export function RentalPlatformFeeForm() {
  const queryClient = useQueryClient();
  const fee = useQuery({
    queryKey: ["ops", "rental-platform-fee"],
    queryFn: fetchOpsRentalPlatformFee,
  });
  const [percent, setPercent] = useState("");

  useEffect(() => {
    if (fee.data) setPercent(String(fee.data.percent));
  }, [fee.data]);

  const save = useMutation({
    mutationFn: () => saveOpsRentalPlatformFee(Number(percent)),
    onSuccess: (saved) => {
      setPercent(String(saved.percent));
      void queryClient.invalidateQueries({ queryKey: ["ops", "rental-platform-fee"] });
    },
  });

  const value = Number(percent);
  const ready =
    percent.trim() !== "" && Number.isInteger(value) && value >= 0 && value <= 100;

  return (
    <Card padding="md">
      <h2 className="text-sm font-semibold text-navy-900">Platform fee</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Added on top of the daily rate. The refundable deposit is not included.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field label="Percent">
          <Input
            inputMode="numeric"
            value={percent}
            onChange={(event) => setPercent(event.target.value)}
          />
        </Field>
        <Button
          loading={save.isPending}
          disabled={!ready || fee.isPending}
          onClick={() => save.mutate()}
        >
          Save
        </Button>
      </div>
      {save.isError ? (
        <p className="mt-2 text-sm text-rose-700">The platform fee was not saved. Try again.</p>
      ) : null}
    </Card>
  );
}
