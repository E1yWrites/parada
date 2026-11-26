import { type ComponentRef, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, TextInput, View } from "react-native";
import { fonts, radii, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import { usePrefersReducedMotion } from "@/src/hooks/usePrefersReducedMotion";
import { Text } from "./Text";

type CodeInputProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onSubmit?: () => void;
  /** True while the last attempt was rejected: boxes turn red and shake once. */
  invalid?: boolean;
  hint?: string;
  length?: number;
  testID?: string;
};

/**
 * One-time-code entry drawn as separate boxes. A single real TextInput sits
 * over the boxes (so paste, autofill and screen readers behave as one field);
 * the boxes only mirror its value.
 */
export function CodeInput({ label, value, onChangeText, onSubmit, invalid = false, hint, length = 6, testID }: CodeInputProps) {
  const colors = useColors();
  const reducedMotion = usePrefersReducedMotion();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [shake] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!invalid || reducedMotion) return;
    shake.setValue(0);
    Animated.sequence(
      [1, -1, 1, -1, 0].map((to) => Animated.timing(shake, { toValue: to, duration: 70, useNativeDriver: true })),
    ).start();
  }, [invalid, reducedMotion, shake]);

  const digits = Array.from({ length }, (_, i) => value[i] ?? "");
  return (
    <View style={styles.block}>
      <Text variant="caption">{label}</Text>
      <Pressable onPress={() => input.current?.focus()} accessible={false}>
        <Animated.View style={[styles.row, { transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }) }] }]}>
          {digits.map((d, i) => {
            const current = i === Math.min(value.length, length - 1);
            return (
              <View
                key={i}
                style={[
                  styles.box,
                  {
                    backgroundColor: colors.surface,
                    borderColor: invalid ? colors.danger : current ? colors.primaryDeep : colors.borderStrong,
                  },
                ]}>
                <Text variant="title" style={{ fontFamily: fonts.bodyBold }}>
                  {d}
                </Text>
              </View>
            );
          })}
          <TextInput
            ref={input}
            testID={testID}
            value={value}
            onChangeText={onChangeText}
            onSubmitEditing={onSubmit}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={length}
            returnKeyType="go"
            accessibilityLabel={label}
            caretHidden
            style={styles.hidden}
          />
        </Animated.View>
      </Pressable>
      {hint ? <Text variant="caption">{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm },
  box: { flex: 1, height: 58, borderRadius: radii.md, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  hidden: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, color: "transparent" },
});
