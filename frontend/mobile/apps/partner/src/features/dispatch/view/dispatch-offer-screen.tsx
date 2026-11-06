import { describeError } from "@vsolve/query/native";
import { Button, COLOR_TOKENS, Spinner, Text, useT } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  AlertTriangle,
  BellOff,
  CheckCircle2,
  Clock,
  MapPin,
  ShieldCheck,
  XCircle,
  Zap,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";

import { shouldRing, useOfferRingtone } from "@/features/notifications/use-offer-ringtone";

import {
  useAcceptDispatchOffer,
  useDeclineDispatchOffer,
  useDispatchOffer,
} from "../queries";

interface ActionResult {
  type: "success" | "declined" | "expired" | "error";
  message: string;
}

function computeRemaining(offer: { expires_at?: string; server_now?: string; remaining_seconds: number }): number {
  if (offer.expires_at && offer.server_now) {
    const serverNow = new Date(offer.server_now).getTime();
    const expiresAt = new Date(offer.expires_at).getTime();
    if (!isNaN(serverNow) && !isNaN(expiresAt)) {
      return Math.max(0, Math.floor((expiresAt - serverNow) / 1000));
    }
  }
  return Math.max(0, offer.remaining_seconds);
}

export function DispatchOfferScreen({ offerId }: { offerId: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();

  const offerQuery = useDispatchOffer(offerId);
  const acceptMutation = useAcceptDispatchOffer();
  const declineMutation = useDeclineDispatchOffer();

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);

  const offer = offerQuery.data;
  const initialRemaining = offer ? computeRemaining(offer) : 0;
  const secondsRemaining = Math.max(0, initialRemaining - elapsedSeconds);

  // Tick countdown timer with drift correction
  useEffect(() => {
    if (!offer || offer.status !== "PENDING" || initialRemaining <= 0) return;

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedSeconds(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [offer, initialRemaining]);

  // Ring until answered or expired, on the server's clock (never the phone's).
  const ring = useOfferRingtone(offer ? shouldRing(offer.status, secondsRemaining) && actionResult === null : false);

  const handleAccept = async () => {
    if (!offer || acceptMutation.isPending || declineMutation.isPending) return;

    try {
      const result = await acceptMutation.mutateAsync(offerId);
      setActionResult({
        type: "success",
        message: t("work.dispatch.acceptedSuccess"),
      });

      const bookingId = result.booking?.id || offer.booking?.id;
      setTimeout(() => {
        if (bookingId) {
          router.replace(`/work/jobs/${bookingId}` as never);
        } else {
          router.replace("/work/all" as never);
        }
      }, 1500);
    } catch (err: unknown) {
      setActionResult({
        type: "error",
        message: err instanceof Error ? err.message : t("work.dispatch.acceptFailed"),
      });
    }
  };

  const handleDecline = async () => {
    if (!offer || acceptMutation.isPending || declineMutation.isPending) return;

    try {
      await declineMutation.mutateAsync(offerId);
      setActionResult({
        type: "declined",
        message: t("work.dispatch.declined"),
      });
    } catch (err: unknown) {
      setActionResult({
        type: "error",
        message: err instanceof Error ? err.message : t("work.dispatch.declineFailed"),
      });
    }
  };

  if (offerQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-canvas p-6">
        <Spinner size="lg" />
        <Text className="text-sm font-medium text-text-secondary">{t("work.dispatch.loading")}</Text>
      </View>
    );
  }

  if (offerQuery.isError || !offer) {
    return (
      <View
        className="flex-1 items-center justify-center bg-canvas p-6"
        style={{ paddingTop: Math.max(insets.top, 20) }}
      >
        <View className="size-14 items-center justify-center rounded-2xl bg-rose-50 mb-4">
          <AlertTriangle size={28} color={COLOR_TOKENS.danger} />
        </View>
        <Text className="text-xl font-bold text-navy-950 mb-2">{t("work.dispatch.unableToLoad")}</Text>
        <Text className="text-sm text-text-secondary text-center mb-6">
          {offerQuery.error ? describeError(offerQuery.error, "read").message : t("work.dispatch.notFound")}
        </Text>
        <Button variant="primary" onPress={() => router.replace("/home" as never)}>
          {t("work.dispatch.backToDashboard")}
        </Button>
      </View>
    );
  }

  const isExpired = offer.status === "EXPIRED" || secondsRemaining <= 0;
  const isPending = offer.status === "PENDING" && secondsRemaining > 0 && !actionResult;
  const isUrgent = secondsRemaining > 0 && secondsRemaining <= 15;
  const totalSeconds = Math.max(initialRemaining, 60);
  const progress = Math.max(0, Math.min(1, secondsRemaining / totalSeconds));

  const circleRadius = 60;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circleCircumference * (1 - progress);

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      style={{ paddingTop: Math.max(insets.top, 16) }}
      contentContainerClassName="mx-auto w-full max-w-xl px-4 pb-16 pt-2"
      refreshControl={
        <RefreshControl
          refreshing={offerQuery.isRefetching}
          onRefresh={() => void offerQuery.refetch()}
          colors={[COLOR_TOKENS.action]}
          tintColor={COLOR_TOKENS.action}
        />
      }
    >
      {/* Top Banner / Mode Badge */}
      <View className="flex-row items-center justify-between py-2">
        <View className="flex-row items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1">
          <Zap size={14} color={COLOR_TOKENS.warning} fill={COLOR_TOKENS.warning} />
          <Text className="text-xs font-black uppercase tracking-wide text-amber-700">
            {t("work.dispatch.instantBadge")}
          </Text>
        </View>
        <Text className="font-mono text-xs font-semibold text-text-secondary">
          {t("work.dispatch.offerNumber", { id: offer.id.slice(0, 8) })}
        </Text>
      </View>

      {/* Circular Countdown Card */}
      <View
        className={`mt-4 items-center rounded-3xl border p-6 text-center ${
          isUrgent
            ? "border-rose-400 bg-rose-50/50 shadow-sm"
            : "border-primary/20 bg-surface shadow-xs"
        }`}
      >
        <View className="flex-row items-center gap-1.5 mb-3">
          <Clock size={16} color={isUrgent ? COLOR_TOKENS.danger : COLOR_TOKENS.action} />
          <Text className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            {t("work.dispatch.countdownTitle")}
          </Text>
        </View>

        {/* Animated Circular Progress Gauge */}
        <View className="relative size-36 items-center justify-center my-1">
          <Svg width={144} height={144} viewBox="0 0 144 144">
            <Circle
              cx={72}
              cy={72}
              r={circleRadius}
              stroke={COLOR_TOKENS.line}
              strokeWidth={8}
              fill="transparent"
            />
            <Circle
              cx={72}
              cy={72}
              r={circleRadius}
              stroke={isUrgent ? COLOR_TOKENS.danger : COLOR_TOKENS.action}
              strokeWidth={8}
              strokeDasharray={circleCircumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              transform="rotate(-90 72 72)"
            />
          </Svg>
          <View className="absolute items-center justify-center">
            <Text
              className={`font-mono text-3xl font-black tracking-tight ${
                secondsRemaining > 0
                  ? isUrgent
                    ? "text-rose-600"
                    : "text-navy-950"
                  : "text-text-muted"
              }`}
            >
              00:{String(secondsRemaining).padStart(2, "0")}
            </Text>
          </View>
        </View>

        {isPending && !ring.silenced ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Silence the ringing. The offer stays open."
            onPress={ring.silence}
            className="mt-3 min-h-11 flex-row items-center gap-1.5 rounded-full border border-line bg-surface-sunken px-4 active:opacity-70"
          >
            <BellOff size={16} color={COLOR_TOKENS.textMuted} />
            <Text className="text-xs font-bold text-text-secondary">Silence</Text>
          </Pressable>
        ) : null}

        <Text className="mt-2 text-xs text-text-secondary text-center">
          {secondsRemaining > 0
            ? isUrgent
              ? t("work.dispatch.expiringSoon")
              : t("work.dispatch.respondBeforeExpiry")
            : t("work.dispatch.windowClosed")}
        </Text>
      </View>

      {/* Action / Result Feedback Alert */}
      {actionResult || isExpired ? (
        <View
          accessibilityRole="alert"
          className={`mt-4 flex-row items-start gap-3 rounded-2xl border p-4 ${
            actionResult?.type === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : actionResult?.type === "declined"
              ? "border-line bg-surface-muted text-text-secondary"
              : "border-rose-300 bg-rose-50 text-rose-900"
          }`}
        >
          {actionResult?.type === "success" ? (
            <CheckCircle2 size={20} color={COLOR_TOKENS.success} />
          ) : actionResult?.type === "declined" ? (
            <XCircle size={20} color={COLOR_TOKENS.textMuted} />
          ) : (
            <AlertTriangle size={20} color={COLOR_TOKENS.danger} />
          )}
          <View className="flex-1">
            <Text
              className={`text-sm font-semibold ${
                actionResult?.type === "success"
                  ? "text-emerald-900"
                  : actionResult?.type === "declined"
                  ? "text-text-secondary"
                  : "text-rose-900"
              }`}
            >
              {actionResult?.message ?? t("work.dispatch.expired")}
            </Text>
            {actionResult?.type === "success" ? (
              <Text className="mt-1 text-xs text-emerald-800">
                {t("work.dispatch.redirecting")}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Service Details Card */}
      <View className="mt-4 rounded-3xl border border-line bg-surface p-5 shadow-xs gap-4">
        <View>
          <Text className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            {offer.booking.service_category || t("work.dispatch.defaultCategory")}
          </Text>
          <Text className="mt-1 text-lg font-extrabold text-navy-950">
            {offer.booking.service_title || t("work.dispatch.defaultTitle")}
          </Text>
        </View>

        <View className="border-t border-line/60 pt-4 gap-3">
          <View className="flex-row items-center gap-3">
            <View className="size-9 items-center justify-center rounded-xl bg-surface-sunken">
              <Clock size={18} color={COLOR_TOKENS.action} />
            </View>
            <View>
              <Text className="text-xs font-semibold text-text-secondary">
                {t("work.dispatch.estimatedDuration")}
              </Text>
              <Text className="text-sm font-bold text-navy-950">
                {t("work.dispatch.durationMinutes", { count: offer.booking.estimated_duration_minutes })}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-3">
            <View className="size-9 items-center justify-center rounded-xl bg-surface-sunken">
              <MapPin size={18} color={COLOR_TOKENS.action} />
            </View>
            <View>
              <Text className="text-xs font-semibold text-text-secondary">
                {t("work.dispatch.serviceArea")}
              </Text>
              <Text className="text-sm font-bold text-navy-950">
                {offer.booking.location_area || "Area not given"}
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-row items-start gap-2.5 rounded-2xl border border-line/50 bg-surface-sunken p-3.5">
          <ShieldCheck size={18} color={COLOR_TOKENS.success} className="mt-0.5 shrink-0" />
          <Text className="flex-1 text-xs leading-relaxed text-text-secondary">
            {t("work.dispatch.privacyNotice")}
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View className="mt-6 flex-col gap-3">
        {isPending ? (
          <>
            <Button
              variant="primary"
              size="lg"
              loading={acceptMutation.isPending}
              loadingLabel={t("work.dispatch.accepting")}
              onPress={handleAccept}
              disabled={declineMutation.isPending}
            >
              {t("work.dispatch.acceptAction")}
            </Button>
            <Button
              variant="outline"
              size="lg"
              loading={declineMutation.isPending}
              loadingLabel={t("work.dispatch.declining")}
              onPress={handleDecline}
              disabled={acceptMutation.isPending}
            >
              {t("work.dispatch.declineAction")}
            </Button>
          </>
        ) : (
          <Button variant="primary" size="lg" onPress={() => router.replace("/work/all" as never)}>
            {t("work.dispatch.viewActiveJobs")}
          </Button>
        )}
      </View>
    </ScrollView>
  );
}
