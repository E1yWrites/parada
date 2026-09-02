import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** True when the platform prefers reduced motion (disables pulsing UI). */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value: boolean) => {
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