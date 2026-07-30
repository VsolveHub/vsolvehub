/**
 * Commercial rules for Milestone 1 fixed-price services.
 *
 * Catalog prices are the minimum one-hour service charge. Longer bookings are
 * priced proportionally. The service price remains GST-inclusive; the platform
 * convenience fee and GST on that fee are shown separately.
 */
export const DEFAULT_DURATION_MINUTES = 60;
export const MIN_DURATION_MINUTES = 60;
export const MAX_DURATION_MINUTES = 8 * 60;
export const DURATION_STEP_MINUTES = 30;

export const PLATFORM_FEE_RATE_BPS = 500; // 5%
export const PLATFORM_FEE_MIN_PAISE = 2_000; // ₹20
export const PLATFORM_FEE_MAX_PAISE = 9_900; // ₹99
export const PLATFORM_FEE_GST_RATE_BPS = 1_800; // 18%
export const SERVICE_GST_INCLUSIVE_RATE_BPS = 500; // 5%, displayed as included

export type ServiceCommercials = {
  durationMinutes: number;
  hourlyRatePaise: number;
  serviceSubtotalPaise: number;
  platformFeePaise: number;
  platformFeeGstPaise: number;
  serviceGstIncludedPaise: number;
  totalPaise: number;
};

export function normalizeDurationMinutes(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_DURATION_MINUTES;
  const stepped = Math.round(numeric / DURATION_STEP_MINUTES) * DURATION_STEP_MINUTES;
  return Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, stepped));
}

export function calculateServiceCommercials(
  hourlyRatePaise: number,
  requestedDurationMinutes: unknown,
): ServiceCommercials {
  const durationMinutes = normalizeDurationMinutes(requestedDurationMinutes);
  const safeHourlyRate = Math.max(0, Math.round(hourlyRatePaise));
  const serviceSubtotalPaise = Math.ceil((safeHourlyRate * durationMinutes) / 60);
  const rawPlatformFee = Math.round((serviceSubtotalPaise * PLATFORM_FEE_RATE_BPS) / 10_000);
  const platformFeePaise = Math.min(
    PLATFORM_FEE_MAX_PAISE,
    Math.max(PLATFORM_FEE_MIN_PAISE, rawPlatformFee),
  );
  const platformFeeGstPaise = Math.round(
    (platformFeePaise * PLATFORM_FEE_GST_RATE_BPS) / 10_000,
  );
  const serviceGstIncludedPaise = Math.round(
    (serviceSubtotalPaise * SERVICE_GST_INCLUSIVE_RATE_BPS) /
      (10_000 + SERVICE_GST_INCLUSIVE_RATE_BPS),
  );

  return {
    durationMinutes,
    hourlyRatePaise: safeHourlyRate,
    serviceSubtotalPaise,
    platformFeePaise,
    platformFeeGstPaise,
    serviceGstIncludedPaise,
    totalPaise: serviceSubtotalPaise + platformFeePaise + platformFeeGstPaise,
  };
}

export function durationOptions(): number[] {
  const values: number[] = [];
  for (
    let minutes = MIN_DURATION_MINUTES;
    minutes <= MAX_DURATION_MINUTES;
    minutes += DURATION_STEP_MINUTES
  ) {
    values.push(minutes);
  }
  return values;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder} min`;
  if (remainder === 0) return `${hours} hr`;
  return `${hours} hr ${remainder} min`;
}
