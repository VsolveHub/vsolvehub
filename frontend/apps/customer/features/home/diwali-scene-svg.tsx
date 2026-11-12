import type { SVGProps } from "react";

export function DiwaliSceneSvg({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 800 450"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <rect width="800" height="450" fill="#2B0E06" />
      <circle cx="580" cy="270" r="280" fill="#F5A524" opacity="0.1" />
      <circle cx="580" cy="270" r="170" fill="#F5A524" opacity="0.13" />
      <path d="M0 40Q200 110 400 40T800 40" fill="none" stroke="#8A5A2B" strokeWidth="2" />
      <g fill="#FAC775">
        <circle cx="100" cy="66" r="8" />
        <circle cx="300" cy="66" r="8" />
        <circle cx="600" cy="5" r="8" />
      </g>
      <g fill="#F0997B">
        <circle cx="200" cy="75" r="8" />
        <circle cx="500" cy="14" r="8" />
        <circle cx="700" cy="14" r="8" />
      </g>
      <g fill="#F5A524" opacity="0.2">
        <circle cx="560" cy="250" r="70" />
        <circle cx="400" cy="340" r="50" />
        <circle cx="720" cy="335" r="46" />
      </g>
      <path d="M500 290h120a60 60 0 0 1-120 0z" fill="#C2542B" />
      <path d="M560 170C530 215 536 270 560 290C584 270 590 215 560 170z" fill="#FAC775" />
      <path d="M560 215C548 240 550 268 560 280C570 268 572 240 560 215z" fill="#EF9F27" />
      <path d="M360 372h80a40 40 0 0 1-80 0z" fill="#C2542B" />
      <path d="M400 300C382 330 386 358 400 372C414 358 418 330 400 300z" fill="#FAC775" />
      <path d="M685 362h70a35 35 0 0 1-70 0z" fill="#C2542B" />
      <path d="M720 296C704 322 708 348 720 362C732 348 736 322 720 296z" fill="#FAC775" />
      <path d="M300 436H800" stroke="#EF9F27" strokeWidth="22" strokeDasharray="0 26" strokeLinecap="round" />
      <g fill="#FAC775">
        <path d="M690 130l4 12 12 4-12 4-4 12-4-12-12-4 12-4z" />
        <path d="M440 150l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" />
        <path d="M760 230l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" />
      </g>
    </svg>
  );
}

