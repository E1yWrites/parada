import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, ErrorState, LoadingState, Screen, Text } from "@/src/components";
import { api, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import { useSession } from "@/src/providers/SessionProvider";
import { colors, radii, spacing } from "@/src/theme";

export default function AccountScreen() {
  const { user, signOut } = useSession();
  const account = useQuery({ queryKey: queryKeys.account, queryFn: api.me });
  const [signingOut, setSigningOut] = useState(false);

  const version = Constants.expoConfig?.version ?? "0.1.0";

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <Screen title="Account" eyebrow="PARADA profile" testID="account-screen">
      {account.isPending ? (
        <LoadingState label="Loading your profile…" testID="account-loading" />
      ) : account.isError ? (
        <ErrorState
          message={account.error instanceof ApiError ? account.error.message : "Couldn't load your profile."}
          onRetry={() => void account.refetch()}
          testID="account-error"
        />
      ) : (
        <>
          <Card style={styles.profileCard} testID="account-profile">
            <View style={styles.avatar} accessibilityLabel="Account avatar">
              <Ionicons name="person" size={22} color={colors.onAccent} />
            </View>
            <View style={styles.profileText}>
              <Text variant="title" testID="account-name">
                {user?.name ?? account.data?.name ?? ""}
              </Text>
              <Text variant="caption" color={colors.muted} testID="account-email">
                {account.data?.email ?? ""}
              </Text>
            </View>
            <RolePill role={account.data?.role ?? "USER"} />
          </Card>
          <Card style={styles.infoCard}>
            <InfoRow label="Status" value="Active driver account" />
            <InfoRow label="App version" value={version} testID="account-version" />
            <InfoRow
              label="Data stays on your device"
              value="Session token stored in Secure Store"
              testID="account-security"
            />
          </Card>
          <Text variant="caption" color={colors.muted} style={styles.about}>
            PARADA lets you check zone capacity and track your parking sessions in real time. Camera gate
            signs in select zones accept your registered plates automatically.
          </Text>
          <Button
            testID="logout-button"
            title={signingOut ? "Signing out…" : "Sign Out"}
            variant="danger"
            loading={signingOut}
            icon={<Ionicons name="log-out-outline" size={18} color={colors.danger} />}
            onPress={() => void handleSignOut()}
            accessibilityLabel="Sign out"
          />
        </>
      )}
    </Screen>
  );
}

function RolePill({ role }: { role: string }) {
  const label = role === "ADMIN" ? "ADMIN" : "DRIVER";
  return (
    <View style={styles.pill} testID="account-role">
      <Text variant="micro" color={colors.orange}>
        {label}
      </Text>
    </View>
  );
}

function InfoRow({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text variant="caption">{label}</Text>
      <Text variant="mono" style={styles.infoValue} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xl,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  profileText: {
    flex: 1,
    gap: spacing.xs,
  },
  pill: {
    borderWidth: 1,
    borderColor: colors.orange,
    borderRadius: radii.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  infoCard: {
    gap: spacing.xl,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.xl,
  },
  infoValue: {
    textAlign: "right",
    flexShrink: 1,
  },
  about: {
    lineHeight: 18,
  },
});