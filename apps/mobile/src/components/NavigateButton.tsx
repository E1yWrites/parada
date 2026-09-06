import { useCallback, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { Button } from "./Button";
import { Text } from "./Text";
import { getCurrentLocation, LocationError, requestLocationPermission } from "@/lib/location";
import { NavigationUnavailableError, openNavigation, type NavigationDestination } from "@/lib/navigation";
import { colors, spacing } from "@/src/theme";

type NavigateButtonProps = {
  /** Destination from application data; null when the backend hasn't one. */
  destination: NavigationDestination | null;
  /** Meaningful, screen-reader-friendly action name (e.g. "Navigate to assigned zone"). */
  label: string;
  testID?: string;
};

type NavigateState =
  | { kind: "idle" }
  | { kind: "getting" }
  | { kind: "denied"; canAskAgain: boolean }
  | { kind: "unavailable"; message: string }
  | { kind: "open-failed" };

/**
 * GPS navigation launcher (Phase 9.5). Pressing the button requests location
 * permission once, reads the device's current position and opens the platform's
 * navigation app to the destination. Outgoing state mirrors the friendly
 * message set from the phase spec. Never loops on denied permission.
 */
export function NavigateButton({ destination, label, testID }: NavigateButtonProps) {
  const [state, setState] = useState<NavigateState>({ kind: "idle" });
  const busyRef = useRef(false);

  const canNavigate = destination !== null;

  const handlePress = useCallback(() => {
    if (!destination || busyRef.current) {
      return;
    }
    busyRef.current = true;
    setState({ kind: "getting" });

    void (async () => {
      try {
        const permission = await requestLocationPermission();
        if (!permission.granted) {
          // The OS only prompts when it lets us; canAskAgain=false is permanent.
          setState({ kind: "denied", canAskAgain: permission.canAskAgain });
          return;
        }
        const current = await getCurrentLocation();
        await openNavigation(current, destination);
        setState({ kind: "idle" });
      } catch (err) {
        if (err instanceof LocationError) {
          if (err.kind === "denied") {
            setState({ kind: "denied", canAskAgain: false });
          } else {
            setState({ kind: "unavailable", message: err.message });
          }
        } else if (err instanceof NavigationUnavailableError) {
          setState({ kind: "open-failed" });
        } else {
          setState({ kind: "unavailable", message: "We couldn't determine your location." });
        }
      } finally {
        busyRef.current = false;
      }
    })();
  }, [destination]);

  const handleOpenSettings = useCallback(() => {
    void Linking.openSettings().catch(() => {
      // Settings could not be opened; keep the denied state without raw errors.
    });
  }, []);

  const busy = state.kind === "getting";

  return (
    <View style={styles.block} testID={testID ? `${testID}-block` : undefined}>
      <Button
        variant="secondary"
        title={busy ? "Getting your location…" : label}
        accessibilityLabel={label}
        loading={busy}
        disabled={!canNavigate || busy}
        onPress={handlePress}
        testID={testID ?? "navigate-button"}
      />

      {state.kind === "denied" ? (
        <View style={styles.status} testID={`${testID ?? "navigate"}-denied`}>
          <Text variant="caption" color={colors.danger} testID={`${testID ?? "navigate"}-denied-message`}>
            Location permission is required for navigation.
          </Text>
          {state.canAskAgain ? null : (
            <Button
              variant="ghost"
              title="Open settings"
              onPress={handleOpenSettings}
              accessibilityLabel="Open Settings to enable location access."
              testID={`${testID ?? "navigate"}-open-settings`}
            />
          )}
        </View>
      ) : state.kind === "unavailable" ? (
        <Text variant="caption" color={colors.danger} testID={`${testID ?? "navigate"}-unavailable`}>
          {state.message}
        </Text>
      ) : state.kind === "open-failed" ? (
        <Text variant="caption" color={colors.danger} testID={`${testID ?? "navigate"}-open-failed`}>
          Unable to open navigation. Please try again.
        </Text>
      ) : !canNavigate ? (
        <Text variant="caption" color={colors.muted} testID={`${testID ?? "navigate"}-unavailable`}>
          Navigation isn't available right now.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
  },
  status: {
    gap: spacing.sm,
  },
});