export function FaqSection() {
  return (
    <section className="mt-20 border-t border-gray-100 pt-12 max-w-3xl mx-auto">
      <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight text-center mb-8">
        Frequently Asked Questions
      </h2>

      <div className="space-y-6">
        <div className="bg-slate-50 p-5 sm:p-6 rounded-2xl border border-gray-100">
          <h4 className="font-bold text-gray-900 text-base flex items-start space-x-3">
            <span className="text-orange-600 font-extrabold">Q.</span>
            <span>How do I choose the right cleaning service?</span>
          </h4>
          <p className="text-gray-600 text-sm mt-2.5 ml-6 leading-relaxed">
            Assess your needs: deep cleaning for seasonal maintenance or express cleaning for weekly upkeep. All our professionals are rated for transparency and background verified for safety.
          </p>
        </div>

        <div className="bg-slate-50 p-5 sm:p-6 rounded-2xl border border-gray-100">
          <h4 className="font-bold text-gray-900 text-base flex items-start space-x-3">
            <span className="text-orange-600 font-extrabold">Q.</span>
            <span>Are the service charges inclusive of materials?</span>
          </h4>
          <p className="text-gray-600 text-sm mt-2.5 ml-6 leading-relaxed">
            Yes, our standard charges for deep cleaning include all specialized eco-safe cleaning agents, equipment, and travel costs. No hidden fees or extra material costs.
          </p>
        </div>
      </div>
    </section>
  );
}
