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
  testID,
}: InputProps) {
  const [secure, setSecure] = useState(secureTextEntry);
  return (
    <View style={styles.container} testID={testID ? `${testID}-wrap` : undefined}>
      <Text variant="micro">{label.toUpperCase()}</Text>
      <View style={[styles.control, error ? styles.controlError : undefined]}>
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
          onBlur={onBlur}
          onSubmitEditing={onSubmit}
          returnKeyType={returnKeyType}
          textContentType={textContentType}
          selectionColor={colors.orange}
          accessibilityLabel={label}
          accessibilityState={{ disabled: !editable }}
          style={[styles.input, variant === "mono" ? styles.monoInput : undefined]}
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
        <Text testID={testID ? `${testID}-error` : undefined} variant="caption" color={colors.danger}>
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
  controlError: {
    borderColor: colors.danger,
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