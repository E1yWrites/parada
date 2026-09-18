import { useEffect, useState } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Button, FormAlert, Input, Screen, Text } from "@/src/components";
import { BrandMark } from "@/src/components/BrandMark";
import { api, ApiError } from "@/lib/api/client";
import { colors, spacing } from "@/src/theme";

/** Seconds until `iso`; 0 when it is in the past or unparsable. */
function secondsUntil(iso: string | null, now = Date.now()): number {
  if (!iso) {
    return 0;
  }
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) {
    return 0;
  }
  return Math.max(0, Math.ceil((at - now) / 1000));
}

/**
 * Registration step 2: the 6-digit code mailed to the address. Reached from
 * Register, and from Login when the API answers EMAIL_NOT_VERIFIED — so a
 * user who closed the app never has to register again. Verification success
 * returns to Login (no token is issued here).
 */
export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = typeof params.email === "string" ? params.email : "";
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    setCooldown(secondsUntil(resendAvailableAt));
    if (!resendAvailableAt) {
      return;
    }
    const timer = setInterval(() => {
      const left = secondsUntil(resendAvailableAt);
      setCooldown(left);
      if (left === 0) {
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [resendAvailableAt]);

  const canSubmit = /^\d{6}$/.test(code.trim()) && email.length > 0 && !submitting;

  async function handleVerify() {
    if (!canSubmit) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.verifyEmail(email, code.trim());
      router.replace({ pathname: "/login", params: { email, notice: "verified" } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't verify that code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (resending || cooldown > 0 || !email) {
      return;
    }
    setResending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.resendVerification(email);
      setResendAvailableAt(result.verification?.resendAvailableAt ?? new Date(Date.now() + 60_000).toISOString());
      setNotice("If this address needs verification, a new code is on its way.");
    } catch (err) {
      if (err instanceof ApiError && err.code === "TOO_MANY_REQUESTS") {
        const details = err.details as { resendAvailableAt?: string } | undefined;
        setResendAvailableAt(details?.resendAvailableAt ?? new Date(Date.now() + 60_000).toISOString());
      }
      setError(err instanceof ApiError ? err.message : "We couldn't resend the code. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <Screen keyboard back testID="verify-email-screen">
      <View style={styles.brand}>
        <BrandMark />
      </View>
      <View style={styles.heading}>
        <Text variant="hero">Check your email</Text>
        <Text variant="body" color={colors.muted}>
          We sent a 6-digit code to{" "}
          <Text variant="bodySemi" testID="verify-email-address">
            {email || "your email address"}
          </Text>
          . Enter it below to activate your account.
        </Text>
      </View>
      {notice && !error ? (
        <FormAlert tone="notice" message={notice} icon="mail-outline" testID="verify-email-notice" />
      ) : null}
      {error ? (
        <FormAlert tone="error" message={error} testID="verify-email-error" />
      ) : null}
      <View style={styles.form}>
        <Input
          testID="verify-email-code"
          label="Verification code"
          value={code}
          onChangeText={(value) => {
            setCode(value.replace(/[^0-9]/g, "").slice(0, 6));
            if (error) {
              setError(null);
            }
          }}
          placeholder="123456"
          variant="mono"
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          returnKeyType="go"
          onSubmit={() => void handleVerify()}
          hint="Codes expire after 10 minutes."
        />
        <Button
          testID="verify-email-submit"
          title={submitting ? "Verifying…" : "Verify email"}
          loading={submitting}
          disabled={!canSubmit}
          onPress={() => void handleVerify()}
          accessibilityLabel="Verify email"
        />
        <Button
          testID="verify-email-resend"
          variant="secondary"
          title={resending ? "Sending…" : cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          loading={resending}
          disabled={cooldown > 0 || resending || !email}
          onPress={() => void handleResend()}
          accessibilityLabel="Resend verification code"
        />
      </View>
      <Text variant="caption" align="center" style={styles.footer}>
        Already verified?{" "}
        <Link href={{ pathname: "/login", params: { email } }} testID="verify-email-goto-login">
          <Text variant="caption" color={colors.primary}>
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
  form: {
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  footer: {
    marginTop: spacing.md,
  },
});
