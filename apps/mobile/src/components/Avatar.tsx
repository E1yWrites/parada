import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { colors, radii } from "@/src/theme";
import { Text } from "./Text";

/** Initials from a display name ("Alex Driver" → "AD"). */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

type AvatarProps = {
  name: string | null | undefined;
  /** Authenticated avatar URL (see `avatarUrl`); null renders initials. */
  uri?: string | null;
  /** Bearer token for the image request; the avatar endpoint is authenticated. */
  authToken?: string | null;
  size?: number;
  testID?: string;
};

/**
 * Profile picture when one is stored, otherwise the blue initials tile. A
 * failed image load falls back to initials rather than a broken frame.
 */
export function Avatar({ name, uri = null, authToken = null, size = 40, testID }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const radius = Math.round(size * 0.34);
  const showImage = uri !== null && !failed;
  return (
    <View
      testID={testID}
      accessibilityLabel={name ? `${name} account` : "Account"}
      style={[styles.tile, { width: size, height: size, borderRadius: radius }]}>
      {showImage ? (
        <Image
          testID={testID ? `${testID}-image` : undefined}
          accessibilityIgnoresInvertColors
          source={{ uri, headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined }}
          onError={() => setFailed(true)}
          style={{ width: size, height: size, borderRadius: radius }}
        />
      ) : (
        <Text variant={size >= 48 ? "title" : "bodySemi"} color={colors.onAccent} style={styles.text}>
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  text: {
    letterSpacing: 0.5,
  },
});
