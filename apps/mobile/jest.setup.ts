jest.mock("expo-router");

jest.mock("expo-location");

jest.mock("expo-file-system");

jest.mock("expo-font", () => ({
  useFonts: () => [true, undefined],
  isLoaded: () => true,
  loadAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-blur", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    BlurView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    __reset: () => store.clear(),
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

// Deterministic wall-clock rendering for date helpers in jsdom.
process.env.TZ = "UTC";