import Svg, { Circle, Path, Rect } from "react-native-svg";

/**
 * Side-view vehicle art for Rides: bike, auto and cab. Two-tone in the VSolve theme, so they do not
 * take a colour prop. The values are the tokens in guide/03-design-system.md: navy-700, signal-500
 * and white. Drawn on a 48px grid; `size` scales the whole picture.
 */
const NAVY = "#00246b";
const SIGNAL = "#f87000";
const WHITE = "#ffffff";

interface VehicleIconProps {
  size?: number;
}

function Wheel({ cx, cy, r, hub }: { cx: number; cy: number; r: number; hub: number }) {
  return (
    <>
      <Circle cx={cx} cy={cy} r={r} fill={NAVY} stroke={WHITE} strokeWidth={1.5} />
      <Circle cx={cx} cy={cy} r={hub} fill={WHITE} />
    </>
  );
}

export function BikeIcon({ size = 24 }: VehicleIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {/* Fork, handlebar and swing arm */}
      <Path d="M33 16 L37 34" stroke={NAVY} strokeWidth={2.5} strokeLinecap="round" fill="none" />
      <Path d="M29 14.5 L35 14" stroke={NAVY} strokeWidth={2.5} strokeLinecap="round" fill="none" />
      <Path d="M11 34 L19 29" stroke={NAVY} strokeWidth={2.5} strokeLinecap="round" fill="none" />
      {/* Seat, tank, engine and headlight */}
      <Path d="M7 25 C8 22 11 21.5 14 21.5 H25 L27 24.5 H14 C12 24.5 10 25 9 27 Z" fill={NAVY} />
      <Path d="M23 21.5 C24 18 27 16.5 30 16.5 H32.5 L31.5 22.5 H23 Z" fill={SIGNAL} />
      <Path d="M14 24.5 H31 L29 32 H19 Z" fill={NAVY} />
      <Circle cx={35.5} cy={19} r={2} fill={SIGNAL} />
      <Wheel cx={11} cy={34} r={6} hub={2} />
      <Wheel cx={37} cy={34} r={6} hub={2} />
    </Svg>
  );
}

export function AutoIcon({ size = 24 }: VehicleIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {/* Canopy, body and the two windows */}
      <Path d="M5 13 C5 9.5 8 8.5 12 8.5 H26 C29.5 8.5 31.5 10 32.5 12.5 L33.5 14 H7 Z" fill={NAVY} />
      <Path d="M7 14 H32 L37 23 C38.5 23.5 40 25 40 27 V31 H7 Z" fill={SIGNAL} />
      <Path d="M10 17 H20 V24 H10 Z" fill={WHITE} />
      <Path d="M22.5 17 H29.5 L33 24 H22.5 Z" fill={WHITE} />
      <Circle cx={39} cy={27} r={1.4} fill={WHITE} />
      {/* Two rear wheels in line, one small front wheel under a mudguard */}
      <Wheel cx={13} cy={34} r={5.5} hub={1.8} />
      <Path d="M30 31 C30 27.5 33 26 36.5 26 C40 26 42 28 42 31 Z" fill={NAVY} />
      <Wheel cx={36.5} cy={34.5} r={4.5} hub={1.5} />
    </Svg>
  );
}

export function CabIcon({ size = 24 }: VehicleIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        d="M4 31 V25.5 C4 24 5 23 7 22.5 L12 21.5 L17 14 H31 L37 21.5 L42 22.5 C43.5 23 44 24 44 25.5 V31 Z"
        fill={NAVY}
      />
      <Path d="M18.5 16.5 H23.5 V21.5 H14.5 Z" fill={WHITE} />
      <Path d="M25.5 16.5 H30 L34 21.5 H25.5 Z" fill={WHITE} />
      {/* Roof light and headlight */}
      <Rect x={21} y={11} width={6} height={3} rx={1} fill={SIGNAL} />
      <Rect x={41} y={25} width={3} height={2.5} rx={1} fill={SIGNAL} />
      <Wheel cx={13} cy={31} r={5.5} hub={1.8} />
      <Wheel cx={35} cy={31} r={5.5} hub={1.8} />
    </Svg>
  );
}
