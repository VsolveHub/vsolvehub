import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@vsolve/ui";

import {
  serverErrorMessage,
  serverFieldErrors,
  SUCCESS_MESSAGES,
  type CreateListingFormState,
  type EditListingFormState,
} from "./model";
import {
  completePaymentAttempt,
  createPartnerListing,
  purchaseSubscription,
  runListingAction,
  updatePartnerListing,
  type PartnerListing,
} from "./queries";

export interface MutationHandlersProps {
  editingListing: PartnerListing | null;
  form: CreateListingFormState;
  editForm: EditListingFormState;
  onUpdateSuccess: () => void;
  onCreateSuccess: () => void;
  onActionSuccess: (next: "submit" | "publish" | "republish" | "close") => void;
  onSubscribeSuccess: () => void;
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
  setCreateErrors,
  setEditErrors,
  setActionError,
}: MutationHandlersProps) {
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const invalidateLists = () => {
    queryClient.invalidateQueries({ queryKey: ["partner-listings"] });
    queryClient.invalidateQueries({ queryKey: ["partner-listing-home"] });
  };

  const update = useMutation({
    mutationFn: () => {
      if (!editingListing) throw new Error("No listing selected for editing");
      return updatePartnerListing(editingListing.id, {
        title: editForm.title,
        description: editForm.description,
        location_text: editForm.location_text,
        contact_phone: editForm.contact_phone,
        contact_email: editForm.contact_email || undefined,
        structured_fields: {
          role_type: editForm.role_type,
          pay_range: editForm.pay_range,
          work_mode: editForm.work_mode,
          experience_years: editForm.experience_years,
        },
      });
    },
    onSuccess: () => {
      onUpdateSuccess();
      notify(SUCCESS_MESSAGES.update);
      invalidateLists();
    },
    onError: (error) => setEditErrors(serverFieldErrors(error)),
  });

  const create = useMutation({
    mutationFn: () =>
      createPartnerListing({
        variant: form.variant || undefined,
        service_id: form.service_id || undefined,
        title: form.title,
        description: form.description,
        location_text: form.location_text,
        contact_phone: form.contact_phone,
        contact_email: form.contact_email || undefined,
        structured_fields: {
          role_type: form.role_type,
          pay_range: form.pay_range,
          work_mode: form.work_mode,
          experience_years: form.experience_years,
        },
      }),
    onSuccess: () => {
      onCreateSuccess();
      notify(SUCCESS_MESSAGES.create);
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
      notify(SUCCESS_MESSAGES[next]);
      invalidateLists();
    },
    onError: (error, { next }) =>
      setActionError(
        serverErrorMessage(error, `Could not ${next} this opening. Please try again.`),
      ),
  });

  const subscribe = useMutation({
    mutationFn: async (planId: string) => {
      const sub = await purchaseSubscription(planId);
      if (sub.payment_attempt_id) {
        try {
          await completePaymentAttempt(sub.payment_attempt_id);
        } catch (err) {
          console.warn("Auto-capture subscription warning:", err);
        }
      }
      return sub;
    },
    onSuccess: () => {
      onSubscribeSuccess();
      notify(SUCCESS_MESSAGES.subscribe);
      invalidateLists();
    },
    onError: (error) =>
      setActionError(
        serverErrorMessage(error, "Could not activate the subscription. Please try again."),
      ),
  });

  return { create, update, action, subscribe };
}
