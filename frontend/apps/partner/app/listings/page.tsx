"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "@vsolve/api-client";
import { friendlyErrorMessage } from "@vsolve/query";
import { useT, useToast } from "@vsolve/ui";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { duplicateJob, publishJob } from "@/features/listings/jobs-queries";
import { LISTING_TABS } from "@/features/listings/model";
import { usePartnerListingsWorkspace } from "@/features/listings/use-partner-listings-workspace";
import {
  CreateListingDialog,
  EditListingDialog,
  ListingCard,
  SubscriptionDialog,
  WorkspaceEmptyState,
  WorkspaceHeader,
  WorkspaceStats,
} from "@/features/listings/view";

const TAB_LABEL_KEYS: Record<string, string> = {
  ALL: "listings.page.tab.all",
  ACTIVE: "listings.page.tab.active",
  DRAFT: "listings.page.tab.draft",
  CLOSED: "listings.page.tab.closed",
};

export default function PartnerListingsPage() {
  const t = useT();
  const {
    home,
    services,
    plans,
    isLoading,
    activeTab,
    setActiveTab,
    actionError,
    setActionError,
    isCreateOpen,
    setIsCreateOpen,
    editingListing,
    setEditingListing,
    isSubscriptionModalOpen,
    setIsSubscriptionModalOpen,
    form,
    editForm,
    createErrors,
    editErrors,
    createPending,
    createError,
    updatePending,
    updateError,
    actionPending,
    actionErrorObj,
    subscribePending,
    subscribeError,
    handleStartEdit,
    validateCreate,
    validateEdit,
    handleCreate,
    handleEdit,
    handleServiceChange,
    handleCreateFieldChange,
    handleEditFieldChange,
    runAction,
    runSubscribe,
    filteredListings,
  } = usePartnerListingsWorkspace();

  // `/listings?plans=open` (from the Matching candidates upsell) opens the plans dialog.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("plans") === "open") {
      setIsSubscriptionModalOpen(true);
    }
  }, [setIsSubscriptionModalOpen]);
  const router = useRouter();
  const qc = useQueryClient();
  const { notify } = useToast();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["partner-listings"] });
    void qc.invalidateQueries({ queryKey: ["partner-listing-home"] });
  };
  const publishNow = useMutation({
    mutationFn: publishJob,
    onSuccess: () => {
      notify(t("listings.wizard.jobLive"));
      setActionError(null);
      refresh();
    },
    onError: (err) => {
      if (err instanceof ApiRequestError && err.code === "listing_plan_cap") {
        setIsSubscriptionModalOpen(true);
      }
      setActionError(friendlyErrorMessage(err));
    },
  });
  const duplicate = useMutation({
    mutationFn: duplicateJob,
    onSuccess: (copy) => {
      refresh();
      router.push(`/listings/post?edit=${copy.id}`);
    },
    onError: (err) => setActionError(friendlyErrorMessage(err)),
  });
  const openPostJob = () => router.push("/listings/post");

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8">
      {actionError ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-4 rounded-control border border-danger-line bg-danger-surface p-4 text-sm text-danger-text"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="shrink-0 text-xs font-semibold text-danger-text underline"
          >
            {t("listings.page.dismiss")}
          </button>
        </div>
      ) : null}

      <WorkspaceHeader
        subscriptionPlanName={home?.subscription?.plan_name}
        onOpenSubscription={() => setIsSubscriptionModalOpen(true)}
        onOpenCreate={openPostJob}
      />

      <WorkspaceStats home={home} />

      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
        {LISTING_TABS.map((tab) => (
          <button
            type="button"
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              activeTab === tab.key
                ? "bg-navy-900 text-warm-0 shadow-xs"
                : "border border-line bg-surface text-text-secondary hover:border-line-strong hover:bg-surface-hover"
            }`}
          >
            {t(TAB_LABEL_KEYS[tab.key] ?? tab.key)}
          </button>
        ))}
      </div>

      {actionErrorObj && (
        <div className="rounded-control border border-danger-line bg-danger-surface p-3 text-xs text-danger-text">
          {(actionErrorObj as Error).message}
        </div>
      )}

      <div className="grid gap-4">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-text-muted">{t("listings.page.loadingWorkspace")}</div>
        ) : null}

        {!isLoading && filteredListings.length === 0 ? (
          <WorkspaceEmptyState onCreate={openPostJob} />
        ) : null}

        {filteredListings.map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            onStartEdit={handleStartEdit}
            onAction={runAction}
            onPublishNow={(id) => publishNow.mutate(id)}
            onDuplicate={(id) => duplicate.mutate(id)}
            isActionPending={actionPending || publishNow.isPending || duplicate.isPending}
          />
        ))}
      </div>

      <CreateListingDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        form={form}
        errors={createErrors}
        isPending={createPending}
        services={services}
        onFieldChange={handleCreateFieldChange}
        onServiceChange={handleServiceChange}
        onValidate={validateCreate}
        onSubmit={handleCreate}
        serverError={
          createError && Object.keys(createErrors).length === 0
            ? (createError as Error).message
            : undefined
        }
      />

      <EditListingDialog
        listing={editingListing}
        onClose={() => setEditingListing(null)}
        form={editForm}
        errors={editErrors}
        isPending={updatePending}
        onFieldChange={handleEditFieldChange}
        onValidate={validateEdit}
        onSubmit={handleEdit}
        serverError={
          updateError && Object.keys(editErrors).length === 0
            ? (updateError as Error).message
            : undefined
        }
      />

      <SubscriptionDialog
        isOpen={isSubscriptionModalOpen}
        onClose={() => setIsSubscriptionModalOpen(false)}
        plans={plans}
        currentPlanName={home?.subscription?.plan_name}
        onSubscribe={runSubscribe}
        isPending={subscribePending}
        error={subscribeError ? (subscribeError as Error).message : undefined}
      />
    </main>
  );
}
