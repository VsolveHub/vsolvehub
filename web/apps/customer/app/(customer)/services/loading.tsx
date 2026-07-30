export default function ServicesLoading() {
  return (
    <div
      className="w-full min-h-screen bg-slate-50"
      aria-busy="true"
      aria-label="Loading service catalog"
    >
      {/* Warm hero placeholder matching the service catalog palette */}
      <div className="border-b border-orange-100 bg-gradient-to-br from-[#fffaf5] via-[#fff7ed] to-[#ffedd5] px-4 py-10 md:px-8 md:py-12">
        <div className="max-w-[1280px] w-full mx-auto">
          {/* Header Title Skeleton */}
          <div className="mb-3 h-9 w-60 max-w-[60%] animate-pulse rounded-lg bg-orange-200/80"></div>
          {/* Header Description Skeleton */}
          <div className="h-4 w-96 max-w-[80%] animate-pulse rounded-md bg-orange-100"></div>
        </div>
      </div>

      {/* Categories Jump Bar for Mobile (Optional/Shimmer) */}
      <div className="border-b border-slate-100 bg-white md:hidden">
        <div className="flex gap-3 overflow-x-auto p-4 scrollbar-none">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-8 w-24 bg-slate-100 animate-pulse rounded-full flex-shrink-0"
            ></div>
          ))}
        </div>
      </div>

      {/* Main Body Layout */}
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-6 md:py-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Desktop Left Sidebar: Categories List */}
          <aside className="hidden md:block md:col-span-3 space-y-4">
            <div className="h-5 w-28 bg-slate-200 animate-pulse rounded mb-4"></div>
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 w-full bg-slate-100 animate-pulse rounded-xl"
                ></div>
              ))}
            </div>
          </aside>

          {/* Main Feed Content Area */}
          <div className="col-span-1 md:col-span-9 space-y-8">
            {/* Active Category Title */}
            <div className="h-6 w-44 bg-slate-200 animate-pulse rounded"></div>

            {/* Grid of Catalog Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white border border-slate-100 rounded-2xl p-3 space-y-3 shadow-sm flex flex-col"
                >
                  {/* Photo Thumbnail Placeholder */}
                  <div className="w-full aspect-[4/3] bg-slate-100 animate-pulse rounded-xl"></div>
                  {/* Service Title */}
                  <div className="h-4 w-[75%] bg-slate-100/80 animate-pulse rounded"></div>
                  {/* Service Price/Subtext */}
                  <div className="h-3 w-[50%] bg-slate-100/60 animate-pulse rounded"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
