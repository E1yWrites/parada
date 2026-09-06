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
