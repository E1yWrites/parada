# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

(Expo / React Native app shipped to iOS and Android from one codebase. One PARADA design language across both OSes; safe areas, haptics, keyboard behavior and the maps hand-off follow each platform. Shared product truth lives in the repository root `PRODUCT.md`.)

## Users

Drivers at the PARADA facility, on their own phone, usually one-handed and outdoors. See root `PRODUCT.md`.

## Capabilities and Constraints

- Screens: onboarding, login, register, verify email, first-run tutorial (add vehicle), Now (current state), Zones (zone rail, assignment, reservation, vehicle choice), zone detail, History (activity charts, sessions, reservations), Account, Vehicles (primary vehicle), payments, profile, password, notifications, violations list and detail (appeal). In-app pop-ups: notification banner, parked / session-ended sheets, action toasts.
- Navigation: Expo Router; four tabs (Now, Zones, History, Account — files `parking`, `park`, `sessions`, `account`) plus stack screens.
- Fonts loaded: Inter 400/500/600/700 only (Space Grotesk and JetBrains Mono packages are still installed but unused). Icons: Ionicons. Blur: expo-blur (real blur on iOS; Android cards are opaque until a BlurTargetView is wired). Drawing: react-native-svg (wave grid, charts). No expo-linear-gradient, no reanimated usage (it is installed but has no jest mocks set up; core Animated is used).
- Design: "Clear" — see root `DESIGN.md`.
- Tests pin test IDs and copy strings; keep them.
