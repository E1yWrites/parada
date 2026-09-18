import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Text";
import { colors, radii, spacing } from "@/src/theme";

type IconName = keyof typeof Ionicons.glyphMap;

type FormAlertProps = {
  /** `error` is announced to assistive tech; `notice` is informational. */
  tone: "error" | "notice";
  message: string;
  /** Defaults to alert-circle for errors and checkmark-circle for notices. */
  icon?: IconName;
  testID?: string;
};

/**
 * The inline banner every auth and account form shows above its fields. One
 * component so the six screens that each hand-rolled it stay identical, and
 * so an error is always announced as one.
 */
export function FormAlert({ tone, message, icon, testID }: FormAlertProps) {
  const isError = tone === "error";
  const color = isError ? colors.danger : colors.success;
  return (
    <View
      style={[styles.banner, isError ? styles.error : styles.notice]}
      testID={isError ? undefined : testID}>
      <Ionicons name={icon ?? (isError ? "alert-circle" : "checkmark-circle")} size={18} color={color} />
      <Text
        variant="caption"
        color={color}
        style={styles.text}
        accessibilityRole={isError ? "alert" : undefined}
        testID={isError ? testID : undefined}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  error: {
    backgroundColor: colors.dangerSoft,
  },
  notice: {
    backgroundColor: colors.successSoft,
  },
  text: {
    flex: 1,
  },
});
