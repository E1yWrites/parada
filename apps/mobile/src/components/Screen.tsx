import type { ReactNode } from "react";
import { Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, tabClearance } from "@/src/theme";
import { Text } from "./Text";
import { GradientMesh } from "./GradientMesh";
import { IconButton } from "./IconButton";

type ScreenProps = {
  children: ReactNode;
  title?: string;
  /** One-line description under the title (never a label above it). */
  subtitle?: string;
  /** Renders a compact back-button header instead of the tab-root large title.
   *  For screens pushed onto the stack (not a tab root). */
  back?: boolean;
  /** Leading header slot on tab roots (e.g. the account avatar). */
  leading?: ReactNode;
  /** Header action slot (e.g. the notifications bell). */
  right?: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  keyboard?: boolean;
  testID?: string;
};

/**
 * Standard app screen: safe area, optional refreshable scroll container,
 * optional page header. `keyboard` (auth/profile forms) lets the scroll view
 * absorb the software keyboard through its content insets — the safe area,
 * header and ambient background never resize while typing.
 */
export function Screen({
  children,
  title,
  subtitle,
  back = false,
  leading,
  right,
  scroll = true,
  refreshing,
  onRefresh,
  keyboard = false,
  testID,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const header =
    back || title ? (
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {back ? (
            <IconButton
              icon="chevron-back"
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              testID={testID ? `${testID}-back` : undefined}
            />
          ) : leading ? (
            <View style={styles.headerRight}>{leading}</View>
          ) : null}
          <View style={styles.headerText}>
            {title ? (
              <Text
                variant={back ? "section" : "hero"}
                numberOfLines={back ? 1 : 2}
                testID={testID ? `${testID}-title` : undefined}>
                {title}
              </Text>
            ) : null}
            {subtitle && !back ? (
              <Text variant="caption" testID={testID ? `${testID}-subtitle` : undefined}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {right ? <View style={styles.headerRight}>{right}</View> : null}
        </View>
        {subtitle && back ? <Text variant="caption">{subtitle}</Text> : null}
      </View>
    ) : null;

  const body = (
    <>
      {header}
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
        keyboardShouldPersistTaps="handled"
        // Keyboard handling for forms: on iOS the scroll view adjusts its own
        // content inset so only the content scrolls; the safe area, ambient
        // background and header never resize. (A KeyboardAvoidingView with
        // `padding` shrank the whole screen on every keyboard-height change —
        // the QuickType / password bar toggles while typing — which made the
        // auth forms jump on each keystroke.) Android uses the window's
        // adjustResize, so nothing extra is needed here.
        automaticallyAdjustKeyboardInsets={keyboard && Platform.OS === "ios"}
        keyboardDismissMode={keyboard ? "interactive" : "none"}
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
      <SafeAreaView
        edges={["top"]}
        style={[styles.safe, styles.padding, { paddingBottom: tabClearance(insets.bottom) }]}>
        <GradientMesh testID={testID ? `${testID}-mesh` : undefined} />
        {body}
      </SafeAreaView>
    );
  }
  return scrollView;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  padding: {
    paddingHorizontal: spacing.xl2,
    paddingTop: spacing.xl,
    gap: spacing.xl2,
  },
  header: {
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    minHeight: 44,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  headerRight: {
    flexShrink: 0,
  },
  content: {
    gap: spacing.xl,
  },
  contentFill: {
    flex: 1,
  },
});
