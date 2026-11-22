import { memo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import type { CircleProps, GProps, PathProps, RectProps, SvgProps } from "react-native-svg";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

// Type adapters for React 19 / TypeScript 6 JSX compatibility with React 18 class components
const NativeSvg = Svg as unknown as (props: SvgProps) => React.JSX.Element;
const NativeRect = Rect as unknown as (props: RectProps) => React.JSX.Element;
const NativeCircle = Circle as unknown as (props: CircleProps) => React.JSX.Element;
const NativePath = Path as unknown as (props: PathProps) => React.JSX.Element;
const NativeG = G as unknown as (props: GProps) => React.JSX.Element;

interface DiwaliSceneSvgProps {
  style?: StyleProp<ViewStyle>;
  width?: number | string;
  height?: number | string;
}

export const DiwaliSceneSvg = memo(function DiwaliSceneSvg({
  style,
  width = "100%",
  height = "100%",
}: DiwaliSceneSvgProps) {
  return (
    <NativeSvg
      viewBox="0 0 800 450"
      preserveAspectRatio="xMidYMid slice"
      style={style}
      width={width}
      height={height}
      aria-hidden={true}
    >
      <NativeRect width={800} height={450} fill="#2B0E06" />
      <NativeCircle cx={580} cy={270} r={280} fill="#F5A524" opacity={0.1} />
      <NativeCircle cx={580} cy={270} r={170} fill="#F5A524" opacity={0.13} />
      <NativePath d="M0 40Q200 110 400 40T800 40" fill="none" stroke="#8A5A2B" strokeWidth={2} />
      <NativeG fill="#FAC775">
        <NativeCircle cx={100} cy={66} r={8} />
        <NativeCircle cx={300} cy={66} r={8} />
        <NativeCircle cx={600} cy={5} r={8} />
      </NativeG>
      <NativeG fill="#F0997B">
        <NativeCircle cx={200} cy={75} r={8} />
        <NativeCircle cx={500} cy={14} r={8} />
        <NativeCircle cx={700} cy={14} r={8} />
      </NativeG>
      <NativeG fill="#F5A524" opacity={0.2}>
        <NativeCircle cx={560} cy={250} r={70} />
        <NativeCircle cx={400} cy={340} r={50} />
        <NativeCircle cx={720} cy={335} r={46} />
      </NativeG>
      <NativePath d="M500 290h120a60 60 0 0 1-120 0z" fill="#C2542B" />
      <NativePath d="M560 170C530 215 536 270 560 290C584 270 590 215 560 170z" fill="#FAC775" />
      <NativePath d="M560 215C548 240 550 268 560 280C570 268 572 240 560 215z" fill="#EF9F27" />
      <NativePath d="M360 372h80a40 40 0 0 1-80 0z" fill="#C2542B" />
      <NativePath d="M400 300C382 330 386 358 400 372C414 358 418 330 400 300z" fill="#FAC775" />
      <NativePath d="M685 362h70a35 35 0 0 1-70 0z" fill="#C2542B" />
      <NativePath d="M720 296C704 322 708 348 720 362C732 348 736 322 720 296z" fill="#FAC775" />
      <NativePath d="M300 436H800" stroke="#EF9F27" strokeWidth={22} strokeDasharray="0 26" strokeLinecap="round" />
      <NativeG fill="#FAC775">
        <NativePath d="M690 130l4 12 12 4-12 4-4 12-4-12-12-4 12-4z" />
        <NativePath d="M440 150l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" />
        <NativePath d="M760 230l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" />
      </NativeG>
    </NativeSvg>
  );
});
