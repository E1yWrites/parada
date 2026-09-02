import { useState } from "react";
import { Link, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Input, Screen, Text } from "@/src/components";
import { useSession } from "@/src/providers/SessionProvider";
import { ApiError } from "@/lib/api/client";
import { colors, spacing } from "@/src/theme";

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
    <Screen keyboard title="PARADA" eyebrow="Sign in to manage your parking" testID="login-screen">
      <View style={styles.brandRow}>
        <Ionicons name="car-sport" size={26} color={colors.orange} />
        <Text variant="micro" color={colors.muted}>
          REAL-TIME PARKING ACCESS
        </Text>
      </View>
      {error ? (
        <Text variant="caption" color={colors.danger} testID="login-error">
          {error}
        </Text>
      ) : null}
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
      <Text variant="caption" align="center" color={colors.muted}>
        New here?{" "}
        <Link href="/register" testID="login-goto-register">
          <Text variant="caption" color={colors.orange}>
            Create an account
          </Text>
        </Link>
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    justifyContent: "flex-start",
  },
});