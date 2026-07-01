import Link from "next/link";
import { redirect } from "next/navigation";
import {
  MessageCircle,
  Clock,
  HelpCircle,
  ArrowRight,
  Check,
  RefreshCw,
  Bike,
  Car,
  Hand,
  Zap,
  Wrench,
  Sparkles,
} from "lucide-react";
import { Button } from "@vsolve/ui";
import { requirePartner } from "@/lib/auth";
import { SuccessAnimation } from "@/components/success-animation";
import { Medallion, type Tone } from "@/components/graphics";

export const metadata = { robots: { index: false } };

export default async function SuccessPage() {
  const partner = await requirePartner();
  if (partner.status === "DRAFT") redirect("/onboarding");

  const isDriver = partner.providerType === "DRIVER";
  const decor: { icon: typeof Bike; tone: Tone }[] = isDriver
    ? [
        { icon: Bike, tone: "slate" },
        { icon: Hand, tone: "brand" },
        { icon: Car, tone: "slate" },
      ]
    : [
        { icon: Wrench, tone: "slate" },
        { icon: Zap, tone: "brand" },
        { icon: Sparkles, tone: "slate" },
      ];

  return (
    <div>
      <div className="rounded-3xl border border-border bg-white p-8 text-center shadow-sm sm:p-10">
        <SuccessAnimation />

        <h1 className="vsh-rise mt-6 text-3xl font-bold text-ink-900" style={{ animationDelay: "500ms" }}>
          Application submitted!
        </h1>
        <p className="vsh-rise mx-auto mt-2 max-w-md text-gray-500" style={{ animationDelay: "600ms" }}>
          Great job, Partner! Your profile is now being reviewed by our verification team.
        </p>

        <div
          className="vsh-rise mx-auto mt-5 flex w-fit items-center gap-2 rounded-full border border-border bg-surface-muted px-4 py-2 text-sm font-medium text-ink-900"
          style={{ animationDelay: "700ms" }}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white">
            <MessageCircle className="h-3.5 w-3.5" />
          </span>
          We&apos;ll notify you on WhatsApp
        </div>

        {/* Application status stepper */}
        <div className="vsh-rise mx-auto mt-8 max-w-md" style={{ animationDelay: "800ms" }}>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Application status</p>
          <div className="mt-4 flex items-start justify-between">
            <StatusNode state="done" label="Submitted" icon={Check} />
            <Connector />
            <StatusNode state="active" label="Under Review" icon={RefreshCw} />
            <Connector />
            <StatusNode state="todo" label="Decision" icon={Clock} />
          </div>
        </div>

        {/* Info cards */}
        <div className="vsh-rise mt-8 grid gap-4 sm:grid-cols-2" style={{ animationDelay: "900ms" }}>
          <InfoTile icon={Clock} title="Review Time" value="24–48 Hours" />
          <InfoTile icon={HelpCircle} title="Need Help?" value="Support Hub" />
        </div>

        <div className="vsh-rise mt-8" style={{ animationDelay: "1000ms" }}>
          <Link href="/dashboard">
            <Button size="lg" className="w-full sm:w-auto">
              Go to Dashboard <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <p className="mt-3 text-xs text-gray-400">
            {isDriver
              ? "You can update your vehicle details while we review."
              : "You can update your documents while we review."}
          </p>
        </div>
      </div>

      {/* Decorative floating 3D tiles */}
      <div className="mt-8 flex items-end justify-center gap-6">
        {decor.map((d, i) => (
          <div key={i} className={i === 1 ? "vsh-float" : "vsh-float opacity-90"} style={{ animationDelay: `${i * 300}ms` }}>
            <Medallion icon={d.icon} tone={d.tone} size={i === 1 ? 64 : 52} />
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusNode({
  state,
  label,
  icon: Icon,
}: {
  state: "done" | "active" | "todo";
  label: string;
  icon: typeof Check;
}) {
  const styles = {
    done: "bg-green-500 text-white",
    active: "bg-brand-600 text-white ring-4 ring-brand-100",
    todo: "bg-gray-100 text-gray-400",
  }[state];
  const text = {
    done: "text-green-600",
    active: "text-brand-700",
    todo: "text-gray-400",
  }[state];
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${styles}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className={`text-xs font-semibold ${text}`}>{label}</span>
    </div>
  );
}

function Connector() {
  return <span className="mt-5 h-0.5 flex-1 bg-border" />;
}

function InfoTile({ icon: Icon, title, value }: { icon: typeof Clock; title: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted/60 p-4 text-left">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-xs text-gray-400">{title}</p>
        <p className="font-semibold text-ink-900">{value}</p>
      </div>
    </div>
  );
}
