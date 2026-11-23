import { ErrorState } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";

import { useCustomerProfile } from "@/features/account/queries";

import {
  initialDraft,
  withEnd,
  withMode,
  withPayer,
  withPinRequired,
  type Booker,
  type ParcelDraft,
  type ParcelEnd,
  type ParcelMode,
  type Payer,
  type Side,
} from "./model";

interface DraftApi {
  draft: ParcelDraft;
  setMode: (mode: ParcelMode) => void;
  setPayer: (payer: Payer) => void;
  setPinRequired: (value: boolean) => void;
  setEnd: (side: Side, end: ParcelEnd) => void;
}

const DraftContext = createContext<DraftApi | null>(null);

function Draft({ booker, children }: { booker: Booker; children: ReactNode }) {
  const [draft, setDraft] = useState(() => initialDraft(booker));
  // The setters never change while the booker does not, so a screen can depend on them freely.
  const actions = useMemo(
    () => ({
      setMode: (mode: ParcelMode) => setDraft((current) => withMode(current, mode, booker)),
      setPayer: (payer: Payer) => setDraft((current) => withPayer(current, payer)),
      setPinRequired: (value: boolean) => setDraft((current) => withPinRequired(current, value)),
      setEnd: (side: Side, end: ParcelEnd) => setDraft((current) => withEnd(current, side, end)),
    }),
    [booker],
  );
  const api = useMemo<DraftApi>(() => ({ draft, ...actions }), [draft, actions]);
  return <DraftContext.Provider value={api}>{children}</DraftContext.Provider>;
}

/**
 * Holds what the customer has typed for the parcel while they move between Review and the details
 * screens. It lives only as long as the Pick up & Drop screens do: leaving them forgets it. This is
 * what the screens are filling in, not data from the server, so it is plain state, not a query.
 * The booker's own name and phone come from their account (D7), which Home has already loaded.
 */
export function ParcelDraftProvider({ children }: { children: ReactNode }) {
  const profile = useCustomerProfile(true);
  const booker = useMemo<Booker | null>(
    () =>
      profile.data
        ? { name: profile.data.full_name || profile.data.display_name, phone: profile.data.phone_number }
        : null,
    [profile.data],
  );

  if (profile.isError) {
    return (
      <ErrorState
        title="We couldn't load your details"
        message={describeError(profile.error, "read").message}
        actionLabel="Try again"
        onAction={() => void profile.refetch()}
      />
    );
  }
  if (booker === null) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#2563EB" />
      </View>
    );
  }
  return <Draft booker={booker}>{children}</Draft>;
}

export function useParcelDraft(): DraftApi {
  const api = useContext(DraftContext);
  if (api === null) throw new Error("useParcelDraft must be used inside ParcelDraftProvider.");
  return api;
}
