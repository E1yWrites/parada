import { StyleSheet, View } from "react-native";
import { colors } from "@/src/theme";

type Blob = {
  color: string;
  size: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

/**
 * Two off-screen-anchored blobs give the redesign's glass surfaces something
 * with color/depth to blur. Positioned so most of each circle falls outside
 * the visible frame — the visible slice reads as a soft ambient wash, not a
 * hard-edged shape.
 */
const BLOBS: Blob[] = [
  { color: colors.primary, size: 420, top: -160, left: -140 },
  { color: colors.success, size: 380, bottom: -140, right: -120 },
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
    opacity: 0.1,
  },
  core: {
    width: "60%",
    height: "60%",
    opacity: 0.35,
  },
});
