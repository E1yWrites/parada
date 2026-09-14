import { useState } from "react";
import { Link, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Input, Screen, Text } from "@/src/components";
import { BrandMark } from "@/src/components/BrandMark";
import { useSession } from "@/src/providers/SessionProvider";
import { ApiError } from "@/lib/api/client";
import { colors, fonts, radii, spacing } from "@/src/theme";

export default function LoginScreen() {
  const { signIn } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
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
          Sign in to see live zone availability and your parking.
        </Text>
      </View>
      {error ? (
        <View style={styles.alert}>
          <Ionicons name="alert-circle" size={18} color={colors.danger} />
          <Text variant="caption" color={colors.danger} style={styles.alertText} accessibilityRole="alert" testID="login-error">
            {error}
          </Text>
        </View>
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
          New here?{" "}
          <Link href="/register" testID="login-goto-register">
            <Text variant="caption" color={colors.primary} style={styles.linkText}>
              Create an account
            </Text>
          </Link>
        </Text>
        <Text variant="caption" align="center">
          <Link href="/onboarding" testID="login-goto-onboarding">
            <Text variant="caption" color={colors.primary} style={styles.linkText}>
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
  alert: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  alertText: {
    flex: 1,
  },
  links: {
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  linkText: {
    fontFamily: fonts.bodyBold,
  },
});
