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
export { ConfirmAction } from "./confirm-action";
export type { ConfirmActionProps } from "./confirm-action";

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

// Record and summary primitives shared by the M2 requirement, quote, engagement
// and Operations surfaces. Each renders server-supplied, server-authorized
// values — none of them decide what a reader is allowed to see.
export { Timeline, TimelineEvent } from "./timeline";
export type { TimelineEventProps, TimelineProps, TimelineTone } from "./timeline";
export { AttachmentList } from "./attachment-list";
export type {
  Attachment,
  AttachmentKind,
  AttachmentListProps,
  AttachmentStatus,
} from "./attachment-list";
export { AddressSummary, ScheduleSummary, PersonCount, FactList } from "./summary";
export type {
  AddressSummaryProps,
  FactListProps,
  PersonCountProps,
  ScheduleSummaryProps,
} from "./summary";

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
