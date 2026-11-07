// Ported from frontend/apps/partner/features/presence/view/presence-panel.tsx
import { describeError } from "@vsolve/query/native";
import {
  getCurrentPosition,
  hasLocationPermission,
  PERMISSION_DENIED,
  SERVICES_DISABLED,
  TIMEOUT,
} from "@vsolve/mobile-core";
import { Badge, Button, Card, Dialog, ErrorState, Spinner, Text, cn } from "@vsolve/mobile-ui";
import { ChevronDown, MapPin, Power } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Pressable, View } from "react-native";

import { useApplicationReference } from "@/features/application/reference-queries";

import { announceHeartbeat, claimRecurringHeartbeat } from "../model/heartbeat-lease";
import { HEARTBEAT_INTERVAL_MS, PRESENCE_COPY, type PresenceStatus } from "../model/presence";
import { clearStoredSession, writeStoredSession } from "../model/stored-session";
import { sessionIsGone } from "../model/use-partner-receiving-offers";
import { useGoOffline, useGoOnline, useHeartbeat } from "../queries";
import { usePartnerPresence } from "./partner-presence-provider";

const TONE: Record<PresenceStatus, "neutral" | "success" | "warning" | "danger"> = {
  checking: "neutral",
  offline: "neutral",
  connecting: "neutral",
  online: "success",
  stale: "warning",
  location_denied: "danger",
  unknown: "warning",
};

function GoOnlineFailure({ error }: { error: unknown }) {
  const failure = describeError(error, "mutation");
  return (
    <ErrorState inline title={failure.title} message={failure.message} severity={failure.severity} reference={failure.reference} />
  );
}

function AreaPickerButton({
  areaName,
  disabled,
  onPress,
}: {
  areaName?: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Select service area"
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "w-full flex-row items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 shadow-xs",
        disabled ? "opacity-50" : "active:bg-surface-sunken"
      )}
    >
      <View className="flex-row items-center gap-2.5">
        <MapPin size={18} color="#64748B" />
        <View className="min-w-0">
          <Text className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-text-muted">
            Working in
          </Text>
          <Text numberOfLines={1} className="text-sm font-bold text-text">
            {areaName ?? "Choose your area…"}
          </Text>
        </View>
      </View>
      <ChevronDown size={18} color="#64748B" />
    </Pressable>
  );
}

/** Django's `PARTNER_LOCATION_MAX_ACCURACY_METERS`: a coarser fix is refused. */
const MAX_ACCURACY_M = 500;

type LocationProblem = "denied" | "off" | "slow" | "unavailable";

const LOCATION_PROBLEM_COPY: Record<Exclude<LocationProblem, "denied">, { title: string; message: string }> = {
  off: {
    title: "Location is turned off",
    message: "Turn on location (GPS) in your phone\u2019s quick settings, then tap Go online again.",
  },
  slow: {
    title: "We could not find your location",
    message: "Your phone took too long to find you. Step near a window or outside and try again.",
  },
  unavailable: {
    title: "We could not find your location",
    message: "Check that location is on for V Solve Hub Partner, then try again.",
  },
};

function locationProblemOf(error: unknown): LocationProblem {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  if (code === PERMISSION_DENIED) return "denied";
  if (code === SERVICES_DISABLED) return "off";
  if (code === TIMEOUT) return "slow";
  return "unavailable";
}

export function PresencePanel({
  consentVersion,
  variant = "default",
}: {
  consentVersion: string | null;
  variant?: "default" | "driver";
}) {
  const reference = useApplicationReference();
  const presence = usePartnerPresence();
  const goOnline = useGoOnline();
  const goOffline = useGoOffline();
  const heartbeat = useHeartbeat();
  const [areaId, setAreaId] = useState("");
  const [openAreaModal, setOpenAreaModal] = useState(false);
  const [explainLocation, setExplainLocation] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationProblem, setLocationProblem] = useState<LocationProblem | null>(null);
  const [offlineFailed, setOfflineFailed] = useState<unknown>(null);

  // The provider owns the session: the same answer on Home, on Me, and after a remount.
  const sessionId = presence.sessionId;
  const isRestoring = presence.status === "checking";
  const status: PresenceStatus =
    locationProblem === "denied"
      ? "location_denied"
      : locating || goOnline.isPending
        ? "connecting"
        : presence.status;

  const heartbeatRef = useRef(heartbeat);
  useEffect(() => {
    heartbeatRef.current = heartbeat;
  }, [heartbeat]);

  // While this panel is on screen it refreshes the Partner's position with each heartbeat; the
  // provider's keep-alive stands down for as long as the lease is held.
  useEffect(() => {
    if (sessionId === null) return;
    const releaseLease = claimRecurringHeartbeat();
    let beat: ReturnType<typeof setInterval> | null = null;
    const send = async () => {
      if (AppState.currentState !== "active") return;
      // Never a prompt here: this runs on a timer, not on a tap.
      const position = await getCurrentPosition({ prompt: false, maxAgeMs: 120_000 }).catch(() => null);
      const accuracy = position?.coords.accuracy ?? null;
      // Django takes a location refresh only whole — all four fields, consent included — and only
      // inside its accuracy limit. This used to send three of the four, so every heartbeat from
      // this panel was refused and presence lapsed 90 seconds after going online. A fix that
      // cannot be sent whole is left out; the beat still keeps the session alive.
      const refresh =
        position !== null && consentVersion !== null && accuracy !== null && accuracy <= MAX_ACCURACY_M
          ? {
              latitude: position.coords.latitude.toFixed(6),
              longitude: position.coords.longitude.toFixed(6),
              accuracy_m: Math.max(1, Math.round(accuracy)),
              consent_version: consentVersion,
            }
          : {};
      try {
        await heartbeatRef.current.mutateAsync({ session_id: sessionId, ...refresh });
        announceHeartbeat();
      } catch (error) {
        if (sessionIsGone(error)) clearStoredSession();
      }
    };
    const start = () => {
      if (beat !== null) return;
      void send();
      beat = setInterval(() => void send(), HEARTBEAT_INTERVAL_MS);
    };
    const stop = () => {
      if (beat !== null) clearInterval(beat);
      beat = null;
    };
    if (AppState.currentState === "active") start();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") start();
      else stop();
    });
    return () => {
      releaseLease();
      stop();
      subscription.remove();
    };
  }, [sessionId, consentVersion]);

  async function placeOnline() {
    setLocationProblem(null);
    setLocating(true);
    let position;
    try {
      position = await getCurrentPosition();
    } catch (error) {
      setLocationProblem(locationProblemOf(error));
      return;
    } finally {
      setLocating(false);
    }
    if (!areaId || !consentVersion) return;
    const session = await goOnline
      .mutateAsync({
        service_area_id: areaId,
        latitude: position.coords.latitude.toFixed(6),
        longitude: position.coords.longitude.toFixed(6),
        accuracy_m: Math.max(1, Math.round(position.coords.accuracy ?? 1)),
        consent_version: consentVersion,
      })
      .catch((err) => {
        console.warn("[presence] goOnline mutation failed:", err);
        return null;
      });
    if (session) {
      // Written to the shared store, already confirmed: every screen shows Online at once.
      writeStoredSession(session.id, { confirmed: true });
      announceHeartbeat();
    }
  }

  async function handleGoOnline() {
    setLocationProblem(null);
    // Explain before the system prompt only the first time; after that one tap goes online.
    if (await hasLocationPermission()) {
      void placeOnline();
      return;
    }
    setExplainLocation(true);
  }

  async function handleGoOffline() {
    if (sessionId === null) return;
    setOfflineFailed(null);
    try {
      await goOffline.mutateAsync({ session_id: sessionId });
    } catch (error) {
      // With background presence the server would keep offering work for hours, so a failed
      // "Go offline" must not look like a successful one. A session the server already ended
      // is offline either way.
      if (!sessionIsGone(error)) {
        setOfflineFailed(error);
        return;
      }
    }
    clearStoredSession();
  }

  if (areaId === "" && reference.serviceAreas.length > 0) {
    setAreaId(reference.serviceAreas[0]!.id);
  }

  const copy = PRESENCE_COPY[status];
  const canGoOnline = areaId !== "" && consentVersion !== null && !goOnline.isPending && !locating;
  const isOnline = sessionId !== null;
  const busy = locating || goOnline.isPending || goOffline.isPending;
  const selectedArea = reference.serviceAreas.find((area) => area.id === areaId);

  const locationBlock =
    locationProblem === "denied" ? (
      <ErrorState
        inline
        title={PRESENCE_COPY.location_denied.label}
        message={PRESENCE_COPY.location_denied.detail}
        actionLabel="Open settings"
        onAction={() => void Linking.openSettings()}
      />
    ) : locationProblem !== null ? (
      <ErrorState
        inline
        title={LOCATION_PROBLEM_COPY[locationProblem].title}
        message={LOCATION_PROBLEM_COPY[locationProblem].message}
        actionLabel="Try again"
        onAction={() => void placeOnline()}
      />
    ) : offlineFailed !== null ? (
      <GoOnlineFailure error={offlineFailed} />
    ) : null;

  const controls =
    isRestoring ? (
      <Text className="py-4 text-sm text-text-secondary">Checking your last session…</Text>
    ) : sessionId === null ? (
      <View className="gap-3">
        <AreaPickerButton
          areaName={selectedArea?.name}
          disabled={reference.isPending || reference.serviceAreas.length === 0}
          onPress={() => setOpenAreaModal(true)}
        />
        <Button
          disabled={!canGoOnline}
          loading={locating || goOnline.isPending}
          loadingLabel={locating ? "Finding your location" : "Going online"}
          onPress={() => void handleGoOnline()}
        >
          Go online
        </Button>
      </View>
    ) : (
      <Button variant="outline" block loading={goOffline.isPending} loadingLabel="Going offline" onPress={() => void handleGoOffline()}>
        Go offline
      </Button>
    );

  return (
    <View>
      {variant === "driver" ? (
        <View className="gap-4">
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="text-[0.6875rem] font-bold uppercase tracking-wider text-text-muted">Availability</Text>
              <Text className="mt-0.5 text-sm font-medium text-text">{copy.detail}</Text>
            </View>
            <Badge tone={TONE[status]} dot>
              {copy.label}
            </Badge>
          </View>
          {consentVersion === null ? (
            <Text className="rounded-card border border-line bg-surface-sunken px-3 py-2 text-sm text-text-secondary">
              Accept the Partner agreements before going online.
            </Text>
          ) : null}
          {reference.isError ? (
            <ErrorState inline title="We could not load your areas" message="You are not online. Check your connection and try again." actionLabel="Try again" onAction={reference.refetch} />
          ) : null}
          {goOnline.isError ? <GoOnlineFailure error={goOnline.error} /> : null}
          {locationBlock}
          {isRestoring ? (
            <Text className="py-6 text-center text-sm text-text-secondary">Checking your last session…</Text>
          ) : (
            <View className="items-center gap-4">
              {sessionId === null ? (
                <AreaPickerButton
                  areaName={selectedArea?.name}
                  disabled={reference.isPending || reference.serviceAreas.length === 0}
                  onPress={() => setOpenAreaModal(true)}
                />
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isOnline ? "Go offline" : "Go online"}
                disabled={isRestoring || (sessionId === null && !canGoOnline) || busy}
                onPress={() => void (sessionId === null ? handleGoOnline() : handleGoOffline())}
                className={cn(
                  "size-[5.5rem] items-center justify-center rounded-full active:scale-95",
                  isOnline ? "bg-[#DC2626]" : "bg-[#16A34A]",
                  (isRestoring || (sessionId === null && !canGoOnline) || busy) ? "opacity-50" : ""
                )}
                style={{
                  elevation: 8,
                  shadowColor: isOnline ? "#DC2626" : "#16A34A",
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.45,
                  shadowRadius: 14,
                }}
              >
                {busy ? (
                  <Spinner size="md" />
                ) : (
                  <Power size={36} color="#FFFFFF" strokeWidth={2.5} />
                )}
              </Pressable>
              <Text className="text-center text-xs font-semibold text-text-muted">
                {locating
                  ? "Finding your location\u2026"
                  : goOnline.isPending
                    ? "Going online\u2026"
                    : isOnline
                      ? "Tap to go offline"
                      : "Tap to go online"}
              </Text>
            </View>
          )}
        </View>
      ) : (
        <Card className="p-5">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-base font-bold text-text">Your availability</Text>
            <Badge tone={TONE[status]} dot>
              {copy.label}
            </Badge>
          </View>
          <Text className="mt-2 text-sm leading-6 text-text-secondary">{copy.detail}</Text>
          {consentVersion === null ? (
            <Text className="mt-4 rounded-card border border-line bg-surface-sunken p-3 text-sm text-text-secondary">
              Accept the Partner agreements before going online — we record which version you agreed to alongside your location.
            </Text>
          ) : null}
          {reference.isError ? (
            <ErrorState inline title="We could not load your areas" message="You are not online. Check your connection and try again." actionLabel="Try again" onAction={reference.refetch} />
          ) : null}
          {goOnline.isError ? <GoOnlineFailure error={goOnline.error} /> : null}
          {locationBlock}
          <View className="mt-4">{controls}</View>
          <Text className="mt-3 text-xs leading-5 text-text-muted">
            While you are online we keep a coarse location so we can offer you nearby work. It stops the moment you go offline.
          </Text>
        </Card>
      )}

      <Dialog
        open={explainLocation}
        onOpenChange={setExplainLocation}
        title="Allow location"
        description="We use your location to offer you jobs near you. Your phone will ask you to allow it next."
        footer={
          <>
            <Button variant="outline" onPress={() => setExplainLocation(false)}>
              Not now
            </Button>
            <Button
              onPress={() => {
                setExplainLocation(false);
                // Android drops a permission prompt raised while a dialog is still closing.
                setTimeout(() => void placeOnline(), 350);
              }}
            >
              Allow location
            </Button>
          </>
        }
      >
        <Text className="text-sm text-text-secondary">Your location is used only while you are online.</Text>
      </Dialog>

      <Dialog open={openAreaModal} onOpenChange={setOpenAreaModal} title="Choose Service Area" description="Select the operational area where you want to receive on-duty job offers.">
        <View className="gap-2">
          {reference.serviceAreas.length === 0 ? (
            <Text className="py-6 text-center text-sm text-text-secondary">No service areas available.</Text>
          ) : (
            reference.serviceAreas.map((area) => (
              <Pressable
                key={area.id}
                accessibilityRole="button"
                onPress={() => {
                  setAreaId(area.id);
                  setOpenAreaModal(false);
                }}
                className="rounded-card border border-line p-3"
              >
                <Text className="text-sm font-bold text-navy-900">{area.id === areaId ? "✓ " : ""}{area.name}</Text>
                <Text className="text-xs text-text-secondary">High booking demand</Text>
              </Pressable>
            ))
          )}
        </View>
      </Dialog>
    </View>
  );
}
