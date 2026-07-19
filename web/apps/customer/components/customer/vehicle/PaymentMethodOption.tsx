type Props = {
  selected: boolean;
  selectedBorderClass?: string;
  icon: string;
  title: string;
  subtitle: string;
  badge?: string;
  onSelect: () => void;
};

export function PaymentMethodOption({ selected, selectedBorderClass = "border-purple-650", icon, title, subtitle, badge, onSelect }: Props) {
  return (
    <div
      onClick={onSelect}
      className={`p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
        selected ? `${selectedBorderClass} bg-purple-50/40` : "border-gray-150 bg-white"
      }`}
    >
      <div className="flex items-center gap-3.5">
        <span className="text-xl select-none">{icon}</span>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-extrabold text-xs text-slate-800 m-0">{title}</h4>
            {badge && (
              <span className="bg-amber-400 text-purple-955 text-[7px] font-black px-1.5 py-0.5 rounded uppercase">
                {badge}
              </span>
            )}
          </div>
          <p className="text-[9px] text-gray-400 font-semibold mt-0.5 m-0">{subtitle}</p>
        </div>
      </div>
      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
        selected ? "border-purple-900 bg-purple-900" : "border-gray-300 bg-white"
      }`}>
        {selected && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
      </div>
    </div>
  );
}
