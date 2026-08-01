"use client";

import { formatMoney } from "@vsolve/ui";

import { useWorkspace } from "./workspace-context";

/**
 * Task-line selection — what an A1 customer actually buys.
 *
 * ADR-008: A1 is task-priced. The customer picks task units ("2 × fan
 * installation"), and the estimated duration follows from those units rather
 * than the other way round. This replaces the duration picker the previous
 * design had, which let the customer adjust a number that changed neither the
 * price nor the work.
 *
 * The minimum visit charge is shown here rather than only at review, because
 * [05 §A1](../../../../../../Django_Next.js_Plan/05-pricing-payments-and-settlement.md)
 * requires the minimum payable amount to be visible from the catalog onward — an
 * unreachable "starts at" price is forbidden. A customer choosing one ₹129 task
 * must be able to see, at the moment they choose it, that they will pay ₹199.
 */

export interface TaskOption {
  code: string;
  label: string;
  /** Unit price in paise, from the catalog's task rates. */
  unitPricePaise: number;
  description?: string;
}

export interface TaskPickerProps {
  tasks: readonly TaskOption[];
  /**
   * Minimum service subtotal in paise, from the catalog.
   *
   * Null while the contract does not publish it (proposal 0003 §A3). When it is
   * null the notice is omitted entirely rather than falling back to a hardcoded
   * ₹199 — a frontend copy of a configured amount is exactly the thing that goes
   * stale the first time Operations changes it, and it would be shown to the
   * customer as though the server had said it.
   */
  minimumSubtotalPaise: number | null;
}

/** Quantity stepper. Buttons rather than a number input: this is a phone-first UI. */
function Stepper({
  label,
  quantity,
  onChange,
}: {
  label: string;
  quantity: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        disabled={quantity === 0}
        aria-label={`Remove one ${label}`}
        className="flex h-11 w-11 items-center justify-center rounded-control border border-line-strong text-lg font-semibold disabled:cursor-not-allowed disabled:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
      >
        −
      </button>
      <span
        data-numeric
        aria-live="polite"
        aria-label={`${quantity} ${label}`}
        className="w-8 text-center text-base font-semibold tabular-nums"
      >
        {quantity}
      </span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        aria-label={`Add one ${label}`}
        className="flex h-11 w-11 items-center justify-center rounded-control border border-line-strong text-lg font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
      >
        +
      </button>
    </div>
  );
}

export function TaskPicker({ tasks, minimumSubtotalPaise }: TaskPickerProps) {
  const { state, dispatch } = useWorkspace();

  const quantityOf = (code: string) =>
    state.taskLines.find((line) => line.taskCode === code)?.quantity ?? 0;

  // Only ever used to decide whether to *show* the minimum-charge notice. The
  // amount the customer pays comes from the server quote, never from this sum.
  const selectedTotalPaise = state.taskLines.reduce((sum, line) => {
    const task = tasks.find((candidate) => candidate.code === line.taskCode);
    return sum + (task?.unitPricePaise ?? 0) * line.quantity;
  }, 0);

  const belowMinimum =
    minimumSubtotalPaise !== null &&
    selectedTotalPaise > 0 &&
    selectedTotalPaise < minimumSubtotalPaise;

  return (
    <fieldset className="border-0 p-0">
      <legend className="text-sm font-semibold text-text">What do you need done?</legend>
      <p className="mt-1 text-sm text-text-secondary">
        Choose how many of each. You are charged per job, not by the hour.
      </p>

      <ul className="mt-3 flex list-none flex-col gap-2 p-0">
        {tasks.map((task) => {
          const quantity = quantityOf(task.code);
          return (
            <li
              key={task.code}
              className="flex min-h-16 items-center justify-between gap-4 rounded-plate border border-line-strong px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-text">{task.label}</p>
                {task.description ? (
                  <p className="text-sm text-text-secondary">{task.description}</p>
                ) : null}
                <p data-numeric className="text-sm text-text-secondary">
                  {formatMoney(task.unitPricePaise)} each
                </p>
              </div>

              <Stepper
                label={task.label}
                quantity={quantity}
                onChange={(next) =>
                  dispatch({
                    type: "SET_TASK_QUANTITY",
                    taskCode: task.code,
                    quantity: next,
                  })
                }
              />
            </li>
          );
        })}
      </ul>

      {belowMinimum ? (
        <p
          aria-live="polite"
          className="mt-3 rounded-control bg-surface-sunken px-3 py-2 text-sm text-text-secondary"
        >
          A minimum visit charge of{" "}
          <span data-numeric className="font-semibold text-text">
            {formatMoney(minimumSubtotalPaise)}
          </span>{" "}
          applies. Add more work to this visit at no extra call-out cost.
        </p>
      ) : null}
    </fieldset>
  );
}
