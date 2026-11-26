/**
 * Whether this build shows the booking assistant. Defaults to true unless
 * `EXPO_PUBLIC_ASSISTANT_ENABLED=false` is explicitly set, protecting against
 * missing env vars or dev server reload timing hiding the assistant.
 */
export const ASSISTANT_ENABLED = process.env.EXPO_PUBLIC_ASSISTANT_ENABLED !== "false";

