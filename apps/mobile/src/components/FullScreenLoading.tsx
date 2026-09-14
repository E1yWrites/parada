import { ActivityIndicator, StyleSheet, View } from "react-native";
import { colors, radii, shadows } from "@/src/theme";
import { GradientMesh } from "./GradientMesh";

/** Full-viewport centered loader (used while fonts / session bootstrap). */
export function FullScreenLoading({ testID }: { testID?: string }) {
  return (
    <View style={styles.container} testID={testID}>
      <GradientMesh />
      <View style={styles.tile}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  tile: {
    width: 72,
    height: 72,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
});
