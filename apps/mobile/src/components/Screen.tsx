import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, spacing, tabClearance } from "@/src/theme";
import { Text } from "./Text";
import { GradientMesh } from "./GradientMesh";

type ScreenProps = {
  children: ReactNode;
  title?: string;
  eyebrow?: string;
  /** Renders a compact back-button header instead of the tab-root hero title.
   *  For screens pushed onto the stack (not a tab root). */
  back?: boolean;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  keyboard?: boolean;
  testID?: string;
};

/**
 * Standard app screen: safe area, optional refreshed scroll container,
 * optional page header. `keyboard` wraps content in a KeyboardAvoidingView
 * (used by auth forms).
 */
export function Screen({
  children,
  title,
  eyebrow,
  back = false,
  scroll = true,
  refreshing,
  onRefresh,
  keyboard = false,
  testID,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const body = (
    <>
      {back ? (
        <View style={styles.backRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            hitSlop={8}
            style={styles.backButton}
            testID={testID ? `${testID}-back` : undefined}>
            <Ionicons name="chevron-back" size={20} color={colors.foreground} />
          </Pressable>
          {title ? (
            <Text variant="section" testID={testID ? `${testID}-title` : undefined}>
              {title}
            </Text>
          ) : null}
        </View>
      ) : (
        <>
          {eyebrow ? <Text variant="micro" testID={testID ? `${testID}-eyebrow` : undefined}>{eyebrow.toUpperCase()}</Text> : null}
          {title ? (
            <Text variant="hero" testID={testID ? `${testID}-title` : undefined}>
              {title}
            </Text>
          ) : null}
        </>
      )}
      <View style={[styles.content, scroll ? undefined : styles.contentFill]}>{children}</View>
    </>
  );

  const scrollView = (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <GradientMesh testID={testID ? `${testID}-mesh` : undefined} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.padding, { paddingBottom: tabClearance(insets.bottom) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing ?? false}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          ) : undefined
        }>
        {body}
      </ScrollView>
    </SafeAreaView>
  );

  if (!scroll) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.safe, styles.padding]}>
        <GradientMesh testID={testID ? `${testID}-mesh` : undefined} />
        {body}
      </SafeAreaView>
    );
  }
  if (!keyboard) {
    return scrollView;
  }
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}>
      {scrollView}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  padding: {
    padding: spacing.xl3,
    gap: spacing.xl2,
  },
  content: {
    gap: spacing.xl,
  },
  contentFill: {
    flex: 1,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
});