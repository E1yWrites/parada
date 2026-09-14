import { StyleSheet, View } from "react-native";
import { colors } from "@/src/theme";

type Blob = {
  color: string;
  size: number;
  opacity: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

/**
 * Two off-screen-anchored washes give the cool ground a subtle gradient and
 * give frosted surfaces something to blur. Most of each circle falls outside
 * the frame — the visible slice reads as ambient color, never a shape.
 */
const BLOBS: Blob[] = [
  { color: colors.primary, size: 460, opacity: 0.09, top: -220, right: -160 },
  { color: colors.success, size: 380, opacity: 0.06, bottom: -200, left: -150 },
];

/**
 * Ambient background layer behind `Screen` content. Each blob is two
 * concentric translucent circles — a cheap stand-in for a radial gradient,
 * since React Native has no native radial-gradient primitive — so the
 * visible edge fades rather than cutting off hard.
 */
export function GradientMesh({ testID }: { testID?: string }) {
  return (
    <View testID={testID} style={StyleSheet.absoluteFill} pointerEvents="none">
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
              top: blob.top,
              bottom: blob.bottom,
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
