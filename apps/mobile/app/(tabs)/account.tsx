import { useState, type ComponentProps } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Avatar, Button, Card, ErrorState, IconTile, LoadingState, Screen, Text } from "@/src/components";
import { api, ApiError, avatarUrl } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import { useSession } from "@/src/providers/SessionProvider";
import { colors, radii, spacing, touchTarget } from "@/src/theme";

export default function AccountScreen() {
  const router = useRouter();
  const { user, token, signOut } = useSession();
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
    <Screen title="Account" subtitle="Your profile, alerts and app details" testID="account-screen">
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
              <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
              <Text variant="caption" color={colors.warning} style={styles.degradedText}>
                Couldn't refresh your profile. Showing your saved details.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry loading profile"
                onPress={() => void account.refetch()}
                hitSlop={10}
                style={styles.degradedRetry}
                testID="account-cache-retry">
                <Text variant="bodySemi" color={colors.primary} align="center">
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : null}

          <Card style={styles.profileCard} testID="account-profile">
            <Avatar name={profile.name} uri={avatarUrl(profile)} authToken={token} size={52} testID="account-avatar" />
            <View style={styles.profileText}>
              <Text variant="title" numberOfLines={2} testID="account-name">
                {profile.name}
              </Text>
              <Text variant="caption" numberOfLines={1} testID="account-email">
                {profile.email}
              </Text>
              {profile.username ? (
                <Text variant="caption" numberOfLines={1} testID="account-username">
                  @{profile.username}
                </Text>
              ) : null}
            </View>
            <RolePill role={profile.role} />
          </Card>

          <Card style={styles.linksCard} padding={0}>
            <AccountLink
              icon="person-circle-outline"
              label="Edit profile"
              caption="Photo, name, username, email and phone"
              onPress={() => router.push("/account/profile")}
              testID="account-edit-profile"
            />
            <View style={styles.linkDivider} />
            <AccountLink
              icon="key-outline"
              label="Change password"
              caption="Signs out your other devices"
              onPress={() => router.push("/account/password")}
              testID="account-change-password"
            />
            <View style={styles.linkDivider} />
            <AccountLink
              icon="notifications-outline"
              label="Notifications"
              caption="Zone alerts, reservations, violations"
              badge={notifications.data?.unreadCount}
              onPress={() => router.push("/notifications")}
              testID="account-notifications"
            />
            <View style={styles.linkDivider} />
            <AccountLink
              icon="alert-circle-outline"
              label="Violations"
              caption="Wrong-zone entries, fines and appeals"
              onPress={() => router.push("/violations")}
              testID="account-violations"
            />
          </Card>

          <Card style={styles.infoCard} padding={0}>
            <InfoRow label="Status" value="Active driver account" />
            <View style={styles.linkDivider} />
            <InfoRow label="Phone" value={profile.phone ?? "Not set"} testID="account-phone" />
            <View style={styles.linkDivider} />
            <InfoRow label="App version" value={version} testID="account-version" />
            <View style={styles.linkDivider} />
            <InfoRow label="Sign-in" value="Kept securely on this device" testID="account-security" />
          </Card>

          <Text variant="caption" style={styles.about}>
            PARADA lets you check zone capacity and track your parking sessions in real time. Camera gate
            signs in select zones accept your registered plates automatically.
          </Text>

          <View style={styles.signOut}>
            <Button
              testID="logout-button"
              title={signingOut ? "Signing out…" : "Sign Out"}
              variant="danger"
              loading={signingOut}
              icon={<Ionicons name="log-out-outline" size={18} color={colors.danger} />}
              onPress={() => void handleSignOut()}
              accessibilityLabel="Sign out"
            />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function RolePill({ role }: { role: string }) {
  const label = role === "ADMIN" ? "ADMIN" : "DRIVER";
  return (
    <View style={styles.pill} testID="account-role">
      <Text variant="micro" color={colors.primaryDeep}>
        {label}
      </Text>
    </View>
  );
}

function AccountLink({
  icon,
  label,
  caption,
  badge,
  onPress,
  testID,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  caption: string;
  badge?: number;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} unread` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.linkRow, pressed ? styles.linkPressed : undefined]}
      testID={testID}>
      <IconTile icon={icon} size={40} />
      <View style={styles.linkText}>
        <Text variant="bodySemi">{label}</Text>
        <Text variant="caption" numberOfLines={1}>
          {caption}
        </Text>
      </View>
      {badge ? (
        <View style={styles.linkBadge} testID={testID ? `${testID}-badge` : undefined}>
          <Text variant="micro" color={colors.onAccent} style={styles.linkBadgeText}>
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
      <Text variant="caption" style={styles.infoLabel}>
        {label}
      </Text>
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
    gap: spacing.lg,
    flexWrap: "nowrap",
  },
  degraded: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.warningSoft,
    borderRadius: radii.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
  },
  degradedText: {
    flex: 1,
  },
  degradedRetry: {
    minHeight: touchTarget,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  profileText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  pill: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexShrink: 0,
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
    minHeight: touchTarget + 16,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  linkPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  linkText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  linkBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: radii.full,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm + 2,
  },
  linkBadgeText: {
    letterSpacing: 0,
  },
  infoCard: {
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    minHeight: touchTarget,
  },
  infoLabel: {
    flexShrink: 1,
  },
  infoValue: {
    textAlign: "right",
    flexShrink: 1,
    color: colors.foreground,
  },
  about: {
    paddingHorizontal: spacing.sm,
  },
  signOut: {
    marginTop: spacing.xl,
    paddingTop: spacing.xl2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
