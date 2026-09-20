import { useState } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Button, FormAlert, Input, Screen, Text } from "@/src/components";
import { BrandMark } from "@/src/components/BrandMark";
import { api, ApiError } from "@/lib/api/client";
import { spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";

const TOKEN_RE = /^[a-f0-9]{64}$/i;

/**
 * Forgot password, step 2. Opened from the emailed deep link
 * (`parada://reset-password?token=…`) or by pasting the code from the email.
 * The token is consumed server-side exactly once; success returns to Login.
 */
export default function ResetPasswordScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState(typeof params.token === "string" ? params.token : "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ token?: string; password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const next: typeof fieldErrors = {};
    if (!TOKEN_RE.test(token.trim())) {
      next.token = "Paste the full reset code from your email.";
    }
    if (password.length < 8) {
      next.password = "Password must be at least 8 characters.";
    }
    if (confirm !== password) {
      next.confirm = "Passwords do not match.";
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate() || submitting) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.resetPassword(token.trim().toLowerCase(), password);
      router.replace({ pathname: "/login", params: { notice: "reset" } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't reset your password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen keyboard back testID="reset-password-screen">
      <View style={styles.brand}>
        <BrandMark />
      </View>
      <View style={styles.heading}>
        <Text variant="hero">Choose a new password</Text>
        <Text variant="body" color={colors.muted}>
          The reset code works once and expires 30 minutes after it was sent.
        </Text>
      </View>
      {error ? (
        <FormAlert tone="error" message={error} testID="reset-password-error" />
      ) : null}
      <Input
        testID="reset-password-token"
        label="Reset code"
        value={token}
        onChangeText={(value) => {
          setToken(value);
          if (error) {
            setError(null);
          }
        }}
        placeholder="Paste the code from your email"
        variant="mono"
        autoCapitalize="none"
        autoCorrect={false}
        error={fieldErrors.token}
      />
      <Input
        testID="reset-password-new"
        label="New password"
        value={password}
        onChangeText={setPassword}
        placeholder="At least 8 characters"
        secureTextEntry
        autoCapitalize="none"
        textContentType="password"
        autoComplete="new-password"
        error={fieldErrors.password}
      />
      <Input
        testID="reset-password-confirm"
        label="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Repeat password"
        secureTextEntry
        autoCapitalize="none"
        returnKeyType="go"
        onSubmit={() => void handleSubmit()}
        error={fieldErrors.confirm}
      />
      <Button
        testID="reset-password-submit"
        title={submitting ? "Saving…" : "Set new password"}
        loading={submitting}
        onPress={() => void handleSubmit()}
        accessibilityLabel="Set new password"
      />
      <Text variant="caption" align="center" style={styles.footer}>
        Need a new code?{" "}
        <Link href="/forgot-password" testID="reset-password-goto-forgot">
          <Text variant="caption" color={colors.primaryDeep}>
            Request another
          </Text>
        </Link>
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { paddingTop: spacing.md },
  heading: { gap: spacing.md },
  footer: { marginTop: spacing.md },
});
