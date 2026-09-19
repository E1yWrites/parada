import { StyleSheet, View, useWindowDimensions } from "react-native";
import { colors } from "@/src/theme";

type Blob = {
  color: string;
  size: number;
  opacity: number;
  /** Vertical anchor as a fraction of the WINDOW height (see below). */
  topFraction: number;
  /** Pixel offset applied after the fraction. */
  topOffset: number;
  left?: number;
  right?: number;
};

/**
 * Two off-screen-anchored washes give the cool ground a subtle gradient and
 * give frosted surfaces something to blur. Most of each circle falls outside
 * the frame — the visible slice reads as ambient color, never a shape.
 *
 * Both blobs are anchored from the TOP using the window height, never with
 * `bottom`. The parent view shrinks whenever the software keyboard opens or
 * changes height (Android adjustResize, iOS inset changes, the QuickType /
 * password bar toggling while typing), and a bottom-anchored wash would slide
 * up with every keystroke — the whole screen appeared to "fade upward" on
 * the auth forms. Window-based anchoring keeps the ambient layer still.
 */
const BLOBS: Blob[] = [
  { color: colors.primary, size: 460, opacity: 0.09, topFraction: 0, topOffset: -220, right: -160 },
  { color: colors.success, size: 380, opacity: 0.06, topFraction: 1, topOffset: -180, left: -150 },
];

/**
 * Ambient background layer behind `Screen` content. Each blob is two
 * concentric translucent circles — a cheap stand-in for a radial gradient,
 * since React Native has no native radial-gradient primitive — so the
 * visible edge fades rather than cutting off hard.
 */
export function GradientMesh({ testID }: { testID?: string }) {
  const { height } = useWindowDimensions();
  return (
    <View testID={testID} style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
      {BLOBS.map((blob, index) => (
        <View
          key={index}
          style={[
            styles.blob,
            {
              width: blob.size,
              height: blob.size,
              borderRadius: blob.size / 2,
              backgroundColor: blob.color,
              opacity: blob.opacity,
              top: Math.round(height * blob.topFraction) + blob.topOffset,
              left: blob.left,
              right: blob.right,
            },
          ]}>
          <View
            style={[
              styles.core,
              {
                borderRadius: blob.size * 0.35,
                backgroundColor: blob.color,
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
  },
  blob: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  core: {
    width: "60%",
    height: "60%",
    opacity: 0.4,
  },
});
