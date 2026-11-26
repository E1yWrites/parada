import { Linking } from "react-native";
import { fireEvent, waitFor } from "@testing-library/react-native";
import { render, screen } from "@/src/test/utils";
import * as LocationMock from "expo-location";
import { NavigateButton } from "@/src/components/NavigateButton";

type LocationModule = typeof LocationMock & {
  __reset: () => void;
  __setPermission: (result: { granted: boolean; canAskAgain: boolean; status?: string }) => void;
  __rejectPermission: (err: unknown) => void;
  __setPosition: (coords: { latitude: number; longitude: number }) => void;
  __rejectPosition: (err: unknown) => void;
};

const DESTINATION = { label: "PARADA Parking", latitude: 14.5502, longitude: 121.0402 };
const CURRENT = { latitude: 14.5995, longitude: 120.9842 };

async function renderButton(destination: typeof DESTINATION | null = DESTINATION) {
  await render(
    <NavigateButton destination={destination} label="Navigate to assigned zone" testID="nav" />,
  );
  return screen;
}

beforeEach(() => {
  jest.clearAllMocks();
  (LocationMock as LocationModule).__reset();
  jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
  jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
  jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
});

describe("NavigateButton: no destination", () => {
  it("disables navigation and explains why (no fake destination)", async () => {
    await renderButton(null);
    const button = screen.getByTestId("nav");
    expect(button).toBeDisabled();
    expect(screen.getByTestId("nav-unavailable")).toHaveTextContent(
      "Navigation isn't available right now.",
    );
  });
});

describe("NavigateButton: permission granted", () => {
  it("opens navigation to the real destination from the real current position", async () => {
    (LocationMock as LocationModule).__setPermission({ granted: true, canAskAgain: true });
    (LocationMock as LocationModule).__setPosition(CURRENT);
    await renderButton();

    // The in-flight label is covered by the next test, which holds openURL open;
    // here every mock resolves inside the awaited press (RNTL 14).
    await fireEvent.press(screen.getByTestId("nav"));

    await waitFor(() =>
      expect(Linking.openURL).toHaveBeenCalledWith(
        expect.stringContaining("maps://?saddr=14.5995,120.9842&daddr=14.5502,121.0402"),
      ),
    );
  });

  it("shows a single loading presentation while getting the location (no duplicate caption)", async () => {
    (LocationMock as LocationModule).__setPermission({ granted: true, canAskAgain: true });
    (LocationMock as LocationModule).__setPosition(CURRENT);
    let resolveOpen!: () => void;
    jest.spyOn(Linking, "openURL").mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveOpen = resolve;
      }),
    );
    await renderButton();

    await fireEvent.press(screen.getByTestId("nav"));

    // While the launch is in flight the button itself carries the load state
    // (title + spinner)…
    await waitFor(() =>
      expect(screen.getByTestId("nav")).toHaveTextContent("Getting your location…"),
    );
    expect(screen.getByTestId("button-spinner")).toBeOnTheScreen();
    // …and no competing caption is rendered beneath it.
    expect(screen.queryByTestId("nav-loading")).not.toBeOnTheScreen();

    resolveOpen();
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalled());
  });

  it("returns to idle after a successful launch", async () => {
    (LocationMock as LocationModule).__setPermission({ granted: true, canAskAgain: true });
    (LocationMock as LocationModule).__setPosition(CURRENT);
    await renderButton();
    await fireEvent.press(screen.getByTestId("nav"));

    await waitFor(() => expect(Linking.openURL).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId("nav")).toHaveTextContent("Navigate to assigned zone"),
    );
  });

  it("shows a friendly unavailable message when the position fetch fails", async () => {
    (LocationMock as LocationModule).__setPermission({ granted: true, canAskAgain: true });
    (LocationMock as LocationModule).__rejectPosition(new Error("Unavailable: 2"));
    await renderButton();
    await fireEvent.press(screen.getByTestId("nav"));

    await waitFor(() =>
      expect(screen.getByTestId("nav-unavailable")).toHaveTextContent(
        "We couldn't determine your location.",
      ),
    );
    expect(screen.getByTestId("nav-unavailable")).toHaveProp("accessibilityRole", "alert");
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it("shows a friendly message when the navigation app can't be opened", async () => {
    (LocationMock as LocationModule).__setPermission({ granted: true, canAskAgain: true });
    (LocationMock as LocationModule).__setPosition(CURRENT);
    jest.spyOn(Linking, "canOpenURL").mockResolvedValue(false);
    await renderButton();
    await fireEvent.press(screen.getByTestId("nav"));

    await waitFor(() =>
      expect(screen.getByTestId("nav-open-failed")).toHaveTextContent(
        "Unable to open navigation. Please try again.",
      ),
    );
    expect(screen.getByTestId("nav-open-failed")).toHaveProp("accessibilityRole", "alert");
  });
});

describe("NavigateButton: permission denied", () => {
  it("shows the denied guidance and an Open Settings action when permanent", async () => {
    (LocationMock as LocationModule).__setPermission({ granted: false, canAskAgain: false });
    await renderButton();
    await fireEvent.press(screen.getByTestId("nav"));

    await waitFor(() =>
      expect(screen.getByTestId("nav-denied-message")).toHaveTextContent(
        "Location permission is required for navigation.",
      ),
    );
    expect(screen.getByTestId("nav-denied-message")).toHaveProp("accessibilityRole", "alert");
    await fireEvent.press(screen.getByTestId("nav-open-settings"));
    expect(Linking.openSettings).toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it("allows a retry without looping when denial can still be re-asked", async () => {
    (LocationMock as LocationModule).__setPermission({ granted: false, canAskAgain: true });
    await renderButton();
    await fireEvent.press(screen.getByTestId("nav"));

    await waitFor(() =>
      expect(screen.getByTestId("nav-denied-message")).toHaveTextContent(
        "Location permission is required for navigation.",
      ),
    );
    expect(LocationMock.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("nav-open-settings")).not.toBeOnTheScreen();
  });

  it("degrades gracefully when the permission prompt fails", async () => {
    (LocationMock as LocationModule).__rejectPermission(new Error("native prompt failed"));
    await renderButton();
    await fireEvent.press(screen.getByTestId("nav"));

    await waitFor(() =>
      expect(screen.getByTestId("nav-denied-message")).toHaveTextContent(
        "Location permission is required for navigation.",
      ),
    );
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});