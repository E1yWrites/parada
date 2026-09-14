import { StyleSheet, View } from "react-native";
import type { ReactNode } from "react";
import { spacing } from "@/src/theme";
import { Text } from "./Text";

type SectionHeaderProps = {
  title: string;
  /** Short description under the title (a sentence, never a label above it). */
  caption?: string;
  right?: ReactNode;
  testID?: string;
};

export function SectionHeader({ title, caption, right, testID }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.textGroup}>
        <Text testID={testID ? `${testID}-title` : undefined} variant="section">
          {title}
        </Text>
        {caption ? (
          <Text testID={testID ? `${testID}-caption` : undefined} variant="caption">
            {caption}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  textGroup: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  right: {
    alignItems: "flex-end",
  },
});
