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
export { QuantityStepper } from "./quantity-stepper";
export type { QuantityStepperProps } from "./quantity-stepper";
// Responsive branching for the rare case CSS cannot express: two layouts that
// need different DOM. See the hook's own note before reaching for it.
export { useMediaQuery, useIsWideScreen } from "./use-media-query";
export { ChoiceChips } from "./choice-chips";
export type { ChoiceChipOption, ChoiceChipsProps } from "./choice-chips";

// Containers
export { Card, StatCard } from "./card";
export { Dialog, Sheet } from "./dialog";
// The two-column booking shape and the pieces that fill its rail. Used by the
// crew form, the matching screen, the confirmation, the project brief and the
// visit plan — see the component's own note on why the rail comes second.
export { RailLayout, RailHeadline, RailMoney } from "./rail-layout";
export type {
  RailLayoutProps,
  RailHeadlineProps,
  RailMoneyRow,
} from "./rail-layout";
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
export { ServiceRatingDialog, ServiceRatingList } from "./service-rating";
export type {
  ListedServiceRating,
  ServiceRatingDialogProps,
} from "./service-rating";

// Navigation
export { Stepper } from "./stepper";
// One control standing in for what used to be three top-level nav items. The
// styles are exported beside the component because a segment that changes
// *where you are* has to be a link, and this package owns no router.
export { SegmentedTrack, SegmentCount, segmentStyles } from "./segmented";

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
// The M2 estimate kit: the three shapes every priced screen repeats. Built once
// here so nine parallel screen builds compose the same row, band and dock rather
// than each inventing one.
export { SectionBand } from "./section-band";
export type { SectionBandProps } from "./section-band";
export { FactTile } from "./fact-tile";
export type { FactTileProps } from "./fact-tile";
export { StepDock } from "./step-dock";
export type { StepDockProps } from "./step-dock";

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

// Explanation that is available without being in the way. Never for a decision
// or a legal disclosure — see the component's own note.
export { Disclosure } from "./disclosure";
export type { DisclosureProps } from "./disclosure";
