import { ApiRequestError } from "@vsolve/api-client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useT, useToast } from "@vsolve/ui";

import { translateProviderError } from "../payment/provider-handoff";
import { completeOrOpenCheckout } from "../payment/standalone-handoff";
import {
  serverErrorMessage,
  serverFieldErrors,
  SUCCESS_MESSAGES,
  payPaise,
  type CreateListingFormState,
  type EditListingFormState,
} from "./model";
import {
  createPartnerListing,
  purchaseSubscription,
  runListingAction,
  updatePartnerListing,
  type PartnerListing,
} from "./queries";

const BUSINESS_NAME = "Vsolve Hub";

export interface MutationHandlersProps {
  editingListing: PartnerListing | null;
  form: CreateListingFormState;
  editForm: EditListingFormState;
  onUpdateSuccess: () => void;
  onCreateSuccess: () => void;
  onActionSuccess: (next: "submit" | "publish" | "republish" | "close") => void;
  onSubscribeSuccess: () => void;
  /** Opens billing when publish hits the free-tier / plan cap (T20). */
  onPlanCap?: () => void;
  setCreateErrors: (errors: Record<string, string>) => void;
  setEditErrors: (errors: Record<string, string>) => void;
  setActionError: (err: string | null) => void;
}

export function usePartnerListingMutations({
  editingListing,
  form,
  editForm,
  onUpdateSuccess,
  onCreateSuccess,
  onActionSuccess,
  onSubscribeSuccess,
  onPlanCap,
  setCreateErrors,
  setEditErrors,
  setActionError,
}: MutationHandlersProps) {
  const queryClient = useQueryClient();
  const t = useT();
  const { notify } = useToast();
  /** Tracks whether the Razorpay widget is open (blocks double-launch). */
  const [isHandingOff, setIsHandingOff] = useState(false);

  const invalidateLists = () => {
    queryClient.invalidateQueries({ queryKey: ["partner-listings"] });
    queryClient.invalidateQueries({ queryKey: ["partner-listing-home"] });
  };

  const update = useMutation({
    mutationFn: () => {
      if (!editingListing) throw new Error(t("listings.mutations.noListingSelected"));

      const payload: Record<string, unknown> = {
        title: editForm.title,
        description: editForm.description,
        location_text: editForm.location_text,
        contact_phone: editForm.contact_phone,
        contact_email: editForm.contact_email || undefined,
        structured_fields: {
          role_type: editForm.role_type,
          shift: editForm.shift,
          experience_years: editForm.experience_years,
        },
      };

      const pay = payPaise(editForm);
      if (pay) {
        payload.salary_min_paise = pay.min;
        payload.salary_max_paise = pay.max;
        payload.salary_period = editForm.salary_period;
      }

      return updatePartnerListing(editingListing.id, payload as Parameters<typeof updatePartnerListing>[1]);
    },
    onSuccess: () => {
      onUpdateSuccess();
      notify(t(SUCCESS_MESSAGES.update));
      invalidateLists();
    },
    onError: (error) => setEditErrors(serverFieldErrors(error)),
  });

  const create = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        variant: form.variant || undefined,
        service_id: form.service_id || undefined,
        title: form.title,
        description: form.description,
        location_text: form.location_text,
        contact_phone: form.contact_phone,
        contact_email: form.contact_email || undefined,
        structured_fields: {
          role_type: form.role_type,
          shift: form.shift,
          experience_years: form.experience_years,
        },
      };

      const pay = payPaise(form);
      if (pay) {
        payload.salary_min_paise = pay.min;
        payload.salary_max_paise = pay.max;
        payload.salary_period = form.salary_period;
      }

      return createPartnerListing(payload as Parameters<typeof createPartnerListing>[0]);
    },
    onSuccess: () => {
      onCreateSuccess();
      notify(t(SUCCESS_MESSAGES.create));
      invalidateLists();
    },
    onError: (error) => setCreateErrors(serverFieldErrors(error)),
  });

  const action = useMutation({
    mutationFn: ({
      id,
      next,
      reason,
    }: {
      id: string;
      next: "submit" | "publish" | "republish" | "close";
      reason?: string;
    }) => runListingAction(id, next, reason),
    onSuccess: (_result, { next }) => {
      onActionSuccess(next);
      notify(t(SUCCESS_MESSAGES[next]));
      invalidateLists();
    },
    onError: (error, { next }) => {
      if (
        error instanceof ApiRequestError &&
        error.code === "listing_plan_cap" &&
        (next === "publish" || next === "republish")
      ) {
        onPlanCap?.();
        setActionError(
          serverErrorMessage(
            error,
            t("listings.mutations.planCap"),
          ),
        );
        return;
      }
      setActionError(
        serverErrorMessage(error, t(`listings.mutations.actionFailed.${next}`)),
      );
    },
  });

  const subscribe = useMutation({
    mutationFn: async (planId: string) => {
      const sub = await purchaseSubscription(planId);

      if (!sub.payment_attempt_id) {
        // No payment needed (free tier or already active)
        notify(t(SUCCESS_MESSAGES.subscribe));
        return sub;
      }

      setIsHandingOff(true);
      try {
        const result = await completeOrOpenCheckout(String(sub.payment_attempt_id), {
          businessName: BUSINESS_NAME,
          onAwaitingCapture: () =>
            notify(t("listings.mutations.completePayment")),
        });

        if (result.mode === "simulated") {
          notify(t(SUCCESS_MESSAGES.subscribe));
          return sub;
        }
        if (result.mode === "pending") {
          notify(t("listings.mutations.paymentPreparing"));
          return sub;
        }
        notify(t("listings.mutations.paymentSubmitted"));
        // Brief poll so a fast webhook can light up ACTIVE before we leave.
        for (let i = 0; i < 6; i += 1) {
          await new Promise((r) => setTimeout(r, 800));
          invalidateLists();
        }
        return sub;
      } finally {
        setIsHandingOff(false);
      }
    },
    onSuccess: () => {
      onSubscribeSuccess();
      invalidateLists();
    },
    onError: (error) =>
      setActionError(
        translateProviderError(t, serverErrorMessage(error, t("listings.mutations.subscribeFailed"))),
      ),
  });

  return { create, update, action, subscribe, isHandingOff };
}
