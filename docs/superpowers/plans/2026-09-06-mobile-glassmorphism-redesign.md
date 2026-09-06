# Mobile Glassmorphism Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the PARADA mobile app (Expo/React Native, `apps/mobile`) a modern glassmorphism look — frosted-glass chrome (floating tab bar + hero/summary cards) over an ambient color-blob background — without removing or changing any feature, screen, or piece of app logic.

**Architecture:** Purely additive to the existing token/component system (`src/theme/`, `src/components/`). A new `expo-blur`-backed `GlassCard` and `TabBarBackground` sit alongside the existing solid `Card`; a new `GradientMesh` decorative layer paints ambient color blobs behind `Screen` content using plain `View`s (no gradient library needed). Everything that isn't explicitly a hero/chrome surface (list cards, inputs, buttons) is untouched. A `usePrefersReducedTransparency` hook (mirroring the existing `usePrefersReducedMotion` hook) makes every new blur surface fall back to a solid background under the OS "Reduce Transparency" accessibility setting.

**Tech Stack:** Expo SDK 53, React Native 0.79, expo-router 5, TypeScript, Jest + `@testing-library/react-native`. One new dependency: `expo-blur` (official Expo SDK package, matched to the pinned SDK via `npx expo install`).

**Spec:** No separate spec file — this plan implements the in-chat design approved during brainstorming (glass scope = chrome only: floating tab bar + hero banners/summary cards; ambient background = soft color blobs behind content; real blur via `expo-blur`; Reduce Transparency fallback required). One deliberate simplification made during planning: the "gradient mesh" background is implemented as plain stacked translucent `View` circles instead of adding `expo-linear-gradient` — same visual effect (soft-edged ambient blobs), one fewer dependency, no gradient math needed for a two-tone radial wash.

## Global Constraints

- No feature, screen, navigation, or data-fetching logic changes — this is presentation-layer only (`src/theme/`, `src/components/`, `app/(tabs)/_layout.tsx`).
- Only one new dependency: `expo-blur`, installed via `npx expo install expo-blur` from `apps/mobile` (ensures the SDK-53-matched version).
- Glass (blur) applies only to: the floating tab bar and the 3 existing hero/summary cards (`ActiveSessionBanner`, `ParkingRecommendation`'s two states, `ReservationPanel`'s summary). All other cards/rows/inputs/buttons keep their current solid styling unchanged.
- Every new `BlurView` usage must fall back to a solid background when `usePrefersReducedTransparency()` is true — no exceptions.
- No existing `testID`, accessibility label/role, or rendered text content may change on any touched component — existing tests (`activeSession.test.tsx`, `recommendation.test.tsx`, `reservation.test.tsx`, `primitives.test.tsx`, `layoutSafety.test.tsx`) must keep passing unmodified.
- Reuse existing tokens (`colors.primary`, `colors.success`, `radii`, `spacing`, `shadows`) — no new brand colors invented.
- Package manager is npm (root workspace); run all mobile commands from `apps/mobile`.

---

### Task 1: Add `expo-blur` dependency + Jest mock

**Files:**
- Modify: `apps/mobile/package.json` (via `npx expo install`, not hand-edited)
- Modify: `apps/mobile/jest.setup.ts`

**Interfaces:**
- Produces: `BlurView` component import from `"expo-blur"`, usable (and mockable in Jest) by every later task.

- [ ] **Step 1: Install the dependency**

```bash
cd apps/mobile
npx expo install expo-blur
```

Expected: `package.json` gains an `expo-blur` entry under `dependencies`, pinned to the version Expo SDK 53 recommends; `package-lock.json` updates.

- [ ] **Step 2: Add a Jest mock so BlurView renders as a plain View in tests**

Add to `apps/mobile/jest.setup.ts` (append after the existing `jest.mock("expo-font", ...)` block, before the `expo-secure-store` mock):

```ts
jest.mock("expo-blur", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    BlurView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});
```

- [ ] **Step 3: Verify the app still typechecks and the existing suite still passes**

```bash
cd apps/mobile
npm run typecheck
npm test
```

Expected: both succeed with no changes in test results (this step only adds a dependency + mock, nothing consumes it yet).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/package.json apps/mobile/package-lock.json apps/mobile/jest.setup.ts
git commit -m "chore(mobile): add expo-blur for glassmorphism redesign

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0176iov5vjyu1FmRAv3Fcsgg"
```

---

### Task 2: `usePrefersReducedTransparency` hook

**Files:**
- Create: `apps/mobile/src/hooks/usePrefersReducedTransparency.ts`

**Interfaces:**
- Produces: `usePrefersReducedTransparency(): boolean` — consumed by `GlassCard` (Task 4) and `TabBarBackground` (Task 7).

No dedicated test file for this hook — the existing, structurally identical `usePrefersReducedMotion` hook (`apps/mobile/src/hooks/usePrefersReducedMotion.ts`) has none either; its behavior is exercised through the components that consume it, and the same convention is followed here (exercised via `GlassCard`'s test in Task 4).

- [ ] **Step 1: Implement the hook, mirroring `usePrefersReducedMotion` exactly**

```ts
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** True when the platform prefers reduced transparency (disables blur/glass surfaces). */
export function usePrefersReducedTransparency(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceTransparencyEnabled().then((value: boolean) => {
      if (active) {
        setReduced(value);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  return reduced;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/mobile
npm run typecheck
```

Expected: passes (this file has no consumers yet, so nothing else to run).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/hooks/usePrefersReducedTransparency.ts
git commit -m "feat(mobile): add usePrefersReducedTransparency hook

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0176iov5vjyu1FmRAv3Fcsgg"
```

---

### Task 3: Glass theme tokens

**Files:**
- Create: `apps/mobile/src/theme/glass.ts`
- Modify: `apps/mobile/src/theme/index.ts`

**Interfaces:**
- Produces: `glass: Record<"hero" | "chrome", { tint: "light" | "dark"; intensity: number; overlayColor: string; borderColor: string; fallbackColor: string }>` and `blurMethod: "dimezisBlurView" | undefined`, both exported from `@/src/theme`. Consumed by `GlassCard` (Task 4) and `TabBarBackground` (Task 7).

No dedicated test — this is pure token data, consistent with the existing `colors.ts`, `radii.ts`, and `shadows.ts`, none of which have dedicated tests either.

- [ ] **Step 1: Create the token file**

```ts
import { Platform } from "react-native";
import { colors } from "./colors";

export type GlassPreset = "hero" | "chrome";

/**
 * PARADA glass tokens — used only by chrome/hero surfaces (floating tab bar,
 * hero/summary cards). Every consumer must fall back to `fallbackColor` when
 * `usePrefersReducedTransparency()` is true.
 */
export const glass: Record<
  GlassPreset,
  {
    tint: "light" | "dark";
    intensity: number;
    overlayColor: string;
    borderColor: string;
    fallbackColor: string;
  }
> = {
  /** Hero/summary cards on the light gradient-mesh background. */
  hero: {
    tint: "light",
    intensity: 40,
    overlayColor: "rgba(255, 255, 255, 0.22)",
    borderColor: "rgba(255, 255, 255, 0.5)",
    fallbackColor: colors.surface,
  },
  /** Floating tab bar — dark frosted glass, replacing the old solid fill. */
  chrome: {
    tint: "dark",
    intensity: 60,
    overlayColor: "rgba(23, 30, 25, 0.35)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    fallbackColor: colors.foreground,
  },
};

/**
 * Android's BlurView only blurs real content with this experimental native
 * method; iOS ignores the prop and always blurs natively.
 */
export const blurMethod: "dimezisBlurView" | undefined =
  Platform.OS === "android" ? "dimezisBlurView" : undefined;
```

- [ ] **Step 2: Export from the theme barrel**

In `apps/mobile/src/theme/index.ts`, add after the existing `shadows` export line:

```ts
export { glass, blurMethod } from "./glass";
export type { GlassPreset } from "./glass";
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/mobile
npm run typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/theme/glass.ts apps/mobile/src/theme/index.ts
git commit -m "feat(mobile): add glass theme tokens

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0176iov5vjyu1FmRAv3Fcsgg"
```

---

### Task 4: `GlassCard` component

**Files:**
- Create: `apps/mobile/src/components/GlassCard.tsx`
- Modify: `apps/mobile/src/components/index.ts`
- Test: `apps/mobile/__tests__/glassCard.test.tsx`

**Interfaces:**
- Consumes: `usePrefersReducedTransparency()` (Task 2), `glass`, `blurMethod`, `radii`, `spacing`, `shadows` (Task 3 + existing theme), `BlurView` from `"expo-blur"` (Task 1).
- Produces: `GlassCard(props: { children: ReactNode; onPress?: () => void; accent?: string; padding?: number; style?: StyleProp<ViewStyle>; testID?: string })` — same prop shape as the existing `Card`, consumed by Task 8's swap-ins.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/__tests__/glassCard.test.tsx`:

```tsx
import { AccessibilityInfo } from "react-native";
import { render, screen } from "@/src/test/utils";
import { GlassCard } from "@/src/components/GlassCard";
import { Text } from "@/src/components/Text";

describe("GlassCard", () => {
  it("renders a blur layer and its children by default", () => {
    render(
      <GlassCard testID="hero">
        <Text>Parked</Text>
      </GlassCard>,
    );
    expect(screen.getByTestId("hero-blur")).toBeOnTheScreen();
    expect(screen.getByText("Parked")).toBeOnTheScreen();
  });

  it("falls back to a solid surface when Reduce Transparency is enabled", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockResolvedValue(true);

    render(
      <GlassCard testID="hero">
        <Text>Parked</Text>
      </GlassCard>,
    );

    await screen.findByText("Parked");
    expect(screen.queryByTestId("hero-blur")).not.toBeOnTheScreen();
  });

  it("renders the accent stripe and stays pressable, like Card", () => {
    const onPress = jest.fn();
    render(
      <GlassCard testID="hero" accent="#CA0013" onPress={onPress}>
        <Text>Parked</Text>
      </GlassCard>,
    );
    expect(screen.getByTestId("hero-accent")).toBeOnTheScreen();
    expect(screen.getByTestId("hero").props.accessibilityRole).toBe("button");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd apps/mobile
npm test -- __tests__/glassCard.test.tsx
```

Expected: FAIL — `Cannot find module '@/src/components/GlassCard'`.

- [ ] **Step 3: Implement `GlassCard`**

Create `apps/mobile/src/components/GlassCard.tsx`:

```tsx
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { blurMethod, glass, radii, shadows, spacing } from "@/src/theme";
import { usePrefersReducedTransparency } from "@/src/hooks/usePrefersReducedTransparency";

type GlassCardProps = {
  children: ReactNode;
  onPress?: () => void;
  accent?: string;
  padding?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Frosted-glass hero surface — the same shape/contract as `Card`, but with a
 * blurred translucent background instead of a solid one. Reserved for hero
 * banners and summary cards; regular content keeps using `Card`. Falls back
 * to a solid surface under the OS Reduce Transparency setting.
 */
export function GlassCard({ children, onPress, accent, padding = spacing.xl, style, testID }: GlassCardProps) {
  const reducedTransparency = usePrefersReducedTransparency();
  const preset = glass.hero;

  const background = reducedTransparency ? (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: preset.fallbackColor }]} />
  ) : (
    <>
      <BlurView
        testID={testID ? `${testID}-blur` : undefined}
        style={StyleSheet.absoluteFill}
        tint={preset.tint}
        intensity={preset.intensity}
        experimentalBlurMethod={blurMethod}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: preset.overlayColor }]} />
    </>
  );

  const content = (
    <View style={[styles.inner, { padding }]}>
      {accent ? (
        <View testID={testID ? `${testID}-accent` : undefined} style={[styles.accent, { backgroundColor: accent }]} />
      ) : null}
      {children}
    </View>
  );

  // Shadow lives on the outer, un-clipped view; the inner view clips the
  // blur/border to the rounded corners (overflow:hidden would also clip an
  // iOS shadow if applied on the same node).
  const outerStyle = [styles.outer, style];
  const clipStyle = [styles.clip, { borderColor: preset.borderColor }];

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [outerStyle, pressed ? styles.pressed : undefined]}>
        <View style={clipStyle}>
          {background}
          {content}
        </View>
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={outerStyle}>
      <View style={clipStyle}>
        {background}
        {content}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderRadius: radii.lg,
    ...shadows.card,
  },
  clip: {
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  inner: {},
  accent: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.md,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
});
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd apps/mobile
npm test -- __tests__/glassCard.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Export from the component barrel**

In `apps/mobile/src/components/index.ts`, add after `export { Card } from "./Card";`:

```ts
export { GlassCard } from "./GlassCard";
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/GlassCard.tsx apps/mobile/src/components/index.ts apps/mobile/__tests__/glassCard.test.tsx
git commit -m "feat(mobile): add GlassCard frosted-glass surface

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0176iov5vjyu1FmRAv3Fcsgg"
```

---

### Task 5: `GradientMesh` ambient background

**Files:**
- Create: `apps/mobile/src/components/GradientMesh.tsx`
- Test: `apps/mobile/__tests__/gradientMesh.test.tsx`

**Interfaces:**
- Consumes: `colors.primary`, `colors.success` (existing theme).
- Produces: `GradientMesh(props: { testID?: string })` — a non-interactive, absolutely-filled decorative layer. Consumed by `Screen` (Task 6).

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/__tests__/gradientMesh.test.tsx`:

```tsx
import { render, screen } from "@/src/test/utils";
import { GradientMesh } from "@/src/components/GradientMesh";

describe("GradientMesh", () => {
  it("renders as a non-interactive background layer", () => {
    render(<GradientMesh testID="mesh" />);
    expect(screen.getByTestId("mesh")).toBeOnTheScreen();
    expect(screen.getByTestId("mesh").props.pointerEvents).toBe("none");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd apps/mobile
npm test -- __tests__/gradientMesh.test.tsx
```

Expected: FAIL — `Cannot find module '@/src/components/GradientMesh'`.

- [ ] **Step 3: Implement `GradientMesh`**

Create `apps/mobile/src/components/GradientMesh.tsx`:

```tsx
import { StyleSheet, View } from "react-native";
import { colors } from "@/src/theme";

type Blob = {
  color: string;
  size: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

/**
 * Two off-screen-anchored blobs give the redesign's glass surfaces something
 * with color/depth to blur. Positioned so most of each circle falls outside
 * the visible frame — the visible slice reads as a soft ambient wash, not a
 * hard-edged shape.
 */
const BLOBS: Blob[] = [
  { color: colors.primary, size: 420, top: -160, left: -140 },
  { color: colors.success, size: 380, bottom: -140, right: -120 },
];

/**
 * Ambient background layer behind `Screen` content. Each blob is two
 * concentric translucent circles — a cheap stand-in for a radial gradient,
 * since React Native has no native radial-gradient primitive — so the
 * visible edge fades rather than cutting off hard.
 */
export function GradientMesh({ testID }: { testID?: string }) {
  return (
    <View testID={testID} style={StyleSheet.absoluteFill} pointerEvents="none">
      {BLOBS.map((blob, index) => (
        <View
          key={index}
          style={[
            styles.blob,
            {
              width: blob.size,
              height: blob.size,
              borderRadius: blob.size / 2,
              backgroundColor: blob.color,
              top: blob.top,
              bottom: blob.bottom,
              left: blob.left,
              right: blob.right,
            },
          ]}>
          <View
            style={[
              styles.core,
              {
                borderRadius: blob.size * 0.35,
                backgroundColor: blob.color,
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  blob: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.1,
  },
  core: {
    width: "60%",
    height: "60%",
    opacity: 0.35,
  },
});
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd apps/mobile
npm test -- __tests__/gradientMesh.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/GradientMesh.tsx apps/mobile/__tests__/gradientMesh.test.tsx
git commit -m "feat(mobile): add GradientMesh ambient background layer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0176iov5vjyu1FmRAv3Fcsgg"
```

Note: `GradientMesh` is not exported from `src/components/index.ts` — it's an implementation detail of `Screen` (Task 6), not something individual screens compose directly.

---

### Task 6: Wire `GradientMesh` into `Screen`

**Files:**
- Modify: `apps/mobile/src/components/Screen.tsx`

**Interfaces:**
- Consumes: `GradientMesh` (Task 5).
- No prop/API changes to `Screen` — every existing call site (`app/(tabs)/*.tsx`, `app/login.tsx`, `app/register.tsx`) is unaffected.

- [ ] **Step 1: Add the import**

In `apps/mobile/src/components/Screen.tsx`, add near the top (after the `Text` import):

```ts
import { GradientMesh } from "./GradientMesh";
```

- [ ] **Step 2: Render the mesh behind content in both the scrolling and non-scrolling branches**

Modify the `scrollView` variable's `SafeAreaView` (currently `apps/mobile/src/components/Screen.tsx:54-72`) to render the mesh as the first child:

```tsx
const scrollView = (
  <SafeAreaView edges={["top"]} style={styles.safe}>
    <GradientMesh testID={testID ? `${testID}-mesh` : undefined} />
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.padding, { paddingBottom: tabClearance(insets.bottom) }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing ?? false}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined
      }>
      {body}
    </ScrollView>
  </SafeAreaView>
);
```

And the `!scroll` branch (currently lines 74-80):

```tsx
if (!scroll) {
  return (
    <SafeAreaView edges={["top"]} style={[styles.safe, styles.padding]}>
      <GradientMesh testID={testID ? `${testID}-mesh` : undefined} />
      {body}
    </SafeAreaView>
  );
}
```

(The `keyboard` branch wraps `scrollView`, so it picks up the mesh automatically — no change needed there.)

- [ ] **Step 3: Run the full mobile test suite to confirm no regressions**

```bash
cd apps/mobile
npm test
```

Expected: PASS — no existing test queries `Screen` output in a way `GradientMesh` (an extra sibling, `pointerEvents="none"`) would break (confirmed during planning: no snapshot tests exist in `apps/mobile/__tests__`).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/Screen.tsx
git commit -m "feat(mobile): render the gradient mesh behind Screen content

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0176iov5vjyu1FmRAv3Fcsgg"
```

---

### Task 7: `TabBarBackground` + wire into the floating tab bar

**Files:**
- Create: `apps/mobile/src/components/TabBarBackground.tsx`
- Test: `apps/mobile/__tests__/tabBarBackground.test.tsx`
- Modify: `apps/mobile/app/(tabs)/_layout.tsx`

**Interfaces:**
- Consumes: `usePrefersReducedTransparency()` (Task 2), `glass`, `blurMethod`, `layout` (Task 3 + existing theme), `BlurView` from `"expo-blur"`.
- Produces: `TabBarBackground(props: { testID?: string })`, wired into `Tabs`' `tabBarBackground` option.

`TabBarBackground` is extracted into its own file (rather than an inline function inside `_layout.tsx`) specifically so it can be unit tested directly — `app/(tabs)/_layout.tsx` renders `expo-router`'s `Tabs`, which is fully auto-mocked in `jest.setup.ts` (`jest.mock("expo-router")`), so `tabBarBackground` would never actually execute under test if it stayed inline.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/__tests__/tabBarBackground.test.tsx`:

```tsx
import { AccessibilityInfo } from "react-native";
import { render, screen } from "@/src/test/utils";
import { TabBarBackground } from "@/src/components/TabBarBackground";

describe("TabBarBackground", () => {
  it("renders a blur layer by default", () => {
    render(<TabBarBackground testID="tab-bg" />);
    expect(screen.getByTestId("tab-bg-blur")).toBeOnTheScreen();
  });

  it("falls back to a solid fill when Reduce Transparency is enabled", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockResolvedValue(true);
    render(<TabBarBackground testID="tab-bg" />);
    await screen.findByTestId("tab-bg");
    expect(screen.queryByTestId("tab-bg-blur")).not.toBeOnTheScreen();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd apps/mobile
npm test -- __tests__/tabBarBackground.test.tsx
```

Expected: FAIL — `Cannot find module '@/src/components/TabBarBackground'`.

- [ ] **Step 3: Implement `TabBarBackground`**

Create `apps/mobile/src/components/TabBarBackground.tsx`:

```tsx
import { StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { blurMethod, glass, layout } from "@/src/theme";
import { usePrefersReducedTransparency } from "@/src/hooks/usePrefersReducedTransparency";

/**
 * Frosted background for the floating pill tab bar. Rendered via
 * `Tabs`' `tabBarBackground` option, behind the tab bar's icons/labels, with
 * `tabBarStyle.backgroundColor` set to `"transparent"` at the call site.
 * Falls back to the old solid charcoal fill under Reduce Transparency.
 */
export function TabBarBackground({ testID }: { testID?: string }) {
  const reducedTransparency = usePrefersReducedTransparency();
  const preset = glass.chrome;

  if (reducedTransparency) {
    return (
      <View testID={testID} style={[StyleSheet.absoluteFill, styles.rounded, { backgroundColor: preset.fallbackColor }]} />
    );
  }
  return (
    <View testID={testID} style={[StyleSheet.absoluteFill, styles.rounded]}>
      <BlurView
        testID={testID ? `${testID}-blur` : undefined}
        style={StyleSheet.absoluteFill}
        tint={preset.tint}
        intensity={preset.intensity}
        experimentalBlurMethod={blurMethod}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: preset.overlayColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  rounded: {
    borderRadius: layout.FLOATING_TAB_BAR_RADIUS,
    overflow: "hidden",
  },
});
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd apps/mobile
npm test -- __tests__/tabBarBackground.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Wire it into the tab bar**

In `apps/mobile/app/(tabs)/_layout.tsx`:

Add the import (after the existing `FullScreenLoading` import):

```ts
import { TabBarBackground } from "@/src/components/TabBarBackground";
```

Change the `tabBarStyle.backgroundColor` and add `tabBarBackground` inside `screenOptions` (currently around lines 51-65):

```tsx
tabBarStyle: {
  position: "absolute",
  bottom: insets.bottom + layout.FLOATING_TAB_BAR_MARGIN,
  left: layout.FLOATING_TAB_BAR_SIDE,
  right: layout.FLOATING_TAB_BAR_SIDE,
  height: layout.FLOATING_TAB_BAR_HEIGHT,
  borderRadius: layout.FLOATING_TAB_BAR_RADIUS,
  backgroundColor: "transparent",
  borderTopWidth: 0,
  paddingTop: 6,
  ...shadows.pill,
},
tabBarBackground: () => <TabBarBackground testID="tab-bar-background" />,
```

- [ ] **Step 6: Run the full mobile test suite**

```bash
cd apps/mobile
npm test
npm run typecheck
```

Expected: both pass — `expo-router` stays fully mocked so `_layout.tsx` itself has no dedicated render test today (confirmed during planning: no `_layout` test file exists), and this change doesn't add one, consistent with existing coverage.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/TabBarBackground.tsx apps/mobile/__tests__/tabBarBackground.test.tsx "apps/mobile/app/(tabs)/_layout.tsx"
git commit -m "feat(mobile): frost the floating tab bar with TabBarBackground

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0176iov5vjyu1FmRAv3Fcsgg"
```

---

### Task 8: Swap the 3 hero/summary cards from `Card` to `GlassCard`

**Files:**
- Modify: `apps/mobile/src/components/ActiveSessionBanner.tsx`
- Modify: `apps/mobile/src/components/ParkingRecommendation.tsx`
- Modify: `apps/mobile/src/components/ReservationPanel.tsx`

**Interfaces:**
- Consumes: `GlassCard` (Task 4) — same prop shape as `Card`, so this is a drop-in swap: import + JSX tag rename, no prop changes.

No new test files — the existing consumer tests (`activeSession.test.tsx`, `recommendation.test.tsx`, `reservation.test.tsx`, `primitives.test.tsx`'s `ActiveSessionBanner` case) assert on the components' own `testID`s and text content, not on `Card` vs. `GlassCard`, and were confirmed during planning to have exactly one (`ActiveSessionBanner`) or two (`ParkingRecommendation`) `<Card>` usages each — no other `Card` usage remains in these files after the swap.

- [ ] **Step 1: `ActiveSessionBanner.tsx`**

Change the import (line 3):

```ts
import { GlassCard } from "./GlassCard";
```

Change the JSX (currently `<Card accent={colors.primary} style={styles.card} testID={testID}>` … `</Card>`):

```tsx
<GlassCard accent={colors.primary} style={styles.card} testID={testID}>
  {/* ...unchanged body... */}
</GlassCard>
```

- [ ] **Step 2: `ParkingRecommendation.tsx`**

Change the import (line 6):

```ts
import { GlassCard } from "./GlassCard";
```

Change both JSX blocks:
- `<Card accent={colors.highlight} testID="assignment-confirmed">` → `<GlassCard accent={colors.highlight} testID="assignment-confirmed">`, and its matching `</Card>` → `</GlassCard>`.
- `<Card accent={colors.highlight} testID="recommendation-card">` → `<GlassCard accent={colors.highlight} testID="recommendation-card">`, and its matching `</Card>` → `</GlassCard>`.

- [ ] **Step 3: `ReservationPanel.tsx`**

Change the import (line 6):

```ts
import { GlassCard } from "./GlassCard";
```

Change the JSX: `<Card testID="reservation-summary">` → `<GlassCard testID="reservation-summary">`, and its matching `</Card>` → `</GlassCard>`. (Leave the `ReservationCard` import/usage on line 10 untouched — different component.)

- [ ] **Step 4: Run the full mobile test suite**

```bash
cd apps/mobile
npm test
npm run typecheck
npm run lint
```

Expected: all pass, with the exact same test counts/names as before this task (no test file changed in this task).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/ActiveSessionBanner.tsx apps/mobile/src/components/ParkingRecommendation.tsx apps/mobile/src/components/ReservationPanel.tsx
git commit -m "feat(mobile): use GlassCard for hero and summary surfaces

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0176iov5vjyu1FmRAv3Fcsgg"
```

---

### Task 9: Audit and full verification pass

**Files:** none (verification only) — this task exists specifically to catch what individual task-level testing can miss: cross-file regressions, over-engineering introduced task-by-task, and anything that only shows up once every change is in place together.

- [ ] **Step 1: Run the full automated suite one more time**

```bash
cd apps/mobile
npm test
npm run typecheck
npm run lint
```

Expected: all green — same test count/names as before Task 1 plus the 3 new test files added in Tasks 4/5/7.

- [ ] **Step 2: Code-review audit of the full diff**

Run the `code-review` skill (or `/code-review`) against the branch diff covering Tasks 1-8, at `high` effort given this touches 3 hero components, a hook, 3 new components, and the tab bar. Look specifically for:
- Any Reduce Transparency fallback path that's missing or unreachable (every `BlurView` usage must have one — `GlassCard` and `TabBarBackground` are the only two, both from Task 2/4/7).
- Any drift between `GlassCard`'s prop contract and `Card`'s (they must stay interchangeable for the 3 swapped call sites).
- Any accidental change to existing `testID`s, accessibility labels/roles, or rendered text in the touched files (`ActiveSessionBanner`, `ParkingRecommendation`, `ReservationPanel`, `Screen`, `_layout.tsx`).
- Dead code or leftover unused `Card` imports in the 3 files touched by Task 8.

Also run `ponytail-review` (or `/ponytail-review`) over the same diff to catch over-engineering — e.g. anything gold-plated beyond what Tasks 1-8 actually specified (extra props, unused config, speculative flexibility in `glass.ts` or the two new components).

Fix anything both audits surface before moving on; if a finding reveals the plan itself missed something (not just an implementation slip), note it rather than silently patching around it.

- [ ] **Step 3: Re-run the full automated suite after any audit fixes**

```bash
cd apps/mobile
npm test
npm run typecheck
npm run lint
```

Expected: all green again. Skip this re-run only if Step 2 found nothing to fix.

- [ ] **Step 4: Visual check in the simulator**

Use the `run` skill (or `cd apps/mobile && npm run dev`) to launch the app and manually check, on at least one simulator:
- All 4 tabs (Parking, Vehicles, Sessions, Account) plus Login/Register render correctly.
- The floating tab bar is frosted/translucent, not solid charcoal, and its icons/labels stay legible.
- The hero surfaces (active session banner, recommendation/assignment card, reservation summary) show a visible blur/frost effect with legible text.
- The ambient background blobs are visible but subtle — they don't wash out list content or reduce contrast on any card, badge, or button.
- Nothing else changed visually (list cards, inputs, buttons still look as before).

This is a manual/visual judgment step — it can't be fully automated; call it out explicitly as done (or not) rather than inferring success from the test suite alone.

- [ ] **Step 5: Confirm no feature regressions**

Exercise, in the simulator or via the existing test suite, that every existing flow still works end-to-end (login, viewing zones, accepting a recommendation, reserving a zone, viewing sessions, managing vehicles) — this redesign must not have altered any of them.
