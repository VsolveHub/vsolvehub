"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Readout,
  Select,
  Sheet,
  Skeleton,
  SkeletonText,
  Spinner,
  Textarea,
  ToastProvider,
  formatDuration,
  formatMoney,
  useToast,
} from "@vsolve/ui";

/**
 * Every primitive in every state.
 *
 * Two jobs: a reference while building screens, and a manual check for the B1
 * acceptance criteria that automated tests cannot cover — how things look at
 * 200% zoom, whether a long Telugu-length service name breaks a card, whether a
 * six-figure total still fits the price rail.
 */

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line py-8 first:border-t-0">
      <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-text-secondary">{title}</h2>
      {note ? <p className="mt-1 max-w-prose text-sm text-text-secondary">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function ToastDemo() {
  const { notify } = useToast();
  return (
    <Row>
      <Button variant="outline" onClick={() => notify("Address saved")}>
        Success toast
      </Button>
      <Button variant="outline" onClick={() => notify("Availability updated", "info")}>
        Info toast
      </Button>
      <Button variant="outline" onClick={() => notify("Could not sync earnings", "danger")}>
        Danger toast (stays)
      </Button>
    </Row>
  );
}

export function DesignSystemGallery() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <header className="pb-4">
          <h1 className="text-2xl font-bold text-text">Design system</h1>
          <p className="mt-1 max-w-prose text-sm text-text-secondary">
            Brand colours are sampled from the logo: signal orange{" "}
            <code className="rounded bg-surface-sunken px-1">#f87000</code> and navy{" "}
            <code className="rounded bg-surface-sunken px-1">#002870</code>. Orange measures 2.9:1 on
            white, so it is a fill colour only — never text on white, and never with white on top.
            Contrast pairings are enforced by <code>tokens.contrast.test.ts</code>.
          </p>
        </header>

        <Section
          title="Readout"
          note="The signature device. One form for the three values that must never be misread: what it costs, how long is left, and the code spoken at the door."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Readout label="Total payable" value={formatMoney(129900)} tone="active" size="lg" />
            <Readout
              label="Time remaining"
              value={formatDuration(272_000)}
              announce="About 5 minutes remaining"
              tone="active"
              size="lg"
              caption="Ends 11:30 am"
            />
            <Readout label="Start OTP" value="4 7 2 9" spaced size="lg" />
            <Readout
              label="Overtime"
              value={`+${formatDuration(95_000)}`}
              tone="warning"
              size="lg"
              caption="Not billed unless you approve an extension"
            />
            <Readout label="Partner earning" value={formatMoney(34000)} size="sm" />
            <Readout label="Hold expires in" value={formatDuration(43_000)} tone="danger" size="sm" />
          </div>
        </Section>

        <Section
          title="Buttons"
          note="Primary is orange with ink text — white on orange fails WCAG. Hover brightens and press darkens, because with dark text on orange, darkening reduces contrast."
        >
          <div className="flex flex-col gap-4">
            <Row>
              <Button>Confirm booking</Button>
              <Button variant="secondary">Back</Button>
              <Button variant="outline">Change address</Button>
              <Button variant="ghost">Skip</Button>
              <Button variant="danger">Cancel booking</Button>
            </Row>
            <Row>
              <Button size="sm">Small</Button>
              <Button size="md">Medium (44px)</Button>
              <Button size="lg">Large</Button>
            </Row>
            <Row>
              <Button loading loadingLabel="Confirming payment">
                Pay {formatMoney(19900)}
              </Button>
              <Button disabled>Disabled</Button>
              <Button variant="secondary" disabled>
                Disabled
              </Button>
            </Row>
            <div className="max-w-sm">
              <Button block size="lg">
                Block, for the mobile action bar
              </Button>
            </div>
          </div>
        </Section>

        <Section title="Status" note="Colour never carries the meaning alone — every badge has text.">
          <Row>
            <Badge tone="success" dot>
              Completed
            </Badge>
            <Badge tone="warning" dot>
              Overtime
            </Badge>
            <Badge tone="danger" dot>
              Cancelled
            </Badge>
            <Badge tone="info" dot>
              Scheduled
            </Badge>
            <Badge tone="action">Instant</Badge>
            <Badge tone="neutral">Draft</Badge>
          </Row>
        </Section>

        <Section
          title="Form controls"
          note="Labels are always visible — a placeholder disappears the moment someone types. Control borders clear 3:1 because this product is used outdoors on inexpensive screens."
        >
          <div className="grid max-w-xl gap-4">
            <Field label="Phone number" description="We send the OTP here." required>
              <Input type="tel" inputMode="numeric" placeholder="98765 43210" />
            </Field>

            <Field label="Postal code" error="We do not serve 500072 yet. Try another address.">
              <Input defaultValue="500072" />
            </Field>

            <Field label="Preferred time" required>
              <Select placeholder="Choose a time">
                <option value="10:00">10:00 am – 11:00 am</option>
                <option value="11:00">11:00 am – 12:00 pm</option>
              </Select>
            </Field>

            <Field label="Landmark">
              <Input placeholder="Near the water tank" />
            </Field>

            <Field label="Notes for the professional" description="Optional. Anything they should know.">
              <Textarea placeholder="The gate code is 4471." />
            </Field>

            <Field label="Disabled">
              <Input disabled defaultValue="Not editable" />
            </Field>
          </div>
        </Section>

        <Section title="Overlays">
          <Row>
            <Button variant="outline" onClick={() => setDialogOpen(true)}>
              Open dialog
            </Button>
            <Button variant="outline" onClick={() => setSheetOpen(true)}>
              Open sheet
            </Button>
          </Row>

          <Dialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            title="Cancel this booking?"
            description="Your professional has already been assigned."
            footer={
              <>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Keep booking
                </Button>
                <Button variant="danger" onClick={() => setDialogOpen(false)}>
                  Cancel booking
                </Button>
              </>
            }
          >
            <p className="text-sm text-text-secondary">
              Cancelling now refunds {formatMoney(17900)} of {formatMoney(19900)}. The{" "}
              {formatMoney(2000)} cancellation fee applies because the professional is already on the
              way.
            </p>
          </Dialog>

          <Sheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            title="Price summary"
            footer={<Button block>Continue to payment</Button>}
          >
            <dl className="divide-y divide-line text-sm">
              {[
                ["Switch / Socket Repair × 2", formatMoney(39800)],
                ["Platform fee", formatMoney(2900)],
                ["GST", formatMoney(7686)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-2.5">
                  <dt className="text-text-secondary">{label}</dt>
                  <dd data-numeric className="font-medium text-text">
                    {value}
                  </dd>
                </div>
              ))}
              <div className="flex justify-between py-2.5">
                <dt className="font-semibold text-text">Total payable</dt>
                <dd data-numeric className="font-bold text-text">
                  {formatMoney(50386)}
                </dd>
              </div>
            </dl>
          </Sheet>
        </Section>

        <Section title="Toasts" note="Confirmations only. Anything needing recovery belongs in an ErrorState next to what failed.">
          <ToastDemo />
        </Section>

        <Section
          title="Errors"
          note="Every error states what happened, whether money moved, and what to do next."
        >
          <div className="grid gap-3">
            <ErrorState
              title="That option is no longer available"
              message="That 10:00 am slot was just taken. You have not been charged. Choose another time."
              actionLabel="Choose another time"
              onAction={() => undefined}
              reference="req_01J8ZQ2K3M4N5P6Q7R8S9T"
            />
            <ErrorState
              severity="warning"
              title="Confirming your payment"
              message="We could not reach Vsolve Hub. We are confirming whether your payment went through — do not pay again yet."
              actionLabel="Check status"
              onAction={() => undefined}
            />
            <ErrorState
              severity="info"
              inline
              title="Instant is unavailable right now"
              message="You can still book a scheduled visit."
              actionLabel="Switch to scheduled"
              onAction={() => undefined}
            />
          </div>
        </Section>

        <Section title="Empty and loading">
          <div className="grid gap-3">
            <EmptyState
              title="No bookings yet"
              description="Your upcoming and completed visits will appear here."
              action={<Button>Browse services</Button>}
            />
            <div className="rounded-card border border-line bg-surface p-4">
              <div className="flex items-center gap-3">
                <Skeleton circle className="h-10 w-10" />
                <div className="flex-1">
                  <SkeletonText lines={2} />
                </div>
              </div>
            </div>
            <Row>
              <Spinner size="sm" />
              <Spinner size="md" />
              <Spinner size="lg" />
            </Row>
          </div>
        </Section>

        <Section
          title="Content stress tests"
          note="B1 acceptance: long content, large Indian-formatted totals and 200% text zoom must not break layout. Zoom the browser to 200% and check nothing overflows horizontally."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Readout label="Total payable" value={formatMoney(1234567890)} tone="active" size="lg" />
            <Readout
              label="Deep cleaning and sanitisation for a three bedroom apartment"
              value={formatMoney(999900)}
              size="lg"
            />
            <div className="rounded-card border border-line bg-surface p-4">
              <p className="text-sm font-semibold text-text">
                Air Conditioner Deep Clean, Gas Refill and Annual Maintenance Contract Renewal
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Flat 402, Sai Residency, Beside the Kukatpally Housing Board Colony water tank,
                Hyderabad, Telangana 500072
              </p>
            </div>
            <EmptyState
              compact
              title="No professionals available"
              description="No professional accepted in time. You have not been charged."
              action={<Button size="sm">Try scheduled instead</Button>}
            />
          </div>
        </Section>
      </div>
    </ToastProvider>
  );
}
