import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SessionsPage from "@/app/(app)/sessions/page";
import { api } from "@/lib/api/client";

jest.mock("@/lib/api/client", () => ({ api: { sessions: jest.fn() } }));
const mockedApi = api as unknown as Record<string, jest.Mock>;

describe("Sessions page guest compatibility", () => {
  it("renders an account-less guest session without crashing", async () => {
    mockedApi.sessions.mockResolvedValue([{
      id: "s1", userId: null, vehicleId: null, status: "ACTIVE", enteredAt: "2026-09-04T10:00:00.000Z", exitedAt: null, durationSeconds: null,
      user: null, vehicle: null, zone: { id: "z1", name: "Zone A", code: "A" },
    }]);
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SessionsPage /></QueryClientProvider>);
    expect(await screen.findByText("GUEST")).toBeInTheDocument();
    expect(screen.getByText("Guest session")).toBeInTheDocument();
  });
});
