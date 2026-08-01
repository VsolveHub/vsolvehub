import Link from "next/link";
import { Construction, ArrowLeft, type LucideIcon } from "lucide-react";
import { Button } from "@vsolve/ui";
import { Medallion, type Tone } from "./graphics";

export function PlaceholderPage({
  title,
  body,
  icon = Construction,
  tone = "brand",
}: {
  title: string;
  body: string;
  icon?: LucideIcon;
  tone?: Tone;
}) {
  return (
    <main className="px-5 py-24">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto w-fit">
          <Medallion icon={icon} tone={tone} size={84} />
        </div>
        <h1 className="mt-6 text-4xl font-bold text-ink-900">{title}</h1>
        <p className="mt-4 text-lg text-gray-500">{body}</p>
        <Link href="/" className="mt-8 inline-block">
          <Button variant="outline" size="lg">
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Button>
        </Link>
      </div>
    </main>
  );
}
