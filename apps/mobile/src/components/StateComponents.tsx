import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { Card } from "./Card";
import { Text } from "./Text";
import { colors, spacing } from "@/src/theme";

export function LoadingState({ label = "Loading", testID }: { label?: string; testID?: string }) {
  return (
    <Card style={styles.card} testID={testID}>
      <ActivityIndicator testID={testID ? `${testID}-spinner` : undefined} color={colors.orange} size="large" />
      <Text variant="caption">{label}</Text>
    </Card>
  );
}

export function ErrorState({
  message,
  onRetry,
  testID,
}: {
  message: string;
  onRetry?: () => void;
  testID?: string;
}) {
  return (
    <Card style={styles.card} testID={testID}>
      <Ionicons name="cloud-offline-outline" size={32} color={colors.danger} />
      <Text variant="bodySemi" color={colors.danger} align="center">
        {message}
      </Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry"
          onPress={onRetry}
          hitSlop={10}
          style={styles.retry}
          testID={testID ? `${testID}-retry` : undefined}>
          <Text variant="caption" color={colors.orange} align="center">
            {"RETRY"}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  children,
  testID,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  title: string;
  description: string;
  children?: ReactNode;
  testID?: string;
}) {
  return (
    <Card style={styles.card} testID={testID}>
      <Ionicons name={icon} size={36} color={colors.muted} />
      <Text variant="title" align="center">
        {title}
      </Text>
      <Text variant="body" align="center" color={colors.muted}>
        {description}
      </Text>
      {children ? <View style={styles.action}>{children}</View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    gap: spacing.xl,
    marginVertical: spacing.xl,
  },
  action: {
    alignSelf: "stretch",
  },
  retry: {
    minHeight: 44,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
  },
});