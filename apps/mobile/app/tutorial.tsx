import { useEffect, useState } from "react";
import { Animated, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import type { Vehicle } from "@parada/types";
import { AddVehicleForm, Button, CapacityBar, GlassCard, LottieGuide, PlateChip, Text, WaveGrid } from "@/src/components";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import { formatVehicleType, heldSpaces } from "@/lib/format";
import { markTutorialDone } from "@/lib/tutorial";
import { radii, spacing } from "@/src/theme";
import { useColors } from "@/src/providers/ThemeProvider";
import { useSession } from "@/src/providers/SessionProvider";
import { usePrefersReducedMotion } from "@/src/hooks/usePrefersReducedMotion";

/** 0–2 walk through, 3 add first vehicle, 4 added, 5 add another, 6 summary. */
type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const BEATS = [
  { title: "", body: "Three quick things, then you're ready to park." },
  { title: "Your plate is your ticket.", body: "Gate cameras read your plate as you drive in and out. No paper ticket, nothing to tap." },
  { title: "Pick a zone. Go now or reserve.", body: "Zones show live free spaces. Go now assigns you a zone; Reserve holds a space for your arrival window." },
] as const;

/**
 * First-run tutorial after sign-up: one stage carried across three beats
 * (Lottie greets → the plate is read under a gate camera → a zone card), then
 * it asks for the driver's vehicle straight away, with the primary switch.
 */
export default function TutorialScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useSession();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const reducedMotion = usePrefersReducedMotion();
  const { height } = useWindowDimensions();
  const [step, setStep] = useState<Step>(0);
  const [first, setFirst] = useState<Vehicle | null>(null);
  const [stage] = useState(() => new Animated.Value(0));
  const vehicles = useQuery({ queryKey: queryKeys.vehicles, queryFn: api.vehicles, enabled: step === 6 });
  const zones = useQuery({ queryKey: queryKeys.zones, queryFn: api.zones });
  const [scan] = useState(() => new Animated.Value(0));

  // Beat 2's scan line sweeps the plate (stopped under Reduce Motion).
  useEffect(() => {
    if (reducedMotion || step !== 1) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scan, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(scan, { toValue: 0, duration: 1100, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, scan, step]);

  useEffect(() => {
    const to = Math.min(step, 3);
    if (reducedMotion) {
      stage.setValue(to);
      return;
    }
    Animated.spring(stage, { toValue: to, friction: 9, tension: 50, useNativeDriver: true }).start();
  }, [reducedMotion, stage, step]);

  if (!user) return <Redirect href="/login" />;

  const finish = async () => {
    await markTutorialDone(typeof email === "string" ? email : user.email);
    router.replace("/(tabs)/parking");
  };

  const fade = (at: number) => stage.interpolate({ inputRange: [at - 1, at, at + 1], outputRange: [0, 1, 0], extrapolate: "clamp" });
  const firstName = user.name.split(" ")[0] ?? user.name;
  const formStep = step >= 3;
  const beat = BEATS[Math.min(step, 2) as 0 | 1 | 2];
  const openZones = (zones.data ?? []).filter((z) => z.status === "ACTIVE");
  const pins = openZones.slice(0, 3);
  const exampleZone = [...openZones].sort((a, b) => b.availableCount - a.availableCount)[0] ?? null;
  const guideLines: string[] =
    step === 0
      ? [`Hi ${firstName}! I'm Lottie.`, "Tap me any time for a tip.", openZones.length > 0 ? `${openZones.length} zones are open right now.` : "I'll show you around."]
      : step === 1
        ? ["Gate cameras know you by your plate.", "Drive in, and your session starts by itself."]
        : step === 2
          ? [exampleZone ? `${exampleZone.name} has the most room right now.` : "Zones show live free spaces.", "Go now keeps no space. Reserve holds one."]
          : step === 3
            ? ["Add your plate so the gate knows you.", "Make, model and color are optional."]
            : step === 4
              ? [`${first?.plateNumber ?? "Your car"} is ready!`, "Sharing a car? Add another vehicle."]
              : step === 5
                ? ["Turn on Primary to park with this one by default."]
                : ["All set. Tap Start parking."];
  const active = (vehicles.data ?? []).filter((v) => v.status === "ACTIVE");
  const primary = active.find((v) => v.isPrimary) ?? null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="tutorial-screen">
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ translateY: stage.interpolate({ inputRange: [0, 3], outputRange: [0, -height * 0.18] }) }] }]}>
        <WaveGrid intensity="vivid" horizon={0.5} scrimFrom={formStep ? undefined : 0.6} />
      </Animated.View>
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        {/* Lottie talks on every step (tap her or the bubble for the next line). In
            the form steps she fills the space above the sheet instead of leaving it empty. */}
        <View style={formStep ? styles.guideFill : styles.guideTop}>
          <LottieGuide key={step} lines={guideLines} size={step === 3 || step === 5 ? 88 : formStep ? 140 : step === 0 ? 132 : 84} testID="tutorial-guide" />
        </View>
        {!formStep ? (
          <View style={styles.stage} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {/* Beat 1: live zones stand on the grid. */}
            <Animated.View style={[styles.pins, { opacity: fade(0) }]}>
              {pins.map((zone, i) => (
                <View key={zone.id} style={[styles.pin, { marginTop: i === 1 ? 0 : 36 }]}>
                  <View style={[styles.pinHead, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text variant="title">{zone.availableCount}</Text>
                    <Text variant="micro" numberOfLines={1}>{zone.code} FREE</Text>
                  </View>
                  <View style={[styles.pinStem, { backgroundColor: colors.primaryDeep }]} />
                  <View style={[styles.pinDot, { backgroundColor: colors.primaryDeep }]} />
                </View>
              ))}
            </Animated.View>
            {/* Beat 2: the plate under a gate camera. */}
            <Animated.View style={[styles.layer, { opacity: fade(1) }]}>
              <GlassCard padding={spacing.xl}>
                <View style={styles.frameHead}>
                  <Ionicons name="videocam" size={16} color={colors.muted} />
                  <Text variant="caption">Gate camera · entry</Text>
                  <View style={[styles.rec, { backgroundColor: colors.danger }]} />
                </View>
                <View style={[styles.frame, { borderColor: colors.primaryDeep }]}>
                  <View style={styles.center}>
                    <PlateChip value="ABC 1234" />
                  </View>
                  <Animated.View style={[styles.scan, { backgroundColor: colors.primaryDeep, transform: [{ translateY: scan.interpolate({ inputRange: [0, 1], outputRange: [-44, 44] }) }] }]} />
                </View>
                <View style={[styles.seen, { backgroundColor: colors.successSoft }]}>
                  <Ionicons name="checkmark" size={14} color={colors.successInk} />
                  <Text variant="caption" color={colors.successInk}>Read at the gate · your session starts</Text>
                </View>
              </GlassCard>
            </Animated.View>
            {/* Beat 3: a real zone, the least busy one right now. */}
            <Animated.View style={[styles.layer, { opacity: fade(2), transform: [{ translateY: fade(2).interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
              {exampleZone ? (
                <GlassCard padding={spacing.xl}>
                  <View style={styles.frameHead}>
                    <Text variant="section" numberOfLines={1} style={styles.flexText}>{exampleZone.name}</Text>
                    <PlateChip value={exampleZone.code} tone="soft" size="sm" />
                  </View>
                  <View style={styles.countRow}>
                    <Text variant="display">{exampleZone.availableCount}</Text>
                    <Text variant="caption">of {exampleZone.capacity} free · live</Text>
                  </View>
                  <CapacityBar occupied={exampleZone.occupiedCount} capacity={exampleZone.capacity} held={heldSpaces(exampleZone)} color={colors.foreground} compact />
                  <View style={styles.fakeButtons}>
                    <View style={[styles.fakeBtn, { backgroundColor: colors.primary }]}>
                      <Text variant="bodySemi" color={colors.onAccent}>Go now</Text>
                    </View>
                    <View style={[styles.fakeBtn, { backgroundColor: colors.surfaceElevated }]}>
                      <Text variant="bodySemi">Reserve</Text>
                    </View>
                  </View>
                </GlassCard>
              ) : null}
            </Animated.View>
          </View>
        ) : null}

        {!formStep ? (
          <View style={styles.copy}>
            <Text variant="hero" accessibilityRole="header" testID="tutorial-title">
              {step === 0 ? `Welcome, ${firstName}.` : beat.title}
            </Text>
            <Text variant="body" color={colors.muted}>
              {beat.body}
            </Text>
            <View style={styles.nav}>
              <View style={styles.dots} accessibilityLabel={`Step ${step + 1} of 3`}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={[styles.dot, { width: i === step ? 24 : 8, backgroundColor: i === step ? colors.foreground : colors.faint }]} />
                ))}
              </View>
              <Button
                title={step === 2 ? "Add my vehicle" : "Next"}
                onPress={() => setStep((step + 1) as Step)}
                testID="tutorial-next"
              />
            </View>
          </View>
        ) : (
          <View style={styles.sheet}>
          <GlassCard padding={spacing.xl2} testID="tutorial-sheet">
            <ScrollView
              keyboardShouldPersistTaps="handled"
              // iOS: the sheet's own inset absorbs the keyboard so the plate field and
              // submit stay reachable; Android resizes the window (adjustResize).
              automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
              keyboardDismissMode="interactive"
              contentContainerStyle={styles.sheetBody}
              showsVerticalScrollIndicator={false}>
              {step === 3 || step === 5 ? (
                <>
                  <Text variant="title" accessibilityRole="header">
                    {step === 3 ? "Add your vehicle" : "Add another vehicle"}
                  </Text>
                  <Text variant="caption">
                    {step === 3
                      ? "Gate cameras match this plate to you. Add it now so you can go or reserve."
                      : `${first?.plateNumber ?? "Your first vehicle"} is your primary vehicle right now.`}
                  </Text>
                  <AddVehicleForm
                    isFirstVehicle={step === 3}
                    submitLabel="Add vehicle"
                    onAdded={(vehicle) => {
                      if (step === 3) {
                        setFirst(vehicle);
                        setStep(4);
                      } else {
                        setStep(6);
                      }
                    }}
                  />
                  {step === 3 ? (
                    <Button variant="ghost" title="I'll add it later" onPress={() => void finish()} testID="tutorial-later" />
                  ) : (
                    <Button variant="ghost" title="Not now" onPress={() => setStep(4)} testID="tutorial-another-back" />
                  )}
                </>
              ) : step === 4 && first ? (
                <>
                  <Text variant="title" accessibilityRole="header">{"You're set."}</Text>
                  <View style={styles.pass} testID="tutorial-pass">
                    <PlateChip value={first.plateNumber} />
                    <Text variant="caption">{formatVehicleType(first.vehicleType)}</Text>
                    <View style={styles.tags}>
                      <Tag label="Primary" color={colors.infoInk} bg={colors.infoSoft} />
                      <Tag label="Selected for parking" color={colors.foreground} bg={colors.surfaceElevated} />
                    </View>
                  </View>
                  <Text variant="caption">You can change the primary vehicle any time in Account › Vehicles.</Text>
                  <Button variant="secondary" title="Add another vehicle" onPress={() => setStep(5)} testID="tutorial-add-another" />
                  <Button title="Start parking" onPress={() => void finish()} testID="tutorial-start" />
                </>
              ) : (
                <>
                  <Text variant="title" accessibilityRole="header">Your vehicles</Text>
                  {active.map((v) => (
                    <View key={v.id} style={styles.vehicleRow}>
                      <PlateChip value={v.plateNumber} />
                      {v.isPrimary ? <Text variant="caption" color={colors.infoInk}>Primary</Text> : null}
                    </View>
                  ))}
                  {primary ? (
                    <View style={styles.vehicleRow} testID="tutorial-selected">
                      <Text variant="caption">Selected for parking</Text>
                      <PlateChip value={primary.plateNumber} tone="soft" />
                    </View>
                  ) : null}
                  <Button title="Start parking" onPress={() => void finish()} testID="tutorial-start" />
                </>
              )}
            </ScrollView>
          </GlassCard>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

function Tag({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text variant="caption" color={color}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, paddingHorizontal: spacing.xl2 },
  guideTop: { alignItems: "center", marginTop: spacing.xl },
  guideFill: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.lg },
  // The beats share one area between Lottie and the copy and cross-fade there.
  stage: { flex: 1, justifyContent: "center", minHeight: 220 },
  layer: { position: "absolute", left: 0, right: 0 },
  pins: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "space-around", alignItems: "flex-start" },
  pin: { alignItems: "center" },
  pinHead: { minWidth: 76, alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md, borderWidth: 1 },
  pinStem: { width: 2, height: 26, opacity: 0.7 },
  pinDot: { width: 12, height: 12, borderRadius: 6, marginTop: -4 },
  frameHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  rec: { width: 8, height: 8, borderRadius: 4, marginLeft: "auto" },
  frame: {
    height: 110,
    borderWidth: 3,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  scan: { position: "absolute", left: 12, right: 12, height: 2, opacity: 0.8 },
  seen: { flexDirection: "row", alignItems: "center", alignSelf: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radii.full },
  flexText: { flex: 1 },
  center: { alignItems: "center" },
  countRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, marginBottom: spacing.sm },
  fakeButtons: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  fakeBtn: { flex: 1, height: 40, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  copy: { gap: spacing.md, paddingBottom: spacing.xl },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.lg, marginTop: spacing.lg },
  dots: { flexDirection: "row", gap: 6 },
  dot: { height: 8, borderRadius: 4 },
  sheet: { marginTop: "auto", maxHeight: "80%", marginBottom: spacing.md },
  sheetBody: { gap: spacing.lg },
  pass: { gap: spacing.sm },
  tags: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  tag: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radii.full },
  vehicleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
