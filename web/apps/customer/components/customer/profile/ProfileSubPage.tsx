import Link from "next/link";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";

type Props = {
  title: string;
  children: React.ReactNode;
};

export function ProfileSubPage({ title, children }: Props) {
  return (
    <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-6 md:py-10 flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Link 
          href="/profile" 
          className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-[var(--color-brand)] transition-colors w-fit"
        >
          <FlaticonIcon name="arrow-left" size={14} /> Account
        </Link>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">{title}</h1>
      </div>
      <div className="bg-white rounded-3xl border border-gray-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-6 sm:p-8">
        {children}
      </div>
    </div>
  );
}
