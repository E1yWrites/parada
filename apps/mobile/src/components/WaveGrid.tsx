import { memo, useEffect, useMemo, useState } from "react";
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { useColors, useColorSchemeResolved } from "@/src/providers/ThemeProvider";
import { usePrefersReducedMotion } from "@/src/hooks/usePrefersReducedMotion";

/** One sine wavelength, in points. Each line slides exactly this far per loop, so the loop is seamless. */
const WAVELENGTH = 130;

/**
 * Shared "energy" for every wave grid on screen. Touches, presses and sheets
 * call `pulseWaves()`: the lines swell and brighten, then settle back on a
 * spring — the ground answers the hand (secondary action / follow-through).
 */
const energy = new Animated.Value(0);
let pulsing: Animated.CompositeAnimation | null = null;
export function pulseWaves(strength = 1): void {
  pulsing?.stop();
  pulsing = Animated.sequence([
    Animated.timing(energy, { toValue: strength, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    Animated.spring(energy, { toValue: 0, friction: 4, tension: 30, useNativeDriver: true }),
  ]);
  pulsing.start();
}

type WaveGridProps = {
  /** `quiet` sits behind app screens; `vivid` is the onboarding / sign-in stage. */
  intensity?: "quiet" | "vivid";
  /** Where the field starts, as a fraction of the height (the horizon). */
  horizon?: number;
  /** Fade the field back to the ground from this fraction down, so copy laid over it stays legible. */
  scrimFrom?: number;
  testID?: string;
};

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

function wavePath(width: number, amp: number, phase: number): string {
  const pts: string[] = [];
  for (let x = -WAVELENGTH; x <= width + WAVELENGTH; x += 6) {
    const y = amp + 2 + amp * Math.sin((2 * Math.PI * x) / WAVELENGTH + phase);
    pts.push(`${(x + WAVELENGTH).toFixed(1)},${y.toFixed(1)}`);
  }
  return `M${pts.join(" L")}`;
}

const WaveLine = memo(function WaveLine({
  width, top, amp, phase, stroke, strokeWidth, opacity, duration, animate, depth,
}: {
  width: number; top: number; amp: number; phase: number; stroke: string; strokeWidth: number;
  opacity: number; duration: number; animate: boolean; depth: number;
}) {
  const [x] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!animate) {
      x.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(x, { toValue: -WAVELENGTH, duration, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, duration, x]);
  const h = amp * 2 + 4;
  return (
    <Animated.View
      style={{ position: "absolute", left: -WAVELENGTH, top: top - amp - 2, width: width + 2 * WAVELENGTH, height: h, opacity, transform: animate ? [{ translateX: x }, { scaleY: energy.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + 1.1 * depth] }) }] : [{ translateX: x }] }}>
      <Svg width={width + 2 * WAVELENGTH} height={h}>
        <Path d={wavePath(width, amp, phase)} stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
});

/**
 * The Clear ground: two soft light fields plus a perspective wave grid — sine
 * lines that swell toward the viewer and slide one wavelength on a seamless
 * loop, over static rails converging to the horizon, in the ground's own grays.
 * Touches swell it briefly (`pulseWaves`). Purely decorative (hidden from assistive tech);
 * frozen under Reduce Motion.
 */
export function WaveGrid({ intensity = "quiet", horizon = 0.56, scrimFrom, testID }: WaveGridProps) {
  const colors = useColors();
  const scheme = useColorSchemeResolved();
  const reducedMotion = usePrefersReducedMotion();
  const { width, height } = useWindowDimensions();
  const vivid = intensity === "vivid";
  // Monochrome, in the ground's own family: white → mid gray on light, near-black
  // → gray on dark. Stronger than before so the field reads as structure.
  const dark = scheme === "dark";
  const far = dark ? "#1E222B" : "#FFFFFF";
  const near = dark ? "#6B7280" : "#8A919E";
  const glow = dark ? "#3A404C" : "#FFFFFF";
  const opacity = vivid ? 1 : dark ? 0.8 : 0.75;
  const lineCount = vivid ? 22 : 14;
  const y0 = height * horizon;

  const lines = useMemo(
    () =>
      Array.from({ length: lineCount }, (_, i) => {
        const f = (i + 1) / lineCount;
        return {
          key: i,
          top: y0 + (height - y0) * f ** 1.7,
          amp: 1.5 + 13 * f,
          phase: i * 0.55,
          stroke: mix(far, near, f),
          depth: f,
          strokeWidth: 0.5 + 1.5 * f,
          opacity: 0.35 + 0.65 * f,
          duration: (11 - 6 * f) * 1000,
        };
      }),
    [far, near, height, lineCount, y0],
  );

  const rails = useMemo(() => {
    const out: string[] = [];
    for (let k = -7; k <= 7; k++) {
      out.push(`M${width / 2 + k * 6},${y0} L${width / 2 + k * (width / 5.5)},${height + 16}`);
    }
    return out.join(" ");
  }, [height, width, y0]);

  return (
    <View
      testID={testID}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="wg-warm" cx="0" cy="0" r="1">
            <Stop offset="0" stopColor={glow} stopOpacity={dark ? 0.5 : 0.9} />
            <Stop offset="1" stopColor={glow} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="wg-cool" cx="1" cy="0.5" r="1">
            <Stop offset="0" stopColor={near} stopOpacity={dark ? 0.22 : 0.16} />
            <Stop offset="1" stopColor={near} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={-width * 0.08} cy={-height * 0.05} rx={width * 1.3} ry={height * 0.5} fill="url(#wg-warm)" />
        <Ellipse cx={width * 1.12} cy={height * 0.46} rx={width * 1.2} ry={height * 0.6} fill="url(#wg-cool)" />
        <Path d={rails} stroke={near} strokeWidth={0.7} opacity={opacity * 0.5} />
      </Svg>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { opacity: reducedMotion ? opacity : Animated.add(opacity * 0.85, energy.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] })) },
        ]}>
        {lines.map(({ key, ...line }) => (
          <WaveLine key={key} width={width} animate={!reducedMotion} {...line} />
        ))}
      </Animated.View>
      {scrimFrom != null ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="wg-scrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.background} stopOpacity={0} />
              <Stop offset="0.35" stopColor={colors.background} stopOpacity={0.88} />
              <Stop offset="1" stopColor={colors.background} stopOpacity={0.94} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={height * scrimFrom} width={width} height={height * (1 - scrimFrom)} fill="url(#wg-scrim)" />
        </Svg>
      ) : null}
    </View>
  );
}
