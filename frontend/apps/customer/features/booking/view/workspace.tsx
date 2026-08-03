"use client";

import type { Schemas } from "@vsolve/api-client";
import { describeError } from "@vsolve/query";
import { Button } from "@vsolve/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { duplicateCartItemConflict, cartVersionConflict } from "../group/conflicts";
import { useAddCartItem, useCart } from "../group/queries";
import { totalTaskQuantity } from "../model/state";
import { DuplicateItemDialog } from "./cart-conflict-dialog";
import { ScopeStage } from "./scope-stage";
import type { TaskOption } from "./task-picker";
import { useWorkspace } from "./workspace-context";

/**
 * Configuring one service, then adding it to the booking.
 *
 * This screen used to own the whole journey — address, scope, arrival window and
 * review — because a booking was one service. Under the Booking Group model it
 * owns exactly one decision: what this service should cover. Where the work
 * happens, when it starts and what it all costs are properties of the *group*,
 * so they are settled once at `/cart` against every item rather than repeatedly
 * against one.
 *
 * ## Adding is an append
 *
 * `POST /cart/items/` never replaces anything. The dialog that used to ask
 * whether to discard an existing service is gone with the cardinality that
 * required it; what survives is the shape of that interaction, reused for the
 * one refusal Django still makes here — an *identical* request already in the
 * cart, which it answers with `duplicate_cart_item` and a pointer to the item
 * that already says this.
 */

const BLOCK_MESSAGES: Record<string, string> = {
  NO_TASK_SELECTED: "Choose at least one job.",
  REQUIRED_QUESTION_UNANSWERED: "Answer the questions marked required.",
  CONFIGURATION_NOT_LOADED: "Loading this service.",
};

export interface BookingWorkspaceProps {
  service: Schemas["ServiceDetail"];
  variant: Schemas["ServiceVariantConfiguration"];
  /**
   * Task rates for this variant.
   *
   * Passed in rather than read from `variant` because the published contract
   * does not carry task rates yet — see proposal 0003 §A3. When it does, this
   * prop disappears and the picker reads the variant directly.
   */
  tasks: readonly TaskOption[];
  /** Minimum service subtotal in paise, or null while unpublished. */
  minimumSubtotalPaise: number | null;
}

export function BookingWorkspace({
  service,
  variant,
  tasks,
  minimumSubtotalPaise,
}: BookingWorkspaceProps) {
  const { state, blocked, canContinue } = useWorkspace();
  const [showScopeErrors, setShowScopeErrors] = useState(false);
  const router = useRouter();

  // The cart is read here for one reason: `expected_cart_version`. Every write
  // command carries it, and a version guessed or remembered from an earlier
  // render is exactly what the guard exists to reject.
  const cartQuery = useCart();
  const addItem = useAddCartItem();

  const duplicate = duplicateCartItemConflict(addItem.error);
  const staleVersion = cartVersionConflict(addItem.error);

  function handleAdd() {
    if (!canContinue) {
      setShowScopeErrors(true);
      return;
    }
    setShowScopeErrors(false);

    const cart = cartQuery.data;
    if (!cart) return;

    addItem.mutate(
      {
        expectedCartVersion: cart.version,
        variantId: variant.id,
        quantity: totalTaskQuantity(state),
        scope: state.answers,
      },
      { onSuccess: () => router.push("/cart") },
    );
  }

  return (
    // The action bar is fixed over the content on a phone, and the viewport is
    // `viewportFit: cover`, so the reserved space has to clear the home
    // indicator as well as the bar itself.
    <div className="mx-auto w-full max-w-5xl px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-6 lg:pb-12">
      <main aria-label="What you need" className="outline-none">
        <h1 className="text-xl font-bold text-text">{service.name}</h1>

        <div className="mt-4">
          <ScopeStage
            questions={variant.questions}
            tasks={tasks}
            minimumSubtotalPaise={minimumSubtotalPaise}
            showErrors={showScopeErrors}
          />
        </div>

        {staleVersion !== null ? (
          <p className="mt-4 text-sm text-critical" role="alert">
            Your booking changed in another tab, so this was not added. We have reloaded
            it — press Add again.
          </p>
        ) : null}

        {addItem.isError && staleVersion === null && duplicate === null ? (
          <p className="mt-4 text-sm text-critical" role="alert">
            {describeError(addItem.error, "mutation").message}
          </p>
        ) : null}
      </main>

      <DuplicateItemDialog
        isOpen={duplicate !== null}
        serviceName={service.name}
        onViewBooking={() => router.push("/cart")}
        onDismiss={() => addItem.reset()}
      />

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:static lg:mt-8 lg:border-0 lg:bg-transparent lg:p-0">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <Button variant="ghost" onClick={() => router.push("/cart")}>
            View booking
          </Button>

          <div className="flex flex-1 items-center justify-end gap-4">
            {blocked && !canContinue ? (
              <p className="text-sm text-text-secondary" aria-live="polite">
                {BLOCK_MESSAGES[blocked] ?? "Complete this step to continue."}
              </p>
            ) : null}
            <Button
              onClick={handleAdd}
              disabled={!canContinue || cartQuery.isPending}
              loading={addItem.isPending}
              loadingLabel="Adding"
            >
              Add to booking
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
