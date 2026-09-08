import { useState, type ComponentProps } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, ErrorState, LoadingState, Screen, Text } from "@/src/components";
import { api, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import { useSession } from "@/src/providers/SessionProvider";
import { colors, radii, spacing, touchTarget } from "@/src/theme";

export default function AccountScreen() {
  const router = useRouter();
  const { user, signOut } = useSession();
  const account = useQuery({ queryKey: queryKeys.account, queryFn: api.me });
  const notifications = useQuery({ queryKey: queryKeys.notifications, queryFn: api.notifications });
  const [signingOut, setSigningOut] = useState(false);

  const version = Constants.expoConfig?.version ?? "0.1.0";
  // Prefer the fresh /auth/me payload; when the refresh fails we still know who
  // the signed-in user is, so degrade to the cached identity (and keep Sign Out
  // reachable) instead of dropping the whole profile UI.
  const profile = account.data ?? user;

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
      ) : account.isError && !profile ? (
        <ErrorState
          message={account.error instanceof ApiError ? account.error.message : "Couldn't load your profile."}
          onRetry={() => void account.refetch()}
          testID="account-error"
        />
      ) : profile ? (
        <>
          {account.isError ? (
            <View style={styles.degraded} testID="account-cache-note">
              <Text variant="caption" color={colors.muted} style={styles.degradedText}>
                Couldn't refresh your profile. Showing your saved details.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry loading profile"
                onPress={() => void account.refetch()}
                hitSlop={10}
                style={styles.degradedRetry}
                testID="account-cache-retry">
                <Text variant="caption" color={colors.primary} align="center">
                  RETRY
                </Text>
              </Pressable>
            </View>
          ) : null}
          <Card style={styles.profileCard} testID="account-profile">
            <View style={styles.avatar} accessibilityLabel="Account avatar">
              <Ionicons name="person" size={22} color={colors.onAccent} />
            </View>
            <View style={styles.profileText}>
              <Text variant="title" testID="account-name">
                {profile.name}
              </Text>
              <Text variant="caption" color={colors.muted} testID="account-email">
                {profile.email}
              </Text>
            </View>
            <View style={styles.pillSlot}>
              <RolePill role={profile.role} />
            </View>
          </Card>
          <Card style={styles.linksCard} padding={0}>
            <AccountLink
              icon="notifications-outline"
              label="Notifications"
              badge={notifications.data?.unreadCount}
              onPress={() => router.push("/notifications")}
              testID="account-notifications"
            />
            <View style={styles.linkDivider} />
            <AccountLink
              icon="alert-circle-outline"
              label="Violations"
              onPress={() => router.push("/violations")}
              testID="account-violations"
            />
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
      ) : null}
    </Screen>
  );
}

function RolePill({ role }: { role: string }) {
  const label = role === "ADMIN" ? "ADMIN" : "DRIVER";
  return (
    <View style={styles.pill} testID="account-role">
      <Text variant="micro" color={colors.primary}>
        {label}
      </Text>
    </View>
  );
}

function AccountLink({
  icon,
  label,
  badge,
  onPress,
  testID,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  badge?: number;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} unread` : label}
      onPress={onPress}
      style={styles.linkRow}
      testID={testID}>
      <Ionicons name={icon} size={20} color={colors.foreground} />
      <Text variant="body" style={styles.linkLabel}>
        {label}
      </Text>
      {badge ? (
        <View style={styles.linkBadge} testID={testID ? `${testID}-badge` : undefined}>
          <Text variant="micro" color={colors.onAccent}>
            {badge > 9 ? "9+" : String(badge)}
          </Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
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
    flexWrap: "nowrap",
  },
  degraded: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xl,
  },
  degradedText: {
    flex: 1,
  },
  degradedRetry: {
    minHeight: touchTarget,
    minWidth: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  profileText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  pillSlot: {
    flexShrink: 0,
  },
  pill: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  linksCard: {
    overflow: "hidden",
  },
  linkDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.xl,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    minHeight: touchTarget,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  linkLabel: {
    flex: 1,
  },
  linkBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
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