import { fireEvent, renderWithProviders, screen, waitFor } from "@/src/test/utils";
import NotificationsScreen from "@/app/notifications";
import { api, ApiError } from "@/lib/api/client";
import type { NotificationResponse } from "@parada/types";

jest.mock("@/lib/api/client", () => {
  const actual = jest.requireActual("@/lib/api/client");
  return {
    ...actual,
    api: {
      notifications: jest.fn(),
      markNotificationRead: jest.fn(),
    },
  };
});

const zone = { id: "z1", name: "Zone A", code: "A" };

const base = (over: Partial<NotificationResponse>): NotificationResponse => ({
  id: "n1",
  zoneId: "z1",
  type: "WRONG_ZONE_WARNING",
  message: "You entered Zone C — you're assigned Zone A.",
  read: false,
  createdAt: "2026-09-06T10:00:00.000Z",
  zone,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  (api.markNotificationRead as jest.Mock).mockResolvedValue({ id: "n1", read: true });
});

describe("notifications screen", () => {
  it("groups notifications into Today and Earlier", async () => {
    const justNow = new Date(Date.now() - 60_000).toISOString();
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    (api.notifications as jest.Mock).mockResolvedValue({
      notifications: [
        base({ id: "n1", createdAt: justNow, message: "Today's alert" }),
        base({ id: "n2", createdAt: tenDaysAgo, message: "Older alert", type: "VIOLATION_ISSUED" }),
      ],
      unreadCount: 1,
    });

    renderWithProviders(<NotificationsScreen />);

    expect(await screen.findByText("TODAY")).toBeOnTheScreen();
    expect(screen.getByText("EARLIER")).toBeOnTheScreen();
    expect(screen.getByText("Today's alert")).toBeOnTheScreen();
    expect(screen.getByText("Older alert")).toBeOnTheScreen();
  });

  it("shows an empty state with no notifications", async () => {
    (api.notifications as jest.Mock).mockResolvedValue({ notifications: [], unreadCount: 0 });
    renderWithProviders(<NotificationsScreen />);

    expect(await screen.findByText("No notifications yet")).toBeOnTheScreen();
  });

  it("shows an error state and retries", async () => {
    (api.notifications as jest.Mock)
      .mockRejectedValueOnce(new ApiError("NETWORK", "Cannot reach the PARADA server.", 0))
      .mockResolvedValueOnce({ notifications: [], unreadCount: 0 });
    renderWithProviders(<NotificationsScreen />);

    expect(await screen.findByText("Cannot reach the PARADA server.")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("notifications-error-retry"));
    await waitFor(() => expect(screen.getByText("No notifications yet")).toBeOnTheScreen());
  });

  it("marks an unread notification as read on tap", async () => {
    (api.notifications as jest.Mock).mockResolvedValue({
      notifications: [base({ id: "n1", read: false })],
      unreadCount: 1,
    });
    renderWithProviders(<NotificationsScreen />);

    fireEvent.press(await screen.findByTestId("notification-n1"));
    await waitFor(() => expect(api.markNotificationRead).toHaveBeenCalledWith("n1"));
  });

  it("does not re-mark an already-read notification", async () => {
    (api.notifications as jest.Mock).mockResolvedValue({
      notifications: [base({ id: "n1", read: true })],
      unreadCount: 0,
    });
    renderWithProviders(<NotificationsScreen />);

    fireEvent.press(await screen.findByTestId("notification-n1"));
    expect(api.markNotificationRead).not.toHaveBeenCalled();
  });
});
