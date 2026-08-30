import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationsPage from "@/app/(app)/notifications/page";
import * as ReactQuery from "@tanstack/react-query";
import * as apiClient from "@/lib/api/client";

jest.mock("@tanstack/react-query", () => {
  const actual = jest.requireActual("@tanstack/react-query");
  return { ...actual, useQuery: jest.fn(), useMutation: jest.fn(), useQueryClient: jest.fn() };
});

jest.mock("@/lib/api/client", () => {
  class ApiError extends Error {
    constructor(public code: string, message: string, public status: number) {
      super(message);
    }
  }
  return {
    api: {
      notifications: jest.fn(),
      markNotificationRead: jest.fn(),
      dashboard: jest.fn(),
    },
    ApiError,
  };
});

const mockUseQuery = ReactQuery.useQuery as jest.Mock;
const mockUseMutation = ReactQuery.useMutation as jest.Mock;
const mockUseQueryClient = ReactQuery.useQueryClient as jest.Mock;

class FakeQueryClient {
  invalidateQueries = jest.fn();
}

describe("Notifications", () => {
  const queryClient = new FakeQueryClient();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQueryClient.mockReturnValue(queryClient);
    (apiClient.api.markNotificationRead as jest.Mock).mockResolvedValue({ id: "n1", read: true });
    mockUseMutation.mockImplementation((opts) => {
      const mutate = jest.fn((id: string) => {
        opts.mutationFn?.(id);
        opts.onSuccess?.({ id, read: true });
      });
      return { mutate, isPending: false, isError: false, error: null, isSuccess: true, data: { id: "n1", read: true } };
    });
  });

  const notificationsData = {
    notifications: [
      { id: "n1", zoneId: "z1", type: "ZONE_FULL", message: "Zone A is FULL (20/20 occupied).", targetRole: "ADMIN", read: false, createdAt: "2026-08-30T10:00:00Z", zone: { id: "z1", name: "Zone A", code: "A" } },
    ],
    unreadCount: 1,
  };

  it("renders unread notifications and the unread count", () => {
    mockUseQuery.mockReturnValue({ status: "success", data: notificationsData });
    render(<NotificationsPage />);
    expect(screen.getByText("1 unread")).toBeInTheDocument();
    expect(screen.getByText("ZONE_FULL")).toBeInTheDocument();
    expect(screen.getByText("Unread")).toBeInTheDocument();
  });

  it("no unread badge when everything is read", () => {
    mockUseQuery.mockReturnValue({
      status: "success",
      data: {
        notifications: [{ ...notificationsData.notifications[0], read: true }],
        unreadCount: 0,
      },
    });
    render(<NotificationsPage />);
    expect(screen.queryByText("1 unread")).not.toBeInTheDocument();
    expect(screen.queryByText("Unread")).not.toBeInTheDocument();
  });

  it("marks a notification read via the backend mutation and refetches", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue({ status: "success", data: notificationsData });
    render(<NotificationsPage />);

    await user.click(screen.getByRole("button", { name: "Mark as read" }));

    // The button must invoke the backend read endpoint with the notification id.
    expect(apiClient.api.markNotificationRead).toHaveBeenCalledWith("n1");
    // On success the notifications + dashboard queries are invalidated.
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["notifications"] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard"] });
  });

  it("renders an empty state when there are no notifications", () => {
    mockUseQuery.mockReturnValue({ status: "success", data: { notifications: [], unreadCount: 0 } });
    render(<NotificationsPage />);
    expect(screen.getByText("No notifications.")).toBeInTheDocument();
  });
});
