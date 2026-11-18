import { fireEvent, render, screen } from "@testing-library/react";
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

// UAT 2026-11-17 (A3): admins could not find a vehicle by plate here.
describe("Sessions page plate search", () => {
  const session = (id: string, plate: string, name: string, zone: string) => ({
    id, userId: `u-${id}`, vehicleId: `v-${id}`, status: "COMPLETED", enteredAt: "2026-11-17T01:00:00.000Z",
    exitedAt: "2026-11-17T02:00:00.000Z", durationSeconds: 3600,
    user: { id: `u-${id}`, name, email: `${id}@test.local` },
    vehicle: { id: `v-${id}`, plateNumber: plate, vehicleType: "CAR" },
    zone: { id: `z-${zone}`, name: `Zone ${zone}`, code: zone },
  });

  async function renderPage() {
    mockedApi.sessions.mockResolvedValue([
      session("s1", "ABC-1234", "Driver User", "A"),
      session("s2", "TUV 777", "UAT Driver", "B"),
    ]);
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SessionsPage /></QueryClientProvider>);
    await screen.findByText("ABC-1234");
    return screen.getByRole("searchbox", { name: "Search sessions by plate, owner or zone" });
  }

  it("is titled Sessions, the same name as its navigation link", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Sessions" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Vehicles" })).not.toBeInTheDocument();
  });

  it.each([["abc1234"], ["ABC 1234"], ["abc-12"], ["1234"]])("finds ABC-1234 when searching %p", async (q) => {
    const search = await renderPage();
    fireEvent.change(search, { target: { value: q } });
    expect(screen.getByText("ABC-1234")).toBeInTheDocument();
    expect(screen.queryByText("TUV 777")).not.toBeInTheDocument();
    expect(screen.getByText("1 shown")).toBeInTheDocument();
  });

  it("finds a plate stored with a space when searching with a dash", async () => {
    const search = await renderPage();
    fireEvent.change(search, { target: { value: "tuv-777" } });
    expect(screen.getByText("TUV 777")).toBeInTheDocument();
    expect(screen.queryByText("ABC-1234")).not.toBeInTheDocument();
  });

  it("does not match every plate on a punctuation-only query", async () => {
    const search = await renderPage();
    fireEvent.change(search, { target: { value: "-" } });
    expect(screen.getByText("No sessions match your search.")).toBeInTheDocument();
  });

  it("still searches by owner and zone", async () => {
    const search = await renderPage();
    fireEvent.change(search, { target: { value: "uat" } });
    expect(screen.getByText("TUV 777")).toBeInTheDocument();
    expect(screen.queryByText("ABC-1234")).not.toBeInTheDocument();
  });
});
