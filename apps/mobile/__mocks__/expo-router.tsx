import type { ReactNode } from "react";
import { Text, View } from "react-native";

/** Shared router singleton so tests can assert navigation calls. */
export const __router = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(),
};

export function useRouter() {
  return __router;
}

export function useSegments(): string[] {
  return [];
}

export function usePathname(): string {
  return "/";
}

/** jest.fn() (not a plain function) so dynamic-route tests can override params
 *  per test via `(useLocalSearchParams as jest.Mock).mockReturnValue(...)`. */
export const useLocalSearchParams = jest.fn((): Record<string, string | string[]> => ({}));

export function Redirect({ href }: { href: string }) {
  return <View testID={`redirect-${href}`} />;
}

export function Link({
  href,
  children,
  testID,
}: {
  href: string;
  children?: ReactNode;
  testID?: string;
}) {
  return <View testID={testID ?? `link-${href}`}>{children}</View>;
}

export function Tabs({ children }: { children?: ReactNode }) {
  return <View testID="tabs">{children}</View>;
}

Tabs.Screen = function TabScreen({
  options,
}: {
  options?: { title?: string; tabBarAccessibilityLabel?: string };
}) {
  const label = options?.tabBarAccessibilityLabel ?? options?.title ?? "";
  return <Text accessibilityLabel={options?.tabBarAccessibilityLabel}>{label}</Text>;
};

export function Stack({ children }: { children?: ReactNode }) {
  return <View testID="stack">{children}</View>;
}

Stack.Screen = function TabScreenPlaceholder() {
  return null;
};

export const Slot = ({ children }: { children?: ReactNode }) => <View testID="slot">{children}</View>;