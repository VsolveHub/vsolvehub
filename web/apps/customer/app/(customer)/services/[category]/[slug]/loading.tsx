export default function ServiceDetailLoading() {
  return (
    <div
      className="w-full max-w-[1280px] mx-auto px-4 md:px-6 py-6 mt-6 grid grid-cols-1 lg:grid-cols-12 gap-8"
      aria-busy="true"
      aria-label="Loading service details"
    >
      {/* Left Column: Hero & Booking Hub */}
      <div className="lg:col-span-5 space-y-6">
        {/* Aspect ratio video placeholder for Hero Image */}
        <div className="w-full aspect-[4/3] sm:aspect-[16/10] bg-neutral-200 animate-pulse rounded-2xl"></div>

        {/* Breadcrumbs */}
        <div className="flex gap-2 items-center mt-4">
          <div className="h-4 w-20 bg-neutral-200 animate-pulse rounded"></div>
          <span className="text-neutral-300">/</span>
          <div className="h-4 w-28 bg-neutral-200 animate-pulse rounded"></div>
        </div>

        {/* Title */}
        <div className="h-8 w-[80%] bg-neutral-200 animate-pulse rounded-lg mt-4"></div>

        {/* Rating Row */}
        <div className="flex gap-2 items-center mt-2">
          <div className="h-5 w-16 bg-neutral-200 animate-pulse rounded-full"></div>
          <div className="h-4 w-36 bg-neutral-200 animate-pulse rounded"></div>
        </div>

        {/* Pricing & Booking Card */}
        <div className="border border-neutral-100 rounded-2xl p-5 bg-white shadow-sm space-y-4 mt-6">
          <div className="flex justify-between items-center">
            <div className="space-y-2">
              <div className="h-7 w-28 bg-neutral-200 animate-pulse rounded"></div>
              <div className="h-4 w-36 bg-neutral-200 animate-pulse rounded"></div>
            </div>
            <div className="h-10 w-28 bg-neutral-200 animate-pulse rounded-xl"></div>
          </div>
          <div className="border-t border-neutral-100 pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 bg-neutral-200 animate-pulse rounded-full"></div>
              <div className="h-4 w-48 bg-neutral-200 animate-pulse rounded"></div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 bg-neutral-200 animate-pulse rounded-full"></div>
              <div className="h-4 w-32 bg-neutral-200 animate-pulse rounded"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Inclusions & Feedback */}
      <div className="lg:col-span-7 space-y-6">
        {/* Inclusions Card */}
        <div className="space-y-4">
          <div className="h-6 w-56 bg-neutral-200 animate-pulse rounded"></div>
          <div className="border border-neutral-100 rounded-2xl p-5 bg-white space-y-4 shadow-sm">
            <div className="flex justify-between items-center">
              <div className="h-5 w-40 bg-neutral-200 animate-pulse rounded"></div>
              <div className="h-5 w-5 bg-neutral-200 animate-pulse rounded-full"></div>
            </div>
            <div className="space-y-3 pt-4 border-t border-neutral-100">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="flex gap-3 items-center">
                  <div className="h-4 w-4 bg-neutral-200 animate-pulse rounded-full"></div>
                  <div className="h-4 w-[85%] bg-neutral-200 animate-pulse rounded"></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Reviews Section */}
        <div className="space-y-4 mt-6">
          <div className="h-6 w-48 bg-neutral-200 animate-pulse rounded"></div>
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, idx) => (
              <div key={idx} className="border border-neutral-100 rounded-2xl p-5 bg-white shadow-sm space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex gap-3 items-center">
                    <div className="h-10 w-10 bg-neutral-200 animate-pulse rounded-full"></div>
                    <div className="space-y-1">
                      <div className="h-4 w-24 bg-neutral-200 animate-pulse rounded"></div>
                      <div className="h-3 w-16 bg-neutral-200 animate-pulse rounded"></div>
                    </div>
                  </div>
                  <div className="h-4 w-12 bg-neutral-200 animate-pulse rounded"></div>
                </div>
                <div className="h-4 w-full bg-neutral-200 animate-pulse rounded mt-2"></div>
                <div className="h-4 w-[75%] bg-neutral-200 animate-pulse rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
