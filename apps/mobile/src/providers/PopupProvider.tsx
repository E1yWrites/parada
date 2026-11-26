import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import type { NotificationCreatedPayload, NotificationType, ParkingSessionResponse, ZoneAssignmentResponse } from "@parada/types";
import { subscribeRealtimeEvents } from "@/src/lib/realtime";
import { activeAssignmentFrom } from "@/lib/assignment";
import { queryKeys } from "@/lib/query";
import { formatClockTime, formatCurrency, formatDurationSeconds } from "@/lib/format";
import { radii, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import { usePrefersReducedMotion } from "@/src/hooks/usePrefersReducedMotion";
import { GlassCard } from "@/src/components/GlassCard";
import { Button } from "@/src/components/Button";
import { Lottie } from "@/src/components/Lottie";
import { PlateChip } from "@/src/components/PlateChip";
import { Text } from "@/src/components/Text";

/** How long the banner and the toast stay before hiding themselves. */
export const BANNER_MS = 6000;
export const TOAST_MS = 3500;
/**
 * Events older than this never pop. Replays only follow a brief reconnect, so
 * they are normally fresh; the margin absorbs device clock drift.
 */
export const STALE_MS = 10 * 60 * 1000;

/** Notification types whose banner the session-ended sheet already covers. */
const SHEET_COVERED: readonly NotificationType[] = ["SESSION_COMPLETED"];

const BANNER_TITLE: Partial<Record<NotificationType, string>> = {
  WRONG_ZONE_WARNING: "Wrong zone",
  VIOLATION_ISSUED: "Violation issued",
  VIOLATION_APPEAL_RESULT: "Appeal decided",
  RESERVATION_EXPIRING: "Reservation expiring",
  ZONE_FULL: "Zone full",
  ZONE_LOW_AVAILABILITY: "Zone filling up",
};

type Toast = { title: string; body?: string };
type Sheet = {
  kind: "parked" | "ended";
  session: ParkingSessionResponse;
  /** Parked somewhere other than the active assignment: that zone, else null. */
  assignedElsewhere?: ZoneAssignmentResponse["zone"] | null;
};

type PopupContextValue = {
  /** Confirms the user's own action ("Reservation cancelled", "Vehicle added"). */
  showToast: (toast: Toast) => void;
};

const PopupContext = createContext<PopupContextValue>({ showToast: () => undefined });

export function usePopups(): PopupContextValue {
  return useContext(PopupContext);
}

/** Slides a value 0 → 1 with a spring (or jumps there under Reduce Motion). */
function useEntrance(visible: boolean, reducedMotion: boolean) {
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reducedMotion) {
      value.setValue(visible ? 1 : 0);
      return;
    }
    Animated.spring(value, { toValue: visible ? 1 : 0, friction: 8, tension: 90, useNativeDriver: true }).start();
  }, [reducedMotion, value, visible]);
  return value;
}

/**
 * In-app pop-ups driven by the realtime stream (the app has no OS push):
 * a top banner for new notifications, a sheet when a parking session starts
 * or ends, and a toast that confirms the user's own actions.
 */
export function PopupProvider({ children }: { children: ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<NotificationCreatedPayload | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(
    () =>
      subscribeRealtimeEvents((event) => {
        if (Date.now() - new Date(event.occurredAt).getTime() > STALE_MS) return;
        if (event.type === "NOTIFICATION_CREATED") {
          if (event.payload.targetRole === "USER" && !SHEET_COVERED.includes(event.payload.type)) {
            setBanner(event.payload);
          }
        } else if (event.type === "PARKING_SESSION_STARTED") {
          // Read the assignment already in the cache at the moment of entry (no
          // extra fetch); the backend's wrong-zone notice still arrives as a banner.
          const assigned = activeAssignmentFrom(queryClient.getQueryData<ZoneAssignmentResponse[]>(queryKeys.assignments));
          setSheet({
            kind: "parked",
            session: event.payload,
            assignedElsewhere: assigned && assigned.zone.id !== event.payload.zone.id ? assigned.zone : null,
          });
        } else if (event.type === "PARKING_SESSION_COMPLETED") {
          setSheet({ kind: "ended", session: event.payload });
        }
      }),
    [queryClient],
  );

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const showToast = useCallback((next: Toast) => setToast(next), []);
  const value = useMemo(() => ({ showToast }), [showToast]);

  const bannerIn = useEntrance(banner != null, reducedMotion);
  const toastIn = useEntrance(toast != null, reducedMotion);
  const sheetIn = useEntrance(sheet != null, reducedMotion);

  return (
    <PopupContext.Provider value={value}>
      {children}

      {banner ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.banner,
            { top: insets.top + spacing.sm },
            { opacity: bannerIn, transform: [{ translateY: bannerIn.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }, { scale: bannerIn.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] },
          ]}>
          <Pressable
            testID="popup-banner"
            accessibilityRole="alert"
            accessibilityLabel={`${BANNER_TITLE[banner.type] ?? "Notification"}. ${banner.message}`}
            accessibilityHint="Opens your notifications"
            onPress={() => {
              setBanner(null);
              router.push("/notifications");
            }}>
            <GlassCard padding={spacing.lg}>
              <View style={styles.row}>
                <View style={[styles.icon, { backgroundColor: colors.warningSoft }]}>
                  <Ionicons name="notifications" size={18} color={colors.warningInk} />
                </View>
                <View style={styles.flex}>
                  <Text variant="bodySemi">{BANNER_TITLE[banner.type] ?? "Notification"}</Text>
                  <Text variant="caption" numberOfLines={3}>
                    {banner.message}
                  </Text>
                </View>
              </View>
            </GlassCard>
          </Pressable>
        </Animated.View>
      ) : null}

      {toast ? (
        <Animated.View
          testID="popup-toast"
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            // Top, like the banner: a toast never covers the action buttons a sheet
            // or form keeps at the bottom (the tutorial has no tab bar to clear).
            { top: insets.top + spacing.sm },
            { opacity: toastIn, transform: [{ translateY: toastIn.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }] },
          ]}>
          <GlassCard padding={spacing.lg}>
            <View style={styles.row}>
              <Ionicons name="checkmark-circle" size={28} color={colors.success} />
              <View style={styles.flex}>
                <Text variant="bodySemi">{toast.title}</Text>
                {toast.body ? <Text variant="caption">{toast.body}</Text> : null}
              </View>
            </View>
          </GlassCard>
        </Animated.View>
      ) : null}

      <Modal visible={sheet != null} transparent animationType="none" onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.dim} accessibilityLabel="Dismiss" onPress={() => setSheet(null)} />
        {sheet ? (
          <Animated.View
            testID={`popup-sheet-${sheet.kind}`}
            accessibilityViewIsModal
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + spacing.md },
              { transform: [{ translateY: sheetIn.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }) }] },
            ]}>
            <GlassCard padding={spacing.xl2} style={styles.sheetBody}>
              {sheet.kind === "parked" ? <ParkedBody session={sheet.session} assignedElsewhere={sheet.assignedElsewhere ?? null} /> : <EndedBody session={sheet.session} />}
              <Button title={sheet.kind === "parked" ? "Got it" : "Done"} onPress={() => setSheet(null)} testID="popup-sheet-close" />
            </GlassCard>
          </Animated.View>
        ) : null}
      </Modal>
    </PopupContext.Provider>
  );
}

function ParkedBody({
  session,
  assignedElsewhere,
}: {
  session: ParkingSessionResponse;
  assignedElsewhere: ZoneAssignmentResponse["zone"] | null;
}) {
  const colors = useColors();
  return (
    <>
      <View style={styles.row}>
        <Lottie size={88} />
        <View style={styles.flex}>
          <Text variant="title" accessibilityRole="header">
            {"You're parked"}
          </Text>
          <Text variant="caption">
            {session.zone.name} · entered {formatClockTime(session.enteredAt)}
          </Text>
        </View>
      </View>
      {session.vehicle ? (
        <View style={styles.row}>
          <PlateChip value={session.vehicle.plateNumber} tone="soft" />
          <Text variant="bodySemi">→ {session.zone.name}</Text>
        </View>
      ) : null}
      {assignedElsewhere ? (
        <View
          style={[styles.row, styles.warn, { backgroundColor: colors.warningSoft }]}
          accessibilityRole="alert"
          testID="popup-parked-wrong-zone">
          <Ionicons name="warning" size={18} color={colors.warningInk} />
          <Text variant="caption" color={colors.foreground} style={styles.flex}>
            Not your assigned zone ({assignedElsewhere.name}, {assignedElsewhere.code}). Parking here gets a warning, then a fine.
          </Text>
        </View>
      ) : null}
      <Text variant="caption">The exit camera ends your session when you drive out.</Text>
    </>
  );
}

function EndedBody({ session }: { session: ParkingSessionResponse }) {
  const colors = useColors();
  return (
    <>
      <View style={styles.row}>
        <View style={[styles.check, { backgroundColor: colors.success }]}>
          <Ionicons name="checkmark" size={30} color={colors.onDanger} />
        </View>
        <View style={styles.flex}>
          <Text variant="title" accessibilityRole="header">
            Session ended
          </Text>
          <Text variant="caption">
            {session.zone.name}
            {session.vehicle ? ` · ${session.vehicle.plateNumber}` : ""}
          </Text>
        </View>
        <Lottie size={56} />
      </View>
      <View style={styles.row}>
        <Text variant="display" testID="popup-ended-duration">
          {formatDurationSeconds(session.durationSeconds)}
        </Text>
        {session.feeAmount != null ? (
          <Text variant="bodySemi" style={styles.push} testID="popup-ended-fee">
            {formatCurrency(session.feeAmount)}
          </Text>
        ) : null}
      </View>
      {session.exitedAt ? (
        <Text variant="caption">
          {formatClockTime(session.enteredAt)} → {formatClockTime(session.exitedAt)}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  warn: { alignItems: "flex-start", padding: spacing.md, borderRadius: radii.sm },
  push: { marginLeft: "auto" },
  icon: { width: 36, height: 36, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
  check: { width: 52, height: 52, borderRadius: radii.full, alignItems: "center", justifyContent: "center" },
  banner: { position: "absolute", left: spacing.md, right: spacing.md, zIndex: 50 },
  toast: { position: "absolute", left: spacing.xl2, right: spacing.xl2, zIndex: 50 },
  dim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0, 0, 0, 0.35)" },
  sheet: { position: "absolute", left: spacing.md, right: spacing.md, bottom: 0 },
  sheetBody: { gap: spacing.lg },
});
