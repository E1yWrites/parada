import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontSizes, radii, spacing, touchTarget } from "@/src/theme";
import { Text } from "./Text";

type InputProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  error?: string | null;
  editable?: boolean;
  variant?: "default" | "mono";
  onBlur?: () => void;
  onSubmit?: () => void;
  returnKeyType?: ReturnKeyTypeOptions;
  textContentType?: "none" | "emailAddress" | "name" | "password" | "newPassword";
  /** Multi-line text (e.g. an appeal reason). Renders a taller, top-aligned field. */
  multiline?: boolean;
  maxLength?: number;
  testID?: string;
};

export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType,
  autoCapitalize = "none",
  autoCorrect = false,
  error,
  editable = true,
  variant = "default",
  onBlur,
  onSubmit,
  returnKeyType,
  textContentType,
  multiline = false,
  maxLength,
  testID,
}: InputProps) {
  const [secure, setSecure] = useState(secureTextEntry);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.container} testID={testID ? `${testID}-wrap` : undefined}>
      <Text variant="micro">{label.toUpperCase()}</Text>
      <View style={[styles.control, multiline ? styles.controlMultiline : undefined, error ? styles.controlError : focused ? styles.controlFocused : undefined]}>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          secureTextEntry={secure}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          editable={editable}
          multiline={multiline}
          maxLength={maxLength}
          textAlignVertical={multiline ? "top" : "center"}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          onSubmitEditing={multiline ? undefined : onSubmit}
          returnKeyType={returnKeyType}
          textContentType={textContentType}
          selectionColor={colors.primary}
          accessibilityLabel={label}
          accessibilityState={{ disabled: !editable }}
          style={[styles.input, multiline ? styles.multilineInput : undefined, variant === "mono" ? styles.monoInput : undefined]}
        />
        {secureTextEntry ? (
          <View style={styles.eyeSlot}>
            <TestableEyeButton
              secure={secure}
              onToggle={() => setSecure((s) => !s)}
              testID={testID ? `${testID}-toggle` : undefined}
            />
          </View>
        ) : null}
      </View>
      {error ? (
        <Text
          testID={testID ? `${testID}-error` : undefined}
          variant="caption"
          color={colors.danger}
          accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function TestableEyeButton({ secure, onToggle, testID }: { secure: boolean; onToggle: () => void; testID?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={secure ? "Show password" : "Hide password"}
      onPress={onToggle}
      hitSlop={8}
      testID={testID}
      style={styles.eyeButton}>
      <Ionicons name={secure ? "eye-outline" : "eye-off-outline"} size={20} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  control: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: touchTarget,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.xl,
  },
  controlMultiline: {
    alignItems: "flex-start",
    minHeight: 96,
    paddingVertical: spacing.md,
  },
  controlError: {
    borderColor: colors.danger,
  },
  controlFocused: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  input: {
    flex: 1,
    minHeight: touchTarget,
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: fontSizes.body,
    paddingVertical: spacing.lg,
  },
  monoInput: {
    fontFamily: fonts.monoBold,
    fontSize: fontSizes.monoValue,
    letterSpacing: 1.5,
  },
  multilineInput: {
    minHeight: 80,
    paddingVertical: 0,
  },
  eyeSlot: {
    marginLeft: spacing.md,
  },
  eyeButton: {
    minWidth: 32,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});