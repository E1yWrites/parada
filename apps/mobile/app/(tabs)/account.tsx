import { useMemo, useState, type ComponentProps } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Avatar, Button, Card, ErrorState, IconTile, LoadingState, Screen, Text } from "@/src/components";
import { api, ApiError, avatarUrl } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import { useSession } from "@/src/providers/SessionProvider";
import { radii, spacing, touchTarget } from "@/src/theme";
import { useColors, useThemeMode, type ThemeMode } from "@/src/providers/ThemeProvider";
import type { ColorTokens } from "@/src/theme/colors";

export default function AccountScreen() {
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const router = useRouter();
  const { user, token, signOut } = useSession();
  const account = useQuery({ queryKey: queryKeys.account, queryFn: api.me });
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
    <Screen title="Account" testID="account-screen">
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
                <Text variant="bodySemi" color={colors.primaryDeep} align="center">
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
            {/* Every driver account is a driver; only the exception is worth a label. */}
            {profile.role === "ADMIN" ? <RolePill /> : null}
          </Card>

          <AppearanceCard />

          <Card style={styles.linksCard} padding={0}>
            <AccountLink
              icon="car-sport-outline"
              label="My Vehicles"
              caption="Registered plates for gate entry"
              onPress={() => router.push("/vehicles")}
              testID="account-vehicles"
            />
            <View style={styles.linkDivider} />
            <AccountLink
              icon="wallet-outline"
              label="Payments & Fees"
              caption="Violation fines and session fees"
              onPress={() => router.push("/payments")}
              testID="account-payments"
            />
            <View style={styles.linkDivider} />
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
              icon="alert-circle-outline"
              label="Violations"
              caption="Wrong-zone entries, fines and appeals"
              onPress={() => router.push("/violations")}
              testID="account-violations"
            />
          </Card>

          <Card style={styles.infoCard} padding={0}>
            <InfoRow label="Phone" value={profile.phone ?? "Not set"} testID="account-phone" />
            <View style={styles.linkDivider} />
            <InfoRow label="App version" value={version} testID="account-version" />
          </Card>

          <View style={styles.signOut}>
            <Button
              testID="logout-button"
              title={signingOut ? "Signing out…" : "Sign out"}
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

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: ComponentProps<typeof Ionicons>["name"] }[] = [
  { value: "system", label: "System", icon: "phone-portrait-outline" },
  { value: "light", label: "Light", icon: "sunny-outline" },
  { value: "dark", label: "Dark", icon: "moon-outline" },
];

/** Appearance control: System / Light / Dark, persisted to SecureStore. */
function AppearanceCard() {
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const { mode, setMode } = useThemeMode();
  return (
    <Card style={styles.appearanceCard} testID="account-appearance">
      <Text variant="micro">APPEARANCE</Text>
      <View style={styles.appearanceRow} testID="account-appearance-options">
        {THEME_OPTIONS.map((option) => {
          const selected = option.value === mode;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, selected }}
              accessibilityLabel={`${option.label} appearance`}
              onPress={() => setMode(option.value)}
              style={[styles.appearanceOption, selected ? styles.appearanceOptionSelected : undefined]}
              testID={`account-appearance-${option.value}`}>
              <Ionicons name={option.icon} size={18} color={selected ? colors.onAccent : colors.muted} />
              <Text variant="caption" color={selected ? colors.onAccent : colors.muted}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

function RolePill() {
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  return (
    <View style={styles.pill} testID="account-role">
      <Text variant="micro" color={colors.primaryInk}>
        ADMIN
      </Text>
    </View>
  );
}

function AccountLink({
  icon,
  label,
  caption,
  onPress,
  testID,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  caption: string;
  onPress: () => void;
  testID?: string;
}) {
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
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
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

function InfoRow({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const colors = useColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
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

function buildStyles(colors: ColorTokens) {
  return StyleSheet.create({
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
      borderTopRightRadius: radii.cut,
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
      paddingVertical: spacing.md,
      flexShrink: 0,
    },
    appearanceCard: {
      gap: spacing.md,
    },
    appearanceRow: {
      flexDirection: "row",
      gap: spacing.md,
    },
    appearanceOption: {
      flex: 1,
      minHeight: touchTarget,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      borderRadius: radii.md,
      borderTopRightRadius: radii.cut,
      backgroundColor: colors.surfaceElevated,
      paddingVertical: spacing.md,
    },
    appearanceOptionSelected: {
      backgroundColor: colors.primary,
    },
    linksCard: {
      overflow: "hidden",
    },
    linkDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginLeft: spacing.xl2,
    },
    linkRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.lg,
      minHeight: touchTarget + 16,
      paddingHorizontal: spacing.xl2,
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
    infoCard: {
      overflow: "hidden",
    },
    infoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: spacing.xl,
      paddingHorizontal: spacing.xl2,
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
    signOut: {
      marginTop: spacing.xl,
      paddingTop: spacing.xl2,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
  });
}
