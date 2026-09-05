/**
 * The one sentence about wage money, said once per screen at most.
 *
 * Every crew screen used to carry its own paraphrase of "you pay the crew directly and Vsolve
 * never holds it" — nine hand-written variants across the journey. This is the only place the
 * sentence lives now; a screen that needs it renders this and nothing else on the subject.
 */
export function WageLine({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-5 text-text-secondary ${className}`.trim()}>
      Paid to the crew directly — Vsolve holds none of it.
    </p>
  );
}
