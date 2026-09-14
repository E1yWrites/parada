# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

(Expo / React Native app shipped to iOS and Android from one codebase. One PARADA design language across both OSes; safe areas, haptics, keyboard behavior and the maps hand-off follow each platform. Shared product truth lives in the repository root `PRODUCT.md`.)

## Users

Drivers at the PARADA facility, on their own phone, usually one-handed and outdoors. See root `PRODUCT.md`.

## Capabilities and Constraints

- Screens: onboarding, login, register, Parking (current state, recommendation, zones, assignment, reservation), zone detail, Vehicles, Sessions, Account, notifications, violations list and detail (appeal).
- Navigation: Expo Router; four tabs (Parking, Vehicles, Sessions, Account) plus stack screens.
- Fonts already bundled: Nunito 400–900, JetBrains Mono 400/500/700. Icons: Ionicons. Blur: expo-blur. No react-native-svg, no expo-linear-gradient.
- Tests pin test IDs and copy strings; keep them.
