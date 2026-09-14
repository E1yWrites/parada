import { Redirect } from "expo-router";

// Explicit entry route for "/".
//
// The route tree never had an `index`, so the root path resolved to Expo
// Router's generated `+not-found` ("Unmatched Route") whenever the initial
// URL was `/` — which is what Expo Go on SDK 57 launches with. Send the root
// path to the parking tab; `(tabs)/_layout` already redirects to `/login`
// while there is no session, so authenticated/unauthenticated routing is
// unchanged.
export default function Index() {
  return <Redirect href="/(tabs)/parking" />;
}
