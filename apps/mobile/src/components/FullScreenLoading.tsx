import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { radii } from "@/src/theme";
import { useColors, useThemeShadows } from "@/src/providers/ThemeProvider";

/** Full-viewport centered loader (used while fonts / session bootstrap). */
export function FullScreenLoading({ testID }: { testID?: string }) {
  const colors = useColors();
  const shadows = useThemeShadows();
  const styles = useMemo(
    () =>
      StyleSheet.create({
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
          borderTopRightRadius: radii.cut,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          ...shadows.card,
        },
      }),
    [colors, shadows],
  );
  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.tile}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    </View>
  );
}
