import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { Card } from "./Card";
import { Illustration, type IllustrationName } from "./Illustration";
import { Text } from "./Text";
import { colors, radii, spacing, touchTarget } from "@/src/theme";

/** Quiet inline loader: spinner beside a short label, on the tinted surface. */
export function LoadingState({ label = "Loading", testID }: { label?: string; testID?: string }) {
  return (
    <Card tone="tinted" style={styles.loading} testID={testID}>
      <ActivityIndicator testID={testID ? `${testID}-spinner` : undefined} color={colors.primary} />
      <Text variant="caption" style={styles.loadingLabel}>
        {label}
      </Text>
      <View style={styles.skeleton} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.bone, styles.boneWide]} />
        <View style={[styles.bone, styles.boneNarrow]} />
      </View>
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
      <Illustration name="offline" size={96} />
      <View style={styles.textBlock}>
        <Text variant="title" align="center">
          Something went wrong
        </Text>
        <Text variant="body" align="center" color={colors.muted}>
          {message}
        </Text>
      </View>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry"
          onPress={onRetry}
          hitSlop={10}
          style={({ pressed }) => [styles.retry, pressed ? styles.retryPressed : undefined]}
          testID={testID ? `${testID}-retry` : undefined}>
          <Ionicons name="refresh" size={16} color={colors.primary} />
          <Text variant="bodySemi" color={colors.primary} align="center">
            Try again
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

export function EmptyState({
  icon,
  illustration,
  title,
  description,
  children,
  /** Smaller illustration and tighter padding for a lower-priority empty state
   *  (e.g. a list nested under its own create action, not a whole-screen state). */
  compact = false,
  testID,
}: {
  /** Legacy single-icon fallback; prefer `illustration`. */
  icon?: ComponentProps<typeof Ionicons>["name"];
  illustration?: IllustrationName;
  title: string;
  description: string;
  children?: ReactNode;
  compact?: boolean;
  testID?: string;
}) {
  return (
    <Card style={[styles.card, compact ? styles.cardCompact : undefined]} testID={testID}>
      {illustration ? (
        <Illustration name={illustration} size={compact ? 52 : 112} />
      ) : (
        <View style={[styles.iconContainer, compact ? styles.iconContainerCompact : undefined]}>
          <Ionicons name={icon ?? "ellipse-outline"} size={compact ? 24 : 32} color={colors.primary} />
        </View>
      )}
      <View style={styles.textBlock}>
        <Text variant={compact ? "bodySemi" : "title"} align="center">
          {title}
        </Text>
        <Text variant={compact ? "caption" : "body"} align="center" color={colors.muted}>
          {description}
        </Text>
      </View>
      {children ? <View style={styles.action}>{children}</View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  loading: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.lg,
    padding: spacing.xl,
  },
  loadingLabel: {
    flexShrink: 1,
  },
  skeleton: {
    width: "100%",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  bone: {
    height: 10,
    borderRadius: radii.full,
    backgroundColor: "rgba(15, 27, 45, 0.06)",
  },
  boneWide: {
    width: "70%",
  },
  boneNarrow: {
    width: "45%",
  },
  card: {
    alignItems: "center",
    gap: spacing.xl2,
    paddingVertical: spacing.xl4,
  },
  cardCompact: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  textBlock: {
    gap: spacing.md,
    alignSelf: "stretch",
    paddingHorizontal: spacing.md,
  },
  iconContainer: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.lg,
    backgroundColor: colors.primarySoft,
  },
  iconContainerCompact: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
  },
  action: {
    alignSelf: "stretch",
  },
  retry: {
    minHeight: touchTarget,
    minWidth: 140,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl2,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  retryPressed: {
    opacity: 0.85,
  },
});
