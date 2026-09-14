import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { FullScreenLoading } from "@/src/components/FullScreenLoading";
import { isOnboardingCompleted } from "@/lib/onboarding";
import { useSession } from "@/src/providers/SessionProvider";

// Explicit entry route for "/".
//
// The route tree never had an `index`, so the root path resolved to Expo
// Router's generated `+not-found` ("Unmatched Route") whenever the initial
// URL was `/` — which is what Expo Go on SDK 57 launches with.
//
// Startup order (one decision, one redirect — no chained redirects on
// physical devices):
//   session restored  -> straight into the authenticated app
//   first installation -> onboarding (Skip/Get started record completion)
//   otherwise          -> login
// `(tabs)/_layout` still redirects to /login when the session is missing.
export default function Index() {
  const { user, isLoading } = useSession();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void isOnboardingCompleted().then((done) => {
      if (active) {
        setOnboarded(done);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (isLoading || onboarded === null) {
    return <FullScreenLoading testID="startup-loading" />;
  }
  if (user) {
    return <Redirect href="/(tabs)/parking" />;
  }
  if (!onboarded) {
    return <Redirect href="/onboarding" />;
  }
  return <Redirect href="/login" />;
}
