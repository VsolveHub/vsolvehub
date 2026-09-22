"use client";

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

export default function PartnerListingsPage() {
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
    handleCreate,
    handleEdit,
    handleServiceChange,
    handleCreateFieldChange,
    handleEditFieldChange,
    runAction,
    runSubscribe,
    filteredListings,
  } = usePartnerListingsWorkspace();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8">
      {actionError ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="shrink-0 text-xs font-semibold text-rose-700 underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <WorkspaceHeader
        subscriptionPlanName={home?.subscription?.plan_name}
        onOpenSubscription={() => setIsSubscriptionModalOpen(true)}
        onOpenCreate={() => setIsCreateOpen(true)}
      />

      <WorkspaceStats home={home} />

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        {LISTING_TABS.map((tab) => (
          <button
            type="button"
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              activeTab === tab.key
                ? "bg-slate-950 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {actionErrorObj && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {(actionErrorObj as Error).message}
        </div>
      )}

      <div className="grid gap-4">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading workspace listings...</div>
        ) : null}

        {!isLoading && filteredListings.length === 0 ? (
          <WorkspaceEmptyState onCreate={() => setIsCreateOpen(true)} />
        ) : null}

        {filteredListings.map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            onStartEdit={handleStartEdit}
            onAction={runAction}
            isActionPending={actionPending}
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
