import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import UsersPage from "@/app/(app)/users/page";
import { api } from "@/lib/api/client";

jest.mock("@/lib/api/client", () => ({
  api: { users: jest.fn() },
  avatarSrc: () => null,
}));

const mockedApi = api as unknown as Record<string, jest.Mock>;

describe("Users page", () => {
  it("shows the Joined column as a date with the year, not a bare time", async () => {
    mockedApi.users.mockResolvedValue([
      {
        id: "u1",
        name: "Alex Driver",
        email: "alex@parada.test",
        username: null,
        phone: null,
        role: "USER",
        status: "ACTIVE",
        createdAt: "2025-03-14T10:31:22.000Z",
        _count: { vehicles: 1, sessions: 2, violations: 0 },
      },
    ]);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <UsersPage />
      </QueryClientProvider>
    );
    expect(await screen.findByText("Alex Driver")).toBeInTheDocument();
    expect(screen.getByText(/2025/)).toBeInTheDocument();
  });
});
