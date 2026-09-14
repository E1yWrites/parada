import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing } from "@/src/theme";
import { Text } from "./Text";

type BrandMarkProps = {
  /** Show the PARADA wordmark beside the tile. */
  wordmark?: boolean;
  size?: number;
  testID?: string;
};

/**
 * PARADA mark: a blue tile with a car glyph — the gate-pass "badge" — and the
 * wordmark set in the display face. The only place the brand draws itself.
 */
export function BrandMark({ wordmark = true, size = 44, testID }: BrandMarkProps) {
  return (
    <View style={styles.row} testID={testID} accessibilityRole="header" accessibilityLabel="PARADA">
      <View style={[styles.tile, { width: size, height: size, borderRadius: Math.round(size * 0.3) }]}>
        <Ionicons name="car-sport" size={Math.round(size * 0.55)} color={colors.onAccent} />
      </View>
      {wordmark ? (
        <Text variant="title" style={styles.word}>
          PARADA
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  tile: {
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 4,
  },
  word: {
    letterSpacing: 2,
  },
});
