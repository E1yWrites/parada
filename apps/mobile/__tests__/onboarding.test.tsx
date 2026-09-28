import { __router } from "expo-router";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/src/test/utils";
import OnboardingScreen from "@/app/onboarding";
import { isOnboardingCompleted, resetOnboarding } from "@/lib/onboarding";

beforeEach(async () => {
  jest.clearAllMocks();
  await resetOnboarding();
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

  it("records completion for this installation and replaces to /login when Skip is pressed", async () => {
    renderWithProviders(<OnboardingScreen />);
    expect(await isOnboardingCompleted()).toBe(false);

    fireEvent.press(screen.getByTestId("onboarding-skip"));
    await waitFor(() => expect(__router.replace).toHaveBeenCalledWith("/login"));
    expect(await isOnboardingCompleted()).toBe(true);
  });

  it("records completion and replaces to /login when Get started is pressed on the last slide", async () => {
    renderWithProviders(<OnboardingScreen />);

    fireEvent.press(screen.getByTestId("onboarding-next"));
    fireEvent.press(screen.getByTestId("onboarding-next"));
    fireEvent.press(screen.getByTestId("onboarding-next"));
    await waitFor(() => expect(__router.replace).toHaveBeenCalledWith("/login"));
    expect(await isOnboardingCompleted()).toBe(true);
  });
});

describe("onboarding: Lottie introduces herself on slide 1 only", () => {
  it("shows Lottie and her greeting on slide 1, the topic icon on slide 2", () => {
    renderWithProviders(<OnboardingScreen />);
    expect(screen.getByTestId("onboarding-greeting")).toHaveTextContent("Hi, I'm Lottie.");
    expect(screen.getByTestId("onboarding-lottie", { includeHiddenElements: true })).toBeTruthy();

    fireEvent.press(screen.getByTestId("onboarding-next"));
    expect(screen.queryByTestId("onboarding-greeting")).toBeNull();
    expect(screen.queryByTestId("onboarding-lottie", { includeHiddenElements: true })).toBeNull();
  });
});
