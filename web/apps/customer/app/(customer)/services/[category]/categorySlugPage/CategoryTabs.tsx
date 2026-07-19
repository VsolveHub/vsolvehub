import { FlaticonIcon } from "@/components/ui/FlaticonIcon";

type SubCategory = { id: string; name: string; slug: string };

type Props = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  subCategories: SubCategory[];
};

export function CategoryTabs({ activeTab, setActiveTab, subCategories }: Props) {
  return (
    <div className="border-b border-gray-100 pb-4 mb-8">
      <div className="flex items-center justify-between gap-4 overflow-x-auto no-scrollbar py-2">
        <div className="flex items-center gap-2 sm:gap-3 whitespace-nowrap">
          {/* All Services Tab */}
          <button
            onClick={() => setActiveTab("all")}
            className={`px-5 py-2.5 text-xs sm:text-sm font-bold rounded-full transition-all duration-200 cursor-pointer ${
              activeTab === "all"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            }`}
          >
            All Services
          </button>

          {/* Popular Tab */}
          <button
            onClick={() => setActiveTab("popular")}
            className={`px-5 py-2.5 text-xs sm:text-sm font-bold rounded-full transition-all duration-200 cursor-pointer ${
              activeTab === "popular"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            }`}
          >
            Popular
          </button>

          {/* Dynamic Subcategories as Pills */}
          {subCategories.map((sub) => (
            <button
              key={sub.id}
              onClick={() => setActiveTab(sub.slug)}
              className={`px-5 py-2.5 text-xs sm:text-sm font-bold rounded-full transition-all duration-200 cursor-pointer ${
                activeTab === sub.slug
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/50"
              }`}
            >
              {sub.name}
            </button>
          ))}
        </div>

        {/* Filter Pill */}
        <button className="flex items-center space-x-2 px-5 py-2.5 text-xs sm:text-sm font-bold bg-white border border-gray-200 hover:border-gray-300 text-slate-700 rounded-full transition-colors cursor-pointer whitespace-nowrap shadow-sm">
          <FlaticonIcon name="filter" size={14} className="text-slate-500" />
          <span>Filter</span>
        </button>
      </div>
    </div>
  );
}
