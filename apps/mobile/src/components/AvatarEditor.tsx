import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Text } from "./Text";
import { api, ApiError, avatarUrl, type UserDto } from "@/lib/api/client";
import { AvatarPickError, pickAvatarImage, prepareAvatarUpload, type AvatarSource } from "@/lib/avatar";
import { queryKeys } from "@/lib/query";
import { useSession } from "@/src/providers/SessionProvider";
import { colors, spacing } from "@/src/theme";

type AvatarEditorProps = {
  user: UserDto;
  testID?: string;
};

/**
 * Profile-picture control: pick from the gallery or camera (square crop),
 * shrink + compress on device, upload to the API, or remove. The account
 * shown everywhere else updates from the server response — never from the
 * local file.
 */
export function AvatarEditor({ user, testID = "avatar-editor" }: AvatarEditorProps) {
  const { token, updateUser } = useSession();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"gallery" | "camera" | "remove" | null>(null);

  const upload = useMutation({
    mutationFn: async (source: AvatarSource) => {
      const picked = await pickAvatarImage(source);
      if (!picked) {
        return null;
      }
      const prepared = await prepareAvatarUpload(picked);
      return api.uploadAvatar(prepared.blob, prepared.contentType);
    },
  });
  const remove = useMutation({ mutationFn: () => api.removeAvatar() });

  function applyUser(next: UserDto) {
    updateUser(next);
    queryClient.setQueryData(queryKeys.account, next);
  }

  async function handlePick(source: AvatarSource) {
    if (busy) {
      return;
    }
    setBusy(source);
    setError(null);
    try {
      const next = await upload.mutateAsync(source);
      if (next) {
        applyUser(next);
      }
    } catch (err) {
      if (err instanceof AvatarPickError || err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("We couldn't update your photo. Please try again.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove() {
    if (busy) {
      return;
    }
    setBusy("remove");
    setError(null);
    try {
      applyUser(await remove.mutateAsync());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't remove your photo. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const hasPhoto = user.avatarUpdatedAt !== null;
  const cameraSupported = Platform.OS === "ios" || Platform.OS === "android";

  return (
    <View style={styles.block} testID={testID}>
      <View style={styles.row}>
        <Avatar name={user.name} uri={avatarUrl(user)} authToken={token} size={72} testID={`${testID}-avatar`} />
        <View style={styles.actions}>
          <Button
            variant="secondary"
            size="sm"
            title={busy === "gallery" ? "Uploading…" : hasPhoto ? "Change photo" : "Add photo"}
            loading={busy === "gallery"}
            disabled={busy !== null}
            onPress={() => void handlePick("gallery")}
            accessibilityLabel="Choose a profile photo from your library"
            testID={`${testID}-gallery`}
          />
          {cameraSupported ? (
            <Button
              variant="secondary"
              size="sm"
              title={busy === "camera" ? "Uploading…" : "Take photo"}
              loading={busy === "camera"}
              disabled={busy !== null}
              onPress={() => void handlePick("camera")}
              accessibilityLabel="Take a profile photo with the camera"
              testID={`${testID}-camera`}
            />
          ) : null}
          {hasPhoto ? (
            <Button
              variant="ghost"
              size="sm"
              title={busy === "remove" ? "Removing…" : "Remove photo"}
              loading={busy === "remove"}
              disabled={busy !== null}
              onPress={() => void handleRemove()}
              accessibilityLabel="Remove profile photo"
              testID={`${testID}-remove`}
            />
          ) : null}
        </View>
      </View>
      {error ? (
        <Text variant="caption" color={colors.danger} accessibilityRole="alert" testID={`${testID}-error`}>
          {error}
        </Text>
      ) : (
        <Text variant="caption" color={colors.muted}>
          Square photos work best. Photos are resized to 512 px before upload.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xl,
  },
  actions: {
    flex: 1,
    minWidth: 0,
    gap: spacing.sm,
  },
});
