import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, fontSizes, radii, spacing, touchTarget } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";
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
  /** Helper text shown under the field when there is no error. */
  hint?: string;
  editable?: boolean;
  variant?: "default" | "mono";
  onBlur?: () => void;
  onSubmit?: () => void;
  returnKeyType?: ReturnKeyTypeOptions;
  textContentType?: "none" | "emailAddress" | "name" | "password" | "newPassword" | "username" | "telephoneNumber" | "oneTimeCode";
  /** Platform autofill hint (Android/web); iOS uses `textContentType`. */
  autoComplete?: "off" | "email" | "name" | "password" | "new-password" | "username" | "tel" | "one-time-code";
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
  hint,
  editable = true,
  variant = "default",
  onBlur,
  onSubmit,
  returnKeyType,
  textContentType,
  autoComplete,
  multiline = false,
  maxLength,
  testID,
}: InputProps) {
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const [secure, setSecure] = useState(secureTextEntry);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.container} testID={testID ? `${testID}-wrap` : undefined}>
      <Text variant="micro" color={error ? colors.danger : focused ? colors.primaryDeep : colors.muted}>
        {label.toUpperCase()}
      </Text>
      <View
        style={[
          styles.control,
          multiline ? styles.controlMultiline : undefined,
          !editable ? styles.controlDisabled : undefined,
          error ? styles.controlError : focused ? styles.controlFocused : undefined,
        ]}>
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
          autoComplete={autoComplete}
          // Never shows the yellow "automatic strong password" overlay on
          // iOS for new-password fields (it covers the field and blocks
          // typing); autofill suggestions still work via textContentType.
          passwordRules={secureTextEntry ? "minlength: 8;" : undefined}
          selectionColor={colors.primary}
          cursorColor={colors.primary}
          accessibilityLabel={label}
          accessibilityState={{ disabled: !editable }}
          style={[
            styles.input,
            multiline ? styles.multilineInput : undefined,
            variant === "mono" ? styles.monoInput : undefined,
            !editable ? styles.inputDisabled : undefined,
          ]}
        />
        {secureTextEntry ? (
          <View style={styles.eyeSlot}>
            <TestableEyeButton
              secure={secure}
              onToggle={() => setSecure((s) => !s)}
              testID={testID ? `${testID}-toggle` : undefined}
              muted={colors.muted}
            />
          </View>
        ) : null}
      </View>
      {error ? (
        <View style={styles.messageRow}>
          <Ionicons name="alert-circle" size={14} color={colors.danger} />
          <Text
            testID={testID ? `${testID}-error` : undefined}
            variant="caption"
            color={colors.danger}
            accessibilityRole="alert"
            style={styles.message}>
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="caption" testID={testID ? `${testID}-hint` : undefined}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function TestableEyeButton({
  secure,
  onToggle,
  testID,
  muted,
}: {
  secure: boolean;
  onToggle: () => void;
  testID?: string;
  muted: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={secure ? "Show password" : "Hide password"}
      onPress={onToggle}
      hitSlop={8}
      testID={testID}
      style={styles.eyeButton}>
      <Ionicons name={secure ? "eye-outline" : "eye-off-outline"} size={20} color={muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  eyeButton: {
    minWidth: 32,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});

function buildStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: {
      gap: spacing.md,
    },
    control: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: touchTarget + 8,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radii.md,
      borderTopRightRadius: radii.cut,
      paddingHorizontal: spacing.xl,
    },
    controlMultiline: {
      alignItems: "flex-start",
      minHeight: 112,
      paddingVertical: spacing.md,
    },
    controlDisabled: {
      backgroundColor: colors.disabledSurface,
    },
    controlError: {
      borderColor: colors.danger,
    },
    // Focus is a border-color change only: a shadow/elevation toggle here
    // re-rasterised the control (and its neighbours on Android) on every
    // focus/blur, which read as a flicker while moving between fields.
    controlFocused: {
      borderColor: colors.primaryDeep,
    },
    input: {
      flex: 1,
      minHeight: touchTarget,
      color: colors.foreground,
      fontFamily: fonts.bodyMedium,
      fontSize: fontSizes.section,
      paddingVertical: spacing.lg,
    },
    inputDisabled: {
      color: colors.disabledForeground,
    },
    monoInput: {
      fontFamily: fonts.monoBold,
      fontSize: fontSizes.monoValue,
      letterSpacing: 1.5,
    },
    multilineInput: {
      minHeight: 96,
      paddingVertical: 0,
    },
    messageRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
    },
    message: {
      flex: 1,
    },
    eyeSlot: {
      marginLeft: spacing.md,
    },
  });
}
