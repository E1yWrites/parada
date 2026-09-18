import { useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native";
import { Button, Card, FormAlert, Input, Screen } from "@/src/components";
import { ApiError } from "@/lib/api/client";
import { useSession } from "@/src/providers/SessionProvider";
import { spacing } from "@/src/theme";

/**
 * Authenticated password change. The server verifies the current password,
 * re-hashes, invalidates every other session and returns a fresh token that
 * SessionProvider swaps in — this device stays signed in.
 */
export default function ChangePasswordScreen() {
  const router = useRouter();
  const { changePassword } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const errors: typeof fieldErrors = {};
    if (current.length === 0) {
      errors.current = "Enter your current password.";
    }
    if (next.length < 8) {
      errors.next = "New password must be at least 8 characters.";
    } else if (next === current) {
      errors.next = "Choose a password you have not used before.";
    }
    if (confirm !== next) {
      errors.confirm = "Passwords do not match.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (!validate() || submitting) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await changePassword(current, next);
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't change your password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen back keyboard title="Change password" subtitle="Other devices are signed out afterwards" testID="password-screen">
      {done ? (
        <FormAlert tone="notice" message={"Your password was changed. You stay signed in here."} testID="password-done" />
      ) : null}
      {error ? (
        <FormAlert tone="error" message={error} testID="password-error" />
      ) : null}
      <Card style={styles.form}>
        <Input
          testID="password-current"
          label="Current password"
          value={current}
          onChangeText={setCurrent}
          placeholder="••••••••"
          secureTextEntry
          autoCapitalize="none"
          textContentType="password"
          autoComplete="password"
          error={fieldErrors.current}
        />
        <Input
          testID="password-new"
          label="New password"
          value={next}
          onChangeText={setNext}
          placeholder="At least 8 characters"
          secureTextEntry
          autoCapitalize="none"
          textContentType="password"
          autoComplete="new-password"
          error={fieldErrors.next}
        />
        <Input
          testID="password-confirm"
          label="Confirm new password"
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Repeat new password"
          secureTextEntry
          autoCapitalize="none"
          returnKeyType="go"
          onSubmit={() => void handleSubmit()}
          error={fieldErrors.confirm}
        />
        <Button
          testID="password-submit"
          title={submitting ? "Changing…" : "Change password"}
          loading={submitting}
          onPress={() => void handleSubmit()}
          accessibilityLabel="Change password"
        />
      </Card>
      {done ? (
        <Button variant="secondary" title="Back to account" onPress={() => router.back()} testID="password-back" />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
});
