import { StyleSheet, View } from "react-native";
import { spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import { ErrorState } from "./StateComponents";

/**
 * Shown instead of the login redirect when the stored session could not be
 * verified (offline, timeout, outage). The token is still stored, so the
 * driver is not signed out; they only need a connection and a retry.
 */
export function BootError({ onRetry }: { onRetry: () => void }) {
  const colors = useColors();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} testID="boot-error">
      <ErrorState message="Can't reach PARADA. Check your connection." onRetry={onRetry} testID="boot-error-state" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: spacing.xl2 },
});
