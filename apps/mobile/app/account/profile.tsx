import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Input, Screen, Text } from "@/src/components";
import { AvatarEditor } from "@/src/components/AvatarEditor";
import { api, ApiError, type UserDto } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import { useSession } from "@/src/providers/SessionProvider";
import { colors, spacing } from "@/src/theme";

function messageOf(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * Account details. Name/username save directly; email and phone are two-step
 * (request → 6-digit code → confirm) and only the server's response updates
 * what the app shows. Every request is scoped to the signed-in user by the API.
 */
export default function EditProfileScreen() {
  const { user, updateUser } = useSession();
  const queryClient = useQueryClient();

  function apply(next: UserDto) {
    updateUser(next);
    queryClient.setQueryData(queryKeys.account, next);
    void queryClient.invalidateQueries({ queryKey: queryKeys.account });
  }

  if (!user) {
    return (
      <Screen back title="Edit profile" testID="profile-screen">
        <Text variant="body" color={colors.muted}>
          Sign in to edit your profile.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen back keyboard title="Edit profile" subtitle="Changes are saved to your PARADA account" testID="profile-screen">
      <Card style={styles.section} testID="profile-photo-section">
        <Text variant="section">Profile photo</Text>
        <AvatarEditor user={user} testID="profile-avatar-editor" />
      </Card>
      <NameSection user={user} onSaved={apply} />
      <EmailSection user={user} onSaved={apply} />
      <PhoneSection user={user} onSaved={apply} />
    </Screen>
  );
}

function NameSection({ user, onSaved }: { user: UserDto; onSaved: (next: UserDto) => void }) {
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      api.updateProfile({
        name: name.trim(),
        username: username.trim().length === 0 ? null : username.trim(),
      }),
    onSuccess: (next) => {
      onSaved(next);
      setSaved(true);
      setError(null);
    },
    onError: (err) => {
      setSaved(false);
      setError(messageOf(err, "We couldn't save your profile. Please try again."));
    },
  });

  const dirty = name.trim() !== user.name || (username.trim() || null) !== (user.username ?? null);

  return (
    <Card style={styles.section} testID="profile-name-section">
      <Text variant="section">Name & username</Text>
      <Input
        testID="profile-name"
        label="Name"
        value={name}
        onChangeText={(v) => {
          setName(v);
          setSaved(false);
        }}
        placeholder="Your name"
        autoCapitalize="words"
        textContentType="name"
      />
      <Input
        testID="profile-username"
        label="Username"
        value={username}
        onChangeText={(v) => {
          setUsername(v.toLowerCase());
          setSaved(false);
        }}
        placeholder="e.g. alex.d"
        autoCapitalize="none"
        autoCorrect={false}
        hint="3–30 characters: letters, numbers, dots, underscores, dashes. Leave empty for none."
        error={error}
      />
      {saved && !error ? (
        <Text variant="caption" color={colors.success} testID="profile-name-saved">
          Profile saved.
        </Text>
      ) : null}
      <Button
        testID="profile-name-save"
        title={save.isPending ? "Saving…" : "Save changes"}
        loading={save.isPending}
        disabled={!dirty || name.trim().length < 2}
        onPress={() => save.mutate()}
        accessibilityLabel="Save name and username"
      />
    </Card>
  );
}

function useCooldown(resendAvailableAt: string | null): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const compute = () => {
      if (!resendAvailableAt) return 0;
      return Math.max(0, Math.ceil((new Date(resendAvailableAt).getTime() - Date.now()) / 1000));
    };
    setLeft(compute());
    if (!resendAvailableAt) return;
    const timer = setInterval(() => {
      const next = compute();
      setLeft(next);
      if (next === 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendAvailableAt]);
  return left;
}

function EmailSection({ user, onSaved }: { user: UserDto; onSaved: (next: UserDto) => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<string | null>(null);
  const cooldown = useCooldown(resendAvailableAt);
  const pending = user.pendingEmail;

  const requestChange = useMutation({
    mutationFn: (next: string) => api.requestEmailChange(next),
    onSuccess: (result) => {
      setError(null);
      setResendAvailableAt(result.verification.resendAvailableAt);
      // The pending address is server state: refetch the account to show it.
      onSaved({ ...user, pendingEmail: email.trim().toLowerCase() });
    },
    onError: (err) => setError(messageOf(err, "We couldn't start the email change. Please try again.")),
  });
  const confirm = useMutation({
    mutationFn: (value: string) => api.confirmEmailChange(value),
    onSuccess: (next) => {
      setError(null);
      setCode("");
      setEmail("");
      onSaved(next);
    },
    onError: (err) => setError(messageOf(err, "We couldn't confirm that code. Please try again.")),
  });
  const cancel = useMutation({
    mutationFn: () => api.cancelEmailChange(),
    onSuccess: (next) => {
      setError(null);
      setCode("");
      onSaved(next);
    },
    onError: (err) => setError(messageOf(err, "We couldn't cancel the email change.")),
  });

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <Card style={styles.section} testID="profile-email-section">
      <Text variant="section">Email</Text>
      <Text variant="caption" color={colors.muted} testID="profile-email-current">
        Current: {user.email}
      </Text>
      {pending ? (
        <>
          <Text variant="body" testID="profile-email-pending">
            Enter the code we sent to {pending} to switch your sign-in email.
          </Text>
          <Input
            testID="profile-email-code"
            label="Verification code"
            value={code}
            onChangeText={(v) => setCode(v.replace(/[^0-9]/g, "").slice(0, 6))}
            placeholder="123456"
            variant="mono"
            keyboardType="number-pad"
            maxLength={6}
            error={error}
          />
          <Button
            testID="profile-email-confirm"
            title={confirm.isPending ? "Confirming…" : "Confirm new email"}
            loading={confirm.isPending}
            disabled={!/^\d{6}$/.test(code)}
            onPress={() => confirm.mutate(code)}
            accessibilityLabel="Confirm new email"
          />
          <View style={styles.inlineActions}>
            <Button
              testID="profile-email-resend"
              variant="secondary"
              size="sm"
              title={cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              disabled={cooldown > 0 || requestChange.isPending}
              loading={requestChange.isPending}
              onPress={() => {
                setEmail(pending);
                requestChange.mutate(pending);
              }}
              accessibilityLabel="Resend email verification code"
            />
            <Button
              testID="profile-email-cancel"
              variant="ghost"
              size="sm"
              title="Cancel change"
              disabled={cancel.isPending}
              onPress={() => cancel.mutate()}
              accessibilityLabel="Cancel email change"
            />
          </View>
        </>
      ) : (
        <>
          <Input
            testID="profile-email-new"
            label="New email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            hint="We'll send a 6-digit code to the new address. Your current email stays active until you confirm."
            error={error}
          />
          <Button
            testID="profile-email-request"
            title={requestChange.isPending ? "Sending code…" : "Send verification code"}
            loading={requestChange.isPending}
            disabled={!validEmail || email.trim().toLowerCase() === user.email}
            onPress={() => requestChange.mutate(email.trim())}
            accessibilityLabel="Send email verification code"
          />
        </>
      )}
    </Card>
  );
}

function PhoneSection({ user, onSaved }: { user: UserDto; onSaved: (next: UserDto) => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<string | null>(null);
  const cooldown = useCooldown(resendAvailableAt);
  const pending = user.pendingPhone;

  const requestChange = useMutation({
    mutationFn: (next: string) => api.requestPhoneChange(next),
    onSuccess: (result, next) => {
      setError(null);
      setResendAvailableAt(result.verification.resendAvailableAt);
      onSaved({ ...user, pendingPhone: next.replace(/[\s().-]/g, "") });
    },
    onError: (err) => setError(messageOf(err, "We couldn't start the phone change. Please try again.")),
  });
  const confirm = useMutation({
    mutationFn: (value: string) => api.confirmPhoneChange(value),
    onSuccess: (next) => {
      setError(null);
      setCode("");
      setPhone("");
      onSaved(next);
    },
    onError: (err) => setError(messageOf(err, "We couldn't confirm that code. Please try again.")),
  });
  const clear = useMutation({
    mutationFn: () => api.clearPhone(),
    onSuccess: (result) => {
      setError(null);
      onSaved(result.user);
    },
    onError: (err) => setError(messageOf(err, "We couldn't remove your phone number.")),
  });

  const validPhone = /^\+?[0-9]{7,15}$/.test(phone.replace(/[\s().-]/g, ""));

  return (
    <Card style={styles.section} testID="profile-phone-section">
      <Text variant="section">Phone number</Text>
      <Text variant="caption" color={colors.muted} testID="profile-phone-current">
        Current: {user.phone ?? "Not set"}
      </Text>
      {pending ? (
        <>
          <Text variant="body" testID="profile-phone-pending">
            Enter the code we emailed to {user.email} to confirm {pending}.
          </Text>
          <Input
            testID="profile-phone-code"
            label="Verification code"
            value={code}
            onChangeText={(v) => setCode(v.replace(/[^0-9]/g, "").slice(0, 6))}
            placeholder="123456"
            variant="mono"
            keyboardType="number-pad"
            maxLength={6}
            error={error}
          />
          <Button
            testID="profile-phone-confirm"
            title={confirm.isPending ? "Confirming…" : "Confirm phone number"}
            loading={confirm.isPending}
            disabled={!/^\d{6}$/.test(code)}
            onPress={() => confirm.mutate(code)}
            accessibilityLabel="Confirm phone number"
          />
          <View style={styles.inlineActions}>
            <Button
              testID="profile-phone-resend"
              variant="secondary"
              size="sm"
              title={cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              disabled={cooldown > 0 || requestChange.isPending}
              loading={requestChange.isPending}
              onPress={() => requestChange.mutate(pending)}
              accessibilityLabel="Resend phone verification code"
            />
            <Button
              testID="profile-phone-cancel"
              variant="ghost"
              size="sm"
              title="Cancel change"
              disabled={clear.isPending}
              onPress={() => clear.mutate()}
              accessibilityLabel="Cancel phone change"
            />
          </View>
        </>
      ) : (
        <>
          <Input
            testID="profile-phone-new"
            label="New phone number"
            value={phone}
            onChangeText={setPhone}
            placeholder="+63 917 123 4567"
            keyboardType="phone-pad"
            hint="A confirmation code is sent to your verified email address."
            error={error}
          />
          <Button
            testID="profile-phone-request"
            title={requestChange.isPending ? "Sending code…" : "Send confirmation code"}
            loading={requestChange.isPending}
            disabled={!validPhone}
            onPress={() => requestChange.mutate(phone.trim())}
            accessibilityLabel="Send phone confirmation code"
          />
          {user.phone ? (
            <Button
              testID="profile-phone-clear"
              variant="ghost"
              size="sm"
              title={clear.isPending ? "Removing…" : "Remove phone number"}
              loading={clear.isPending}
              onPress={() => clear.mutate()}
              accessibilityLabel="Remove phone number"
            />
          ) : null}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.lg,
  },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
});
