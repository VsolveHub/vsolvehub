// Ported from frontend/apps/partner/features/presence/view/presence-panel.tsx
import { describeError } from "@vsolve/query/native";
import { getCurrentPosition, PERMISSION_DENIED } from "@vsolve/mobile-core";
import { Badge, Button, Card, Dialog, ErrorState, Spinner, Text, cn } from "@vsolve/mobile-ui";
import { ChevronDown, MapPin, Power } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Pressable, View } from "react-native";

import { useApplicationReference } from "@/features/application/reference-queries";

import { announceHeartbeat, claimRecurringHeartbeat } from "../model/heartbeat-lease";
import { HEARTBEAT_INTERVAL_MS, PRESENCE_COPY, presenceStatus, type PresenceStatus } from "../model/presence";
import { clearStoredSession, readStoredSession, writeStoredSession } from "../model/stored-session";
import { useGoOffline, useGoOnline, useHeartbeat } from "../queries";

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

export function PresencePanel({
  consentVersion,
  variant = "default",
}: {
  consentVersion: string | null;
  variant?: "default" | "driver";
}) {
  const reference = useApplicationReference();
  const goOnline = useGoOnline();
  const goOffline = useGoOffline();
  const heartbeat = useHeartbeat();
  const [areaId, setAreaId] = useState("");
  const [openAreaModal, setOpenAreaModal] = useState(false);
  const [explainLocation, setExplainLocation] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastBeatAt, setLastBeatAt] = useState<number | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [hasProbedStoredSession, setHasProbedStoredSession] = useState(() => readStoredSession() === null);
  const storedSession = readStoredSession();
  const isRestoring = storedSession !== null && !hasProbedStoredSession;

  const status = presenceStatus({
    hasSession: sessionId !== null,
    msSinceHeartbeat: lastBeatAt === null ? null : now - lastBeatAt,
    isConnecting: goOnline.isPending,
    locationDenied,
    hasFailed: goOnline.isError,
    isChecking: isRestoring,
  });

  const sendHeartbeat = useCallback(
    async (id: string) => {
      if (AppState.currentState !== "active") return;
      try {
        const position = await getCurrentPosition().catch(() => null);
        await heartbeat.mutateAsync({
          session_id: id,
          ...(position
            ? {
                latitude: position.coords.latitude.toFixed(6),
                longitude: position.coords.longitude.toFixed(6),
                accuracy_m: position.coords.accuracy === null ? undefined : Math.round(position.coords.accuracy),
              }
            : {}),
        });
        setLastBeatAt(Date.now());
        announceHeartbeat();
      } catch {
        // Left for the status to report as stale.
      }
    },
    [heartbeat],
  );

  const sendHeartbeatRef = useRef(sendHeartbeat);
  useEffect(() => {
    sendHeartbeatRef.current = sendHeartbeat;
  }, [sendHeartbeat]);

  const heartbeatRef = useRef(heartbeat);
  useEffect(() => {
    heartbeatRef.current = heartbeat;
  }, [heartbeat]);

  useEffect(() => {
    const stored = readStoredSession();
    if (stored === null) return;
    let cancelled = false;
    void heartbeatRef.current
      .mutateAsync({ session_id: stored })
      .then((session) => {
        if (cancelled) return;
        setSessionId(session.id);
        setLastBeatAt(Date.now());
        announceHeartbeat();
      })
      .catch(() => {
        if (!cancelled) clearStoredSession();
      })
      .finally(() => {
        if (!cancelled) setHasProbedStoredSession(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sessionId === null) return;
    const releaseLease = claimRecurringHeartbeat();
    let beat: ReturnType<typeof setInterval> | null = null;
    let refresh: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (beat !== null) return;
      void sendHeartbeatRef.current(sessionId);
      beat = setInterval(() => void sendHeartbeatRef.current(sessionId), HEARTBEAT_INTERVAL_MS);
      refresh = setInterval(() => setNow(Date.now()), 5_000);
    };
    const stop = () => {
      if (beat !== null) clearInterval(beat);
      if (refresh !== null) clearInterval(refresh);
      beat = null;
      refresh = null;
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
  }, [sessionId]);

  async function placeOnline() {
    setLocationDenied(false);
    let position;
    try {
      position = await getCurrentPosition();
    } catch (error) {
      const denied = typeof error === "object" && error !== null && "code" in error && error.code === PERMISSION_DENIED;
      if (denied) setLocationDenied(true);
      return;
    }
    if (!areaId || !consentVersion) return;
    const session = await goOnline
      .mutateAsync({
        service_area_id: areaId,
        latitude: position.coords.latitude.toFixed(6),
        longitude: position.coords.longitude.toFixed(6),
        accuracy_m: position.coords.accuracy === null ? 0 : Math.round(position.coords.accuracy),
        consent_version: consentVersion,
      })
      .catch(() => null);
    if (session) {
      setSessionId(session.id);
      setLastBeatAt(Date.now());
      writeStoredSession(session.id);
      announceHeartbeat();
    }
  }

  function handleGoOnline() {
    setExplainLocation(true);
  }

  async function handleGoOffline() {
    if (sessionId === null) return;
    await goOffline.mutateAsync({ session_id: sessionId }).catch(() => null);
    setSessionId(null);
    setLastBeatAt(null);
    clearStoredSession();
  }

  useEffect(() => {
    if (areaId !== "" || reference.serviceAreas.length === 0) return;
    setAreaId(reference.serviceAreas[0]!.id);
  }, [areaId, reference.serviceAreas]);

  const copy = PRESENCE_COPY[status];
  const canGoOnline = areaId !== "" && consentVersion !== null && !goOnline.isPending;
  const isOnline = sessionId !== null && (status === "online" || status === "stale");
  const selectedArea = reference.serviceAreas.find((area) => area.id === areaId);

  const locationBlock = locationDenied ? (
    <ErrorState
      inline
      title={PRESENCE_COPY.location_denied.label}
      message={PRESENCE_COPY.location_denied.detail}
      actionLabel="Open settings"
      onAction={() => void Linking.openSettings()}
    />
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
        <Button disabled={!canGoOnline} loading={goOnline.isPending} loadingLabel="Going online" onPress={handleGoOnline}>
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
                disabled={isRestoring || (sessionId === null && !canGoOnline) || goOnline.isPending || goOffline.isPending}
                onPress={() => void (sessionId === null ? handleGoOnline() : handleGoOffline())}
                className={cn(
                  "size-[5.5rem] items-center justify-center rounded-full active:scale-95",
                  isOnline ? "bg-[#DC2626]" : "bg-[#16A34A]",
                  (isRestoring || (sessionId === null && !canGoOnline) || goOnline.isPending || goOffline.isPending) ? "opacity-50" : ""
                )}
                style={{
                  elevation: 8,
                  shadowColor: isOnline ? "#DC2626" : "#16A34A",
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.45,
                  shadowRadius: 14,
                }}
              >
                {goOnline.isPending || goOffline.isPending ? (
                  <Spinner size="md" />
                ) : (
                  <Power size={36} color="#FFFFFF" strokeWidth={2.5} />
                )}
              </Pressable>
              <Text className="text-center text-xs font-semibold text-text-muted">
                {isOnline ? "Tap to go offline" : "Tap to go online"}
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
        title={PRESENCE_COPY.location_denied.label}
        description="We need your location to offer you nearby jobs. Allow location for this site, then go online again."
        footer={
          <>
            <Button variant="outline" onPress={() => setExplainLocation(false)}>
              Not now
            </Button>
            <Button
              onPress={() => {
                setExplainLocation(false);
                void placeOnline();
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
