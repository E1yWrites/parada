import "expo-router";

/**
 * Tests import { __router } from "expo-router" but the production module has
 * no such export — it is provided by __mocks__/expo-router.tsx. This
 * augmentation keeps tsc consistent with the Jest manual mock.
 */
type RouterMock = {
  push: jest.Mock;
  replace: jest.Mock;
  back: jest.Mock;
  canGoBack: jest.Mock;
};

declare module "expo-router" {
  export const __router: RouterMock;
}