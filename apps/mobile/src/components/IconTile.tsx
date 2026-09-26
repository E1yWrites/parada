import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { radii } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import { softColor } from "@/src/theme/colors";

type IconTileProps = {
  icon: ComponentProps<typeof Ionicons>["name"];
  /** Semantic color; the tile takes its soft tint and the glyph the full color. */
  color?: string;
  /** Tile edge in points. */
  size?: number;
  /** `filled` paints the tile in the full color with an ink glyph. */
  filled?: boolean;
  testID?: string;
};

/** Small cut-cornered tile holding one status icon — the same shape as
 *  `Card`/`Button` at token scale, not a separate rounded-blob language. */
export function IconTile({ icon, color, size = 40, filled = false, testID }: IconTileProps) {
  const colors = useColors();
  const resolvedColor = color ?? colors.primary;
  const cut = Math.max(2, Math.round(size * 0.09));
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderTopRightRadius: cut,
          backgroundColor: filled ? resolvedColor : softColor(resolvedColor, colors),
        },
      ]}>
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={filled ? colors.onAccent : resolvedColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: radii.sm,
    borderTopRightRadius: radii.cut,
  },
});
