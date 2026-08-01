export { cn } from "./cn";

// Actions
export { Button, buttonStyles } from "./button";
export type { ButtonProps } from "./button";
export { Spinner } from "./spinner";

// Form controls
export { Field, useFieldContext, controlChrome } from "./field";
export type { FieldProps } from "./field";
export { Input, Textarea } from "./input";
export type { InputProps, TextareaProps } from "./input";
export { Select } from "./select";
export type { SelectProps } from "./select";

// Containers
export { Card, StatCard } from "./card";
export { Dialog, Sheet } from "./dialog";

// Feedback and status
export { Badge } from "./badge";
export type { BadgeProps } from "./badge";
export { ErrorState } from "./error-state";
export type { ErrorStateProps, ErrorSeverity } from "./error-state";
export { EmptyState } from "./empty-state";
export type { EmptyStateProps } from "./empty-state";
export { Skeleton, SkeletonText, SkeletonRegion } from "./skeleton";
export type { SkeletonProps } from "./skeleton";
export { ToastProvider, useToast } from "./toast";

// Navigation
export { Stepper } from "./stepper";

// Authentication. Presentational only — pair with `useOtpFlow` from @vsolve/query.
export { OtpForm } from "./otp-form";
export type { OtpFormProps } from "./otp-form";

// Brand
export { Logo } from "./logo";

// Localisation plumbing. English only in Milestone 1; the seam exists so Telugu
// and Hindi land as catalogue files rather than component rewrites.
export {
  I18nProvider,
  useTranslator,
  useT,
  createTranslator,
  DEFAULT_LOCALE,
} from "./i18n";
export type { Catalog, Locale, Message, Translator } from "./i18n";

// The signature device: money, countdowns and OTP codes.
export { Readout, formatMoney, formatDuration, describeDuration } from "./readout";
export type { ReadoutProps } from "./readout";
