import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { colors, radii, softColor } from "@/src/theme";

type IconTileProps = {
  icon: ComponentProps<typeof Ionicons>["name"];
  /** Semantic color; the tile takes its soft tint and the glyph the full color. */
  color?: string;
  /** Tile edge in points. */
  size?: number;
  /** `filled` paints the tile in the full color with a white glyph. */
  filled?: boolean;
  testID?: string;
};

/** Rounded tinted square holding one expressive icon. */
export function IconTile({ icon, color = colors.primary, size = 44, filled = false, testID }: IconTileProps) {
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
          borderRadius: Math.round(size * 0.32),
          backgroundColor: filled ? color : softColor(color),
        },
      ]}>
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={filled ? colors.onAccent : color} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: radii.md,
  },
});
