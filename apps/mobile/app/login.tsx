import { useState } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Button, FormAlert, Input, Screen, Text } from "@/src/components";
import { BrandMark } from "@/src/components/BrandMark";
import { useSession } from "@/src/providers/SessionProvider";
import { ApiError } from "@/lib/api/client";
import { fonts, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";

export default function LoginScreen() {
  const colors = useColors();
  const { signIn } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; notice?: string }>();
  const notice =
    params.notice === "verified"
      ? "Your email is verified. Sign in to continue."
      : params.notice === "reset"
        ? "Your password was changed. Sign in with your new password."
        : null;
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) {
      setError("Enter your email and password.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/(tabs)/parking");
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") {
        // Correct credentials, unverified account: continue verification
        // instead of asking the user to register again.
        const details = err.details as { email?: string } | undefined;
        router.replace({
          pathname: "/verify-email",
          params: { email: details?.email ?? email.trim().toLowerCase() },
        });
        return;
      }
      setError(err instanceof ApiError ? err.message : "Unable to sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen keyboard testID="login-screen">
      <View style={styles.brand}>
        <BrandMark />
      </View>
      <View style={styles.heading}>
        <Text variant="hero">Welcome back</Text>
        <Text variant="body" color={colors.muted}>
          Sign in to find and reserve parking.
        </Text>
      </View>
      {notice && !error ? (
        <FormAlert tone="notice" message={notice} testID="login-notice" />
      ) : null}
      {error ? (
        <FormAlert tone="error" message={error} testID="login-error" />
      ) : null}
      <View style={styles.form}>
        <Input
          testID="login-email"
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          textContentType="emailAddress"
          autoComplete="email"
        />
        <Input
          testID="login-password"
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          autoCapitalize="none"
          returnKeyType="go"
          onSubmit={handleSubmit}
          textContentType="password"
          autoComplete="password"
        />
        <Button
          testID="login-submit"
          title={submitting ? "Signing in…" : "Sign In"}
          loading={submitting}
          onPress={() => void handleSubmit()}
          accessibilityLabel="Sign in"
        />
      </View>
      <View style={styles.links}>
        <Text variant="caption" align="center">
          <Link href="/forgot-password" testID="login-goto-forgot">
            <Text variant="caption" color={colors.primaryDeep} style={styles.linkText}>
              Forgot your password?
            </Text>
          </Link>
        </Text>
        <Text variant="caption" align="center">
          New here?{" "}
          <Link href="/register" testID="login-goto-register">
            <Text variant="caption" color={colors.primaryDeep} style={styles.linkText}>
              Create an account
            </Text>
          </Link>
        </Text>
        <Text variant="caption" align="center">
          <Link href="/onboarding" testID="login-goto-onboarding">
            <Text variant="caption" color={colors.primaryDeep} style={styles.linkText}>
              How PARADA works
            </Text>
          </Link>
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: {
    paddingTop: spacing.xl2,
  },
  heading: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  form: {
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  links: {
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  linkText: {
    fontFamily: fonts.bodyBold,
  },
});
