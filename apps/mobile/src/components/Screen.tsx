import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "@/src/theme";
import { Text } from "./Text";

type ScreenProps = {
  children: ReactNode;
  title?: string;
  eyebrow?: string;
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
  scroll = true,
  refreshing,
  onRefresh,
  keyboard = false,
  testID,
}: ScreenProps) {
  const body = (
    <>
      {eyebrow ? <Text variant="micro" testID={testID ? `${testID}-eyebrow` : undefined}>{eyebrow.toUpperCase()}</Text> : null}
      {title ? (
        <Text variant="hero" testID={testID ? `${testID}-title` : undefined}>
          {title}
        </Text>
      ) : null}
      <View style={styles.content}>{children}</View>
    </>
  );

  const scrollView = (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.padding}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing ?? false}
              onRefresh={onRefresh}
              tintColor={colors.orange}
              colors={[colors.orange]}
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
});