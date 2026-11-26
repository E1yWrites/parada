import { useEffect, useState } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ZoneAssignmentResponse } from "@parada/types";
import type { PublicZone } from "@/lib/api/client";
import { heldSpaces } from "@/lib/format";
import { radii, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import { usePrefersReducedMotion } from "@/src/hooks/usePrefersReducedMotion";
import { pulseWaves } from "./WaveGrid";
import { CapacityBar } from "./CapacityBar";
import { IconButton } from "./IconButton";
import { PlateChip } from "./PlateChip";
import { ReservationPanel } from "./ReservationPanel";
import { SegmentedControl } from "./SegmentedControl";
import { Text } from "./Text";
import { ZoneAssignmentPanel } from "./ZoneAssignmentPanel";

export type ZoneAction = "assign" | "reserve";

type ZoneActionSheetProps = {
  zone: PublicZone | null;
  mode: ZoneAction;
  onModeChange: (mode: ZoneAction) => void;
  onClose: () => void;
  /** A plan was confirmed: the screen returns to Now. */
  onDone?: () => void;
  /** Change-zone mode: only "go", and this assignment is released on confirm. */
  replacing?: ZoneAssignmentResponse | null;
};

/**
 * Tap a zone → this sheet rises with everything needed to finish there: the
 * zone, a two-way choice (Hick: only two), the vehicle, and the one final
 * button in the thumb zone (Fitts). No scrolling the list to find the action.
 *
 * Motion: the backdrop stages the focus; the sheet anticipates (starts a touch
 * small and low), rises on a spring that overshoots and settles (follow-
 * through), and slides back down on close before it unmounts. Opening also
 * swells the wave grid behind it (secondary action). Reduce Motion: no
 * springs, it simply appears.
 */
export function ZoneActionSheet({ zone, mode, onModeChange, onClose, onDone, replacing = null }: ZoneActionSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reducedMotion = usePrefersReducedMotion();
  const [shown, setShown] = useState<PublicZone | null>(zone);
  const [rise] = useState(() => new Animated.Value(0));

  // Keep the last zone on screen while the sheet slides away.
  if (zone !== null && zone !== shown) setShown(zone);

  useEffect(() => {
    if (zone === null) return;
    pulseWaves();
    if (reducedMotion) {
      rise.setValue(1);
      return;
    }
    rise.setValue(0);
    Animated.spring(rise, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }).start();
  }, [reducedMotion, rise, zone]);

  const close = () => {
    if (reducedMotion) {
      onClose();
      return;
    }
    Animated.timing(rise, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => onClose());
  };

  const current = zone ?? shown;
  if (current === null) return null;
  const held = heldSpaces(current);

  return (
    <Modal visible={zone !== null} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, { opacity: rise.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }) }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" testID="zone-sheet-backdrop" />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        testID="zone-sheet"
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            paddingBottom: insets.bottom + spacing.lg,
            maxHeight: height * 0.88,
            transform: [
              { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [height * 0.6, 0] }) },
              { scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1], extrapolate: "clamp" }) },
            ],
          },
        ]}>
        <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
        <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <View style={styles.nameRow}>
                <Text variant="title" numberOfLines={2} style={styles.name} accessibilityRole="header" testID="zone-sheet-title">
                  {current.name}
                </Text>
                <PlateChip value={current.code} tone="soft" size="sm" />
              </View>
              <Text variant="caption">
                {current.availableCount} free{held > 0 ? ` · ${held} held` : ""} · {current.capacity} spaces
              </Text>
            </View>
            <IconButton icon="close" accessibilityLabel="Close" onPress={close} testID="zone-sheet-close" />
          </View>
          <CapacityBar occupied={current.occupiedCount} capacity={current.capacity} held={held} color={colors.foreground} compact />
          {replacing ? (
            <Text variant="caption" testID="zone-sheet-replacing">
              Moves you from {replacing.zone.name}. That assignment is released when you confirm.
            </Text>
          ) : (
          <View testID="parking-action-toggle">
            <SegmentedControl
              value={mode}
              onChange={(next) => onModeChange(next as ZoneAction)}
              options={[
                { value: "assign", label: "Go to this zone", accessibilityLabel: "Go to this zone: no space is kept", testID: "parking-action-assign" },
                { value: "reserve", label: "Reserve a space", accessibilityLabel: "Reserve a space: keeps one space from your arrival time", testID: "parking-action-reserve" },
              ]}
            />
          </View>
          )}
          {mode === "assign" || replacing ? (
            <ZoneAssignmentPanel selectedZone={current} bare replaceAssignmentId={replacing?.id ?? null} onDone={onDone} />
          ) : (
            <ReservationPanel selectedZone={current} bare onDone={onDone} />
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { backgroundColor: "rgba(0, 0, 0, 0.38)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, marginTop: spacing.md },
  content: { paddingHorizontal: spacing.xl2, paddingTop: spacing.lg, gap: spacing.xl },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  headerText: { flex: 1, minWidth: 0, gap: spacing.xs },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" },
  name: { flexShrink: 1 },
});
