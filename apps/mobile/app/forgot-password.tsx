import { useState } from "react";
import { Link, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Button, FormAlert, Input, Screen, Text } from "@/src/components";
import { BrandMark } from "@/src/components/BrandMark";
import { api, ApiError } from "@/lib/api/client";
import { spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";

/**
 * Forgot password, step 1. The API answers the same way whether or not the
 * address exists, so this screen never confirms an account either.
 */
export default function ForgotPasswordScreen() {
  const colors = useColors();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = /^\S+@\S+\.\S+$/.test(email.trim()) && !submitting;

  async function handleSubmit() {
    if (!canSubmit) {
      setError("Enter the email address you registered with.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't send the reset email. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen keyboard back testID="forgot-password-screen">
      <View style={styles.brand}>
        <BrandMark />
      </View>
      <View style={styles.heading}>
        <Text variant="hero">Reset your password</Text>
        <Text variant="body" color={colors.muted}>
          Enter your email and we'll send a reset link. It works once and expires in 30 minutes.
        </Text>
      </View>
      {sent ? (
        <FormAlert tone="notice" message={`If an account exists for ${email.trim()}, a reset link has been sent. Open it on this phone, or paste the code from the email on the next screen.`} icon="mail-outline" testID="forgot-password-sent" />
      ) : null}
      {error ? (
        <FormAlert tone="error" message={error} testID="forgot-password-error" />
      ) : null}
      <View style={styles.form}>
        <Input
          testID="forgot-password-email"
          label="Email"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            if (error) {
              setError(null);
            }
          }}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          returnKeyType="go"
          onSubmit={() => void handleSubmit()}
        />
        <Button
          testID="forgot-password-submit"
          title={submitting ? "Sending…" : sent ? "Send again" : "Send reset link"}
          loading={submitting}
          disabled={!canSubmit}
          onPress={() => void handleSubmit()}
          accessibilityLabel="Send password reset link"
        />
        {sent ? (
          <Button
            testID="forgot-password-have-code"
            variant="secondary"
            title="I have a reset code"
            onPress={() => router.push("/reset-password")}
            accessibilityLabel="Enter a reset code"
          />
        ) : null}
      </View>
      <Text variant="caption" align="center" style={styles.footer}>
        Remembered it?{" "}
        <Link href="/login" testID="forgot-password-goto-login">
          <Text variant="caption" color={colors.primaryDeep}>
            Back to sign in
          </Text>
        </Link>
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { paddingTop: spacing.md },
  heading: { gap: spacing.md },
  form: { gap: spacing.xl, marginTop: spacing.md },
  footer: { marginTop: spacing.md },
});
