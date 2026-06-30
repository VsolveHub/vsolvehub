"use client";

import { useState } from "react";
import { Landmark } from "lucide-react";
import { Button } from "@vsolve/ui";
import { WithdrawSheet } from "../../live/withdraw-sheet";

export function WithdrawButton({
  balance,
  bankLast4,
}: {
  balance: number;
  bankLast4: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button className="mt-4 w-full" onClick={() => setOpen(true)}>
        <Landmark className="h-4 w-4" /> Withdraw to Bank
      </Button>
      {open && (
        <WithdrawSheet
          balance={balance}
          bankLast4={bankLast4}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
