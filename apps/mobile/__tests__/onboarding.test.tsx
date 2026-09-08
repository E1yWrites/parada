import { __router } from "expo-router";
import { fireEvent, renderWithProviders, screen } from "@/src/test/utils";
import OnboardingScreen from "@/app/onboarding";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("onboarding screen", () => {
  it("starts on the first slide and advances through Next", () => {
    renderWithProviders(<OnboardingScreen />);

    expect(screen.getByText("See what's open before you drive in.")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("onboarding-next"));
    expect(screen.getByText("Hold your spot.")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("onboarding-next"));
    expect(screen.getByText("Park in your assigned zone.")).toBeOnTheScreen();
  });

  it("shows 'Get started' and no Skip link on the last slide", () => {
    renderWithProviders(<OnboardingScreen />);

    fireEvent.press(screen.getByTestId("onboarding-next"));
    fireEvent.press(screen.getByTestId("onboarding-next"));

    expect(screen.getByText("Get started")).toBeOnTheScreen();
    expect(screen.queryByTestId("onboarding-skip")).toBeNull();
  });

  it("replaces to /login when Skip is pressed", () => {
    renderWithProviders(<OnboardingScreen />);

    fireEvent.press(screen.getByTestId("onboarding-skip"));
    expect(__router.replace).toHaveBeenCalledWith("/login");
  });

  it("replaces to /login when Get started is pressed on the last slide", () => {
    renderWithProviders(<OnboardingScreen />);

    fireEvent.press(screen.getByTestId("onboarding-next"));
    fireEvent.press(screen.getByTestId("onboarding-next"));
    fireEvent.press(screen.getByTestId("onboarding-next"));
    expect(__router.replace).toHaveBeenCalledWith("/login");
  });
});
