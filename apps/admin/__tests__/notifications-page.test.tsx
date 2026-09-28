import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NotificationsPage from "@/app/(app)/notifications/page";
import { api } from "@/lib/api/client";

jest.mock("@/lib/api/client", () => ({
  api: {
    notifications: jest.fn(),
    markNotificationRead: jest.fn(),
  },
}));

const mockedApi = api as unknown as Record<string, jest.Mock>;

function renderPage(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationsPage />
    </QueryClientProvider>
  );
}

const unread = {
  id: "n1",
  zoneId: "z1",
  type: "ZONE_FULL",
  message: "Zone A is full (20/20).",
  targetRole: "ADMIN",
  read: false,
  createdAt: "2026-09-01T10:00:00.000Z",
  zone: { id: "z1", name: "Zone A", code: "A" },
};

const read = { ...unread, id: "n2", type: "ZONE_LOW_AVAILABILITY", message: "Zone B is low.", read: true };

describe("Notifications page — mark-read flow", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockedApi.notifications.mockResolvedValue({ notifications: [unread, read], unreadCount: 1 });
    mockedApi.markNotificationRead.mockResolvedValue({});
  });

  it("renders notifications with read state and an unread count", async () => {
    renderPage(queryClient);
    expect(await screen.findByText("Zone A is full (20/20).")).toBeInTheDocument();
    expect(screen.getByText("Zone B is low.")).toBeInTheDocument();
    expect(screen.getByText("UNREAD").parentElement).toHaveTextContent("1");
  });

  it("marks a notification read by calling the backend and invalidating caches", async () => {
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");
    renderPage(queryClient);
    fireEvent.click(await screen.findByRole("button", { name: /mark read/i }));

    await waitFor(() => expect(mockedApi.markNotificationRead).toHaveBeenCalledWith("n1"));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["notifications"] }))
    );
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["dashboard"] }));
  });

  it("marks all unread notifications read without touching already-read ones", async () => {
    renderPage(queryClient);
    await screen.findByText("Zone A is full (20/20).");
    const markAll = screen.getByRole("button", { name: /mark all read/i });
    await waitFor(() => expect(markAll).toBeEnabled());
    fireEvent.click(markAll);

    await waitFor(() => expect(mockedApi.markNotificationRead).toHaveBeenCalledTimes(1));
    expect(mockedApi.markNotificationRead).toHaveBeenCalledWith("n1");
    expect(mockedApi.markNotificationRead).not.toHaveBeenCalledWith("n2");
  });

  it("shows mutation errors", async () => {
    mockedApi.markNotificationRead.mockRejectedValue(new Error("Notification service unavailable."));
    renderPage(queryClient);
    fireEvent.click(await screen.findByRole("button", { name: /mark read/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Notification service unavailable.");
  });
});
describe("Notifications page — empty state", () => {
  it("shows an icon, not a mascot image, when there are no notifications", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockedApi.notifications.mockResolvedValue({ notifications: [], unreadCount: 0 });
    const { container } = renderPage(queryClient);
    expect(await screen.findByText("No notifications.")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
