import { useState } from "react";
import { Link, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Input, Screen, Text } from "@/src/components";
import { BrandMark } from "@/src/components/BrandMark";
import { useSession } from "@/src/providers/SessionProvider";
import { ApiError } from "@/lib/api/client";
import { colors, fonts, radii, spacing } from "@/src/theme";

export default function RegisterScreen() {
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
      await signUp(name.trim(), email.trim(), password);
      router.replace("/(tabs)/parking");
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
          Register once, then add your plates — they are your gate pass.
        </Text>
      </View>
      {error ? (
        <View style={styles.alert}>
          <Ionicons name="alert-circle" size={18} color={colors.danger} />
          <Text variant="caption" color={colors.danger} style={styles.alertText} accessibilityRole="alert" testID="register-error">
            {error}
          </Text>
        </View>
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
        textContentType="emailAddress"
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
        textContentType="newPassword"
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
          <Text variant="caption" color={colors.primary} style={styles.linkText}>
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
  footer: {
    marginTop: spacing.md,
  },
  linkText: {
    fontFamily: fonts.bodyBold,
  },
});
