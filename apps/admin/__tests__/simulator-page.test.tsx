import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SimulatorPage from "@/app/(app)/simulator/page";
import { api } from "@/lib/api/client";

jest.mock("@/lib/api/client", () => {
  const { ApiError } = jest.requireActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ApiError,
    api: {
      simulatorStatus: jest.fn(),
      zones: jest.fn(),
      vehicles: jest.fn(),
      simulatorRun: jest.fn(),
    },
  };
});

const { ApiError } = jest.requireActual<typeof import("@/lib/api/client")>("@/lib/api/client");
const mockedApi = api as unknown as Record<string, jest.Mock>;

function renderPage(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <SimulatorPage />
    </QueryClientProvider>
  );
}

const zone = { id: "z1", name: "Zone A", code: "A", capacity: 20 };
const vehicle = { id: "v1", plateNumber: "ABC-1234", vehicleType: "CAR" };

const status = {
  runs: 3,
  eventsProcessed: 9,
  lastRunAt: "2026-09-01T10:00:00.000Z",
  scenarios: [
    "SINGLE_ENTRY",
    "SINGLE_EXIT",
    "MULTIPLE_ENTRIES",
    "MULTIPLE_EXITS",
    "FILL_ZONE",
    "UNKNOWN_VEHICLE",
    "DUPLICATE_EVENT",
    "COMPLETE_PARKING_LIFECYCLE",
  ],
};

const result = {
  scenario: "SINGLE_ENTRY",
  zone: { id: "z1", name: "Zone A", code: "A", capacity: 20 },
  events: [{ kind: "ENTRY", event: { detectedPlate: "ABC-1234" } }],
  rejects: [{ sourceEventId: "sim-A-entry-1-1", message: "Zone 'A' is already full." }],
  occupancy: { occupiedCount: 20, availableCount: 0 },
};

describe("Simulator page — drives the real backend", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockedApi.simulatorStatus.mockResolvedValue(status);
    mockedApi.zones.mockResolvedValue([zone]);
    mockedApi.vehicles.mockResolvedValue([vehicle]);
  });

  it("runs a scenario through the API client with the selected zone and registered vehicles", async () => {
    mockedApi.simulatorRun.mockResolvedValue(result);
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    renderPage(queryClient);
    await screen.findByText("Will use 1 registered active vehicles.");
    fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "z1" } });
    fireEvent.click(screen.getByRole("button", { name: /run simulator/i }));

    await waitFor(() =>
      expect(mockedApi.simulatorRun).toHaveBeenCalledWith({
        scenario: "SINGLE_ENTRY",
        zoneId: "z1",
        vehicleIds: ["v1"],
        fillTo: undefined,
        unknownPlate: undefined,
      })
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["dashboard"] }))
    );
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["simulator-status"] }));
  });

  it("displays the resulting occupancy and any real rejections from the backend", async () => {
    mockedApi.simulatorRun.mockResolvedValue(result);
    renderPage(queryClient);
    fireEvent.click(await screen.findByRole("button", { name: /run simulator/i }));

    expect(await screen.findByText("Zone 'A' is already full.")).toBeInTheDocument();
    expect(screen.getByText("sim-A-entry-1-1")).toBeInTheDocument();
    expect(screen.getAllByText("20").length).toBeGreaterThan(0);
    expect(screen.getByText("Rejections (1)")).toBeInTheDocument();
  });

  it("surfaces a failed scenario run as an error instead of faking success", async () => {
    mockedApi.simulatorRun.mockRejectedValue(
      new ApiError("CONFLICT", "Duplicate camera event for sourceEventId 'sim-A-entry-9-1'.", 409)
    );
    renderPage(queryClient);
    fireEvent.click(await screen.findByRole("button", { name: /run simulator/i }));

    expect(
      await screen.findByText("Duplicate camera event for sourceEventId 'sim-A-entry-9-1'.")
    ).toBeInTheDocument();
  });
});