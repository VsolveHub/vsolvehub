export interface TimingBreakdown {
  nextJs?: number;
  middleware?: number;
  appCode?: number;
  [key: string]: number | undefined;
}

/**
 * Formats a duration in milliseconds into readable string.
 * >= 1000ms -> "5.6s"
 * < 1000ms -> "348ms"
 */
export function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}

/**
 * Formats request timing log matching the standard:
 * GET /login 200 in 5.6s (next.js: 5.3s, middleware.ts: 25ms, application-code: 348ms)
 */
export function formatRequestTimingLog(
  method: string,
  pathname: string,
  status: number | string,
  totalMs: number,
  breakdown: TimingBreakdown = {}
): string {
  const totalStr = formatDuration(totalMs);
  const parts: string[] = [];

  if (breakdown.nextJs !== undefined) {
    parts.push(`next.js: ${formatDuration(breakdown.nextJs)}`);
  }
  if (breakdown.middleware !== undefined) {
    parts.push(`middleware.ts: ${formatDuration(breakdown.middleware)}`);
  }
  if (breakdown.appCode !== undefined) {
    parts.push(`application-code: ${formatDuration(breakdown.appCode)}`);
  }

  // Include any custom extra measurements
  for (const [key, val] of Object.entries(breakdown)) {
    if (["nextJs", "middleware", "appCode"].includes(key)) continue;
    if (val !== undefined) {
      parts.push(`${key}: ${formatDuration(val)}`);
    }
  }

  const breakdownStr = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  return `${method} ${pathname} ${status} in ${totalStr}${breakdownStr}`;
}

/**
 * Formats Server-Timing HTTP header value.
 * e.g. application_code;dur=348;desc="application-code", middleware;dur=25
 */
export function buildServerTimingHeader(breakdown: TimingBreakdown): string {
  return Object.entries(breakdown)
    .filter(([_, val]) => val !== undefined)
    .map(([key, val]) => `${key.replace(/([A-Z])/g, "_$1").toLowerCase()};dur=${val}`)
    .join(", ");
}

/**
 * Utility function to measure execution of an async block.
 */
export async function measureTiming<T>(
  label: string,
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  const result = await fn();
  const end = typeof performance !== "undefined" ? performance.now() : Date.now();
  const durationMs = Math.round(end - start);
  if (typeof console !== "undefined") {
    console.log(`[TIMING] ${label} in ${formatDuration(durationMs)}`);
  }
  return { result, durationMs };
}
