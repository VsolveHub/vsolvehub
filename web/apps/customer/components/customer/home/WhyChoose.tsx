import { WHY_CHOOSE } from "@/lib/catalog/display-catalog";
import { ServiceIcon } from "@/components/ui/ServiceIcons";
import { SectionHeading } from "./SectionHeading";

export function WhyChoose() {
  return (
    <div className="w-full">
      <SectionHeading eyebrow="The V Solve promise" title="Why choose V Solve Hub?" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {WHY_CHOOSE.map((item) => (
          <div key={item.label} className="flex flex-col items-center justify-center p-6 bg-white rounded-[24px] border border-gray-100 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:scale-[1.03] hover:shadow-md">
            <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-50 mb-4 shadow-inner">
              <ServiceIcon name={item.icon} size={32} color={item.color} />
            </span>
            <span className="text-sm font-bold text-gray-900 text-center leading-tight">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
