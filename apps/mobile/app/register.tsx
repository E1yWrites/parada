import { useState } from "react";
import { Link, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Button, FormAlert, Input, Screen, Text } from "@/src/components";
import { BrandMark } from "@/src/components/BrandMark";
import { useSession } from "@/src/providers/SessionProvider";
import { ApiError } from "@/lib/api/client";
import { fonts, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";

export default function RegisterScreen() {
  const colors = useColors();
  const { signUp } = useSession();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const next: typeof fieldErrors = {};
    if (name.trim().length < 2) {
      next.name = "Enter your name.";
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      next.email = "Enter a valid email address.";
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
      const result = await signUp(name.trim(), email.trim(), password);
      // No session yet: the 6-digit code mailed to this address must be
      // confirmed before sign-in is possible.
      router.replace({ pathname: "/verify-email", params: { email: result.user.email } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create your account. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const resetAuthError = () => {
    if (error) {
      setError(null);
    }
  };

  return (
    <Screen keyboard back testID="register-screen">
      <View style={styles.brand}>
        <BrandMark />
      </View>
      <View style={styles.heading}>
        <Text variant="hero">Create your account</Text>
        <Text variant="body" color={colors.muted}>
          Register once, then add your plates so gate cameras recognize you.
        </Text>
      </View>
      {error ? (
        <FormAlert tone="error" message={error} testID="register-error" />
      ) : null}
      <Input
        testID="register-name"
        label="Name"
        value={name}
        onChangeText={(v) => {
          setName(v);
          resetAuthError();
        }}
        placeholder="Your name"
        autoCapitalize="words"
        textContentType="name"
        error={fieldErrors.name}
      />
      <Input
        testID="register-email"
        label="Email"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          resetAuthError();
        }}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="emailAddress"
        autoComplete="email"
        error={fieldErrors.email}
      />
      <Input
        testID="register-password"
        label="Password"
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          resetAuthError();
        }}
        placeholder="At least 8 characters"
        secureTextEntry
        autoCapitalize="none"
        textContentType="password"
        autoComplete="new-password"
        error={fieldErrors.password}
      />
      <Input
        testID="register-confirm"
        label="Confirm password"
        value={confirm}
        onChangeText={(v) => {
          setConfirm(v);
          resetAuthError();
        }}
        placeholder="Repeat password"
        secureTextEntry
        autoCapitalize="none"
        textContentType="password"
        autoComplete="new-password"
        returnKeyType="go"
        onSubmit={() => void handleSubmit()}
        error={fieldErrors.confirm}
      />
      <Button
        testID="register-submit"
        title={submitting ? "Creating account…" : "Create Account"}
        loading={submitting}
        onPress={() => void handleSubmit()}
        accessibilityLabel="Create account"
      />
      <Text variant="caption" align="center" style={styles.footer}>
        Already have an account?{" "}
        <Link href="/login" testID="register-goto-login">
          <Text variant="caption" color={colors.primaryDeep} style={styles.linkText}>
            Sign in
          </Text>
        </Link>
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: {
    paddingTop: spacing.md,
  },
  heading: {
    gap: spacing.md,
  },
  footer: {
    marginTop: spacing.md,
  },
  linkText: {
    fontFamily: fonts.bodyBold,
  },
});
