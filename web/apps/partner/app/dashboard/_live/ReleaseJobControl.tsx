type Props = {
  confirmRelease: boolean;
  setConfirmRelease: (v: boolean) => void;
  onRelease: () => void;
  busy: boolean;
};

export function ReleaseJobControl({ confirmRelease, setConfirmRelease, onRelease, busy }: Props) {
  if (!confirmRelease) {
    return (
      <button
        onClick={() => setConfirmRelease(true)}
        disabled={busy}
        className="mt-2 w-full rounded-xl py-2.5 text-xs font-semibold text-gray-500 underline-offset-2 hover:underline disabled:opacity-50"
      >
        Can't make it?
      </button>
    );
  }
  return (
    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
      <p className="text-xs font-semibold text-red-800">
        Release this job? We'll find the customer another professional. Frequent releases affect
        your reliability.
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <button
          onClick={() => setConfirmRelease(false)}
          disabled={busy}
          className="rounded-lg border border-gray-300 py-2 text-xs font-bold text-gray-600 disabled:opacity-50"
        >
          Keep job
        </button>
        <button
          onClick={onRelease}
          disabled={busy}
          className="rounded-lg bg-red-600 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy ? "Releasing…" : "Yes, release"}
        </button>
      </div>
    </div>
  );
}
