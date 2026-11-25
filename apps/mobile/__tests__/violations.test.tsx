import { __router, useLocalSearchParams } from "expo-router";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/src/test/utils";
import ViolationsScreen from "@/app/violations/index";
import ViolationDetailScreen from "@/app/violations/[id]";
import { api, ApiError } from "@/lib/api/client";
import type { ViolationResponse } from "@parada/types";

jest.mock("@/lib/api/client", () => {
  const actual = jest.requireActual("@/lib/api/client");
  return {
    ...actual,
    api: {
      violations: jest.fn(),
      appealViolation: jest.fn(),
    },
  };
});

const zone = { id: "z2", name: "Zone C", code: "C" };
const vehicle = { id: "veh1", plateNumber: "NDW-4471", vehicleType: "CAR" as const };

const violation = (over: Partial<ViolationResponse>): ViolationResponse => ({
  id: "v1",
  userId: "u1",
  vehicleId: "veh1",
  zoneId: "z2",
  sessionId: null,
  violationType: "WRONG_ZONE",
  description: "Entered a zone other than the assigned zone 'A' after 2 warning(s).",
  fineAmount: 500,
  status: "PENDING",
  issuedAt: "2026-09-03T08:14:00.000Z",
  createdAt: "2026-09-03T08:14:00.000Z",
  updatedAt: "2026-09-03T08:14:00.000Z",
  zone,
  vehicle,
  appeal: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("violations list screen", () => {
  it("lists violations with fine and status", async () => {
    (api.violations as jest.Mock).mockResolvedValue([violation({})]);
    await renderWithProviders(<ViolationsScreen />);

    expect(await screen.findByText("Zone C")).toBeOnTheScreen();
    expect(screen.getByText("NDW-4471")).toBeOnTheScreen();
    expect(screen.getByText("₱500.00")).toBeOnTheScreen();
    expect(screen.getByText("Pending")).toBeOnTheScreen();
  });

  it("shows an empty state with no violations", async () => {
    (api.violations as jest.Mock).mockResolvedValue([]);
    await renderWithProviders(<ViolationsScreen />);

    expect(await screen.findByText("No violations")).toBeOnTheScreen();
  });

  it("navigates to the detail screen on tap", async () => {
    (api.violations as jest.Mock).mockResolvedValue([violation({})]);
    await renderWithProviders(<ViolationsScreen />);

    await fireEvent.press(await screen.findByTestId("violation-v1"));
    expect(__router.push).toHaveBeenCalledWith("/violations/v1");
  });
});

describe("violation detail screen", () => {
  beforeEach(() => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: "v1" });
  });

  it("shows a not-found state for an unknown id", async () => {
    (api.violations as jest.Mock).mockResolvedValue([violation({ id: "other" })]);
    await renderWithProviders(<ViolationDetailScreen />);

    expect(await screen.findByText("Violation not found")).toBeOnTheScreen();
  });

  it("shows the appeal form for a pending, unappealed violation", async () => {
    (api.violations as jest.Mock).mockResolvedValue([violation({})]);
    await renderWithProviders(<ViolationDetailScreen />);

    expect(await screen.findByTestId("violation-appeal-form")).toBeOnTheScreen();
    expect(screen.getByText("NDW-4471")).toBeOnTheScreen();
  });

  it("submits an appeal and refreshes the violation", async () => {
    (api.violations as jest.Mock)
      .mockResolvedValueOnce([violation({})])
      .mockResolvedValueOnce([
        violation({
          status: "APPEALED",
          appeal: { id: "ap1", status: "PENDING", reason: "It was a mistake.", reviewedAt: null, createdAt: "2026-09-04T09:00:00.000Z" },
        }),
      ]);
    (api.appealViolation as jest.Mock).mockResolvedValue({
      id: "ap1",
      violationId: "v1",
      userId: "u1",
      reason: "It was a mistake.",
      status: "PENDING",
      reviewedBy: null,
      reviewedAt: null,
      createdAt: "2026-09-04T09:00:00.000Z",
      updatedAt: "2026-09-04T09:00:00.000Z",
    });

    await renderWithProviders(<ViolationDetailScreen />);

    await fireEvent.changeText(await screen.findByTestId("violation-appeal-reason"), "It was a mistake.");
    await fireEvent.press(screen.getByTestId("violation-appeal-submit"));

    await waitFor(() => expect(api.appealViolation).toHaveBeenCalledWith("v1", "It was a mistake."));
    expect(await screen.findByTestId("violation-appeal-pending")).toBeOnTheScreen();
  });

  it("keeps the fine amount on one line, shrinking at large text sizes", async () => {
    await renderWithProviders(<ViolationDetailScreen />);
    const amount = await screen.findByTestId("violation-fine-amount");
    expect(amount.props.numberOfLines).toBe(1);
    expect(amount.props.adjustsFontSizeToFit).toBe(true);
  });

  it("disables submit until a reason is entered", async () => {
    (api.violations as jest.Mock).mockResolvedValue([violation({})]);
    await renderWithProviders(<ViolationDetailScreen />);

    await fireEvent.press(await screen.findByTestId("violation-appeal-submit"));
    expect(api.appealViolation).not.toHaveBeenCalled();
  });

  it("shows the outcome once an appeal is resolved", async () => {
    (api.violations as jest.Mock).mockResolvedValue([
      violation({
        status: "DISMISSED",
        appeal: {
          id: "ap1",
          status: "APPROVED",
          reason: "It was a mistake.",
          reviewedAt: "2026-09-05T09:00:00.000Z",
          createdAt: "2026-09-04T09:00:00.000Z",
        },
      }),
    ]);
    await renderWithProviders(<ViolationDetailScreen />);

    expect(await screen.findByText("Appeal approved")).toBeOnTheScreen();
    expect(screen.getByText("Dismissed")).toBeOnTheScreen();
  });

  it("surfaces an appeal submission error inline", async () => {
    (api.violations as jest.Mock).mockResolvedValue([violation({})]);
    (api.appealViolation as jest.Mock).mockRejectedValue(
      new ApiError("CONFLICT", "This violation has already been appealed.", 409),
    );
    await renderWithProviders(<ViolationDetailScreen />);

    await fireEvent.changeText(await screen.findByTestId("violation-appeal-reason"), "Reason text");
    await fireEvent.press(screen.getByTestId("violation-appeal-submit"));

    await waitFor(() =>
      expect(screen.getByText("This violation has already been appealed.")).toBeOnTheScreen(),
    );
    expect(screen.getByTestId("violation-appeal-error")).toHaveProp("accessibilityRole", "alert");
  });
});
