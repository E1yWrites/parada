import { ActivityIndicator, StyleSheet, View } from "react-native";
import { colors } from "@/src/theme";

/** Full-viewport centered loader (used while fonts / session bootstrap). */
export function FullScreenLoading({ testID }: { testID?: string }) {
  return (
    <View style={styles.container} testID={testID}>
      <ActivityIndicator color={colors.orange} size="large" />
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
});