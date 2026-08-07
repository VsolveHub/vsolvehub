"use client";

export function DashboardView() {
  return (
    <div className="space-y-8">
      {/* Top 4 KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: BREACHING SLA */}
        <div className="bg-surface border border-line rounded-card p-4 border-l-4 border-l-[#b3261e] shadow-card">
          <span className="text-xs font-bold text-text-secondary tracking-wider uppercase">
            BREACHING SLA
          </span>
          <div className="mt-1.5 flex items-baseline">
            <span className="text-3xl font-bold text-text">2</span>
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            <span className="font-semibold text-text">2</span> overdue by 40m and 1h 15m
          </p>
        </div>

        {/* Card 2: MY OPEN CASES */}
        <div className="bg-surface border border-line rounded-card p-4 border-l-4 border-l-[#00246b] shadow-card">
          <span className="text-xs font-bold text-text-secondary tracking-wider uppercase">
            MY OPEN CASES
          </span>
          <div className="mt-1.5 flex items-baseline">
            <span className="text-3xl font-bold text-text">7</span>
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            <span className="font-semibold text-text">3</span> nearing deadline
          </p>
        </div>

        {/* Card 3: AWAITING REVIEW */}
        <div className="bg-surface border border-line rounded-card p-4 border-l-4 border-l-[#5f584d] shadow-card">
          <span className="text-xs font-bold text-text-secondary tracking-wider uppercase">
            AWAITING REVIEW
          </span>
          <div className="mt-1.5 flex items-baseline">
            <span className="text-3xl font-bold text-text">14</span>
          </div>
          <p className="mt-1 text-xs text-text-secondary">Quality check queue</p>
        </div>

        {/* Card 4: AWAITING APPROVAL */}
        <div className="bg-surface border border-line rounded-card p-4 border-l-4 border-l-[#8a3a00] shadow-card">
          <span className="text-xs font-bold text-text-secondary tracking-wider uppercase">
            AWAITING APPROVAL
          </span>
          <div className="mt-1.5 flex items-baseline">
            <span className="text-3xl font-bold text-text">3</span>
          </div>
          <p className="mt-1 text-xs text-text-secondary">Requires manager sign-off</p>
        </div>
      </div>

      {/* Main Content Grid: Assigned Table (Left ~65%) & Queue Cards (Right ~35%) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column (Assigned Cases) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-text">Assigned to me</h2>
            <span className="text-xs text-text-secondary">Sorted by soonest deadline</span>
          </div>

          <div className="bg-surface border border-line rounded-card overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-sunken/60 text-text-secondary uppercase tracking-wider text-xs font-semibold">
                    <th className="py-3 px-4 font-semibold">CASE REF</th>
                    <th className="py-3 px-4 font-semibold">KIND</th>
                    <th className="py-3 px-4 font-semibold">SEVERITY</th>
                    <th className="py-3 px-4 font-semibold">CUSTOMER</th>
                    <th className="py-3 px-4 font-semibold">DUE IN</th>
                    <th className="py-3 px-4 font-semibold">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {/* Row 1 - Overdue / High */}
                  <tr className="bg-[#fdecea]/40 border-l-2 border-l-[#b3261e]">
                    <td className="py-3.5 px-4 font-bold text-text">CS-8921</td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface border border-line text-text-secondary">
                        Refund
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#fdecea] text-[#b3261e] border border-[#f4b8b3]">
                        High
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-text font-medium">Ramesh Kumar</td>
                    <td className="py-3.5 px-4 font-bold text-[#b3261e]">
                      overdue 12m
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-md text-xs font-bold bg-[#f87000] text-[#00112e] hover:bg-[#fb8130] transition-colors shadow-xs"
                      >
                        Review
                      </button>
                    </td>
                  </tr>

                  {/* Row 2 - Medium */}
                  <tr className="bg-surface hover:bg-surface-hover/50 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-text">DP-4432</td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface border border-line text-text-secondary">
                        Dispatch
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#fff4ec] text-[#8a5200] border border-[#ffc4a0]">
                        Medium
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-text font-medium">₹2,450 Order</td>
                    <td className="py-3.5 px-4 text-text-secondary">in 14m</td>
                    <td className="py-3.5 px-4">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-md text-xs font-semibold border border-line-strong bg-surface text-text hover:bg-surface-hover transition-colors"
                      >
                        Review
                      </button>
                    </td>
                  </tr>

                  {/* Row 3 - Low */}
                  <tr className="bg-surface hover:bg-surface-hover/50 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-text">BK-1102</td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface border border-line text-text-secondary">
                        Booking
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#eef2fb] text-[#2551a3] border border-[#b0c2e8]">
                        Low
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-text font-medium">Priya Nair</td>
                    <td className="py-3.5 px-4 text-text-secondary">in 42m</td>
                    <td className="py-3.5 px-4">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-md text-xs font-semibold border border-line-strong bg-surface text-text hover:bg-surface-hover transition-colors"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Unclaimed Queue Card */}
          <div className="bg-surface border border-line rounded-card p-5 shadow-card">
            <h2 className="text-base font-bold text-text mb-4">Unclaimed queue</h2>
            <ul className="divide-y divide-line text-sm">
              <li className="py-2.5 flex items-center justify-between">
                <span className="text-text font-medium">Dispatch</span>
                <span className="font-bold text-text">24</span>
              </li>
              <li className="py-2.5 flex items-center justify-between">
                <span className="text-text font-medium">Booking Support</span>
                <span className="font-bold text-text">8</span>
              </li>
              <li className="py-2.5 flex items-center justify-between">
                <span className="text-text font-medium">Quality</span>
                <span className="font-bold text-text">15</span>
              </li>
              <li className="py-2.5 flex items-center justify-between">
                <span className="text-text font-medium">Safety</span>
                <span className="font-bold text-text">1</span>
              </li>
              <li className="py-2.5 flex items-center justify-between">
                <span className="text-text font-medium">Finance</span>
                <span className="font-bold text-text">42</span>
              </li>
            </ul>
          </div>

          {/* System State Card */}
          <div className="bg-surface border border-line rounded-card p-5 shadow-card">
            <h2 className="text-base font-bold text-text mb-4">System state</h2>
            <ul className="divide-y divide-line text-sm">
              <li className="py-3 flex items-center justify-between">
                <span className="text-text font-medium">Auto-assignment</span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-line text-text-secondary bg-surface">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#2551a3]" />
                  Clear
                </span>
              </li>
              <li className="py-3 flex items-center justify-between">
                <span className="text-text font-medium">Surge pricing</span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#fdecea] text-[#b3261e] border border-[#f4b8b3]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#b3261e]" />
                  Engaged
                </span>
              </li>
              <li className="py-3 flex items-center justify-between">
                <span className="text-text font-medium">Manual review gate</span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-line text-text-secondary bg-surface">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#2551a3]" />
                  Clear
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
