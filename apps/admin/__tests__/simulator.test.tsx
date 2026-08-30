import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SimulatorPage from "@/app/(app)/simulator/page";
import * as ReactQuery from "@tanstack/react-query";
import * as apiClient from "@/lib/api/client";

jest.mock("@tanstack/react-query", () => {
  const actual = jest.requireActual("@tanstack/react-query");
  return { ...actual, useQuery: jest.fn(), useMutation: jest.fn(), useQueryClient: jest.fn() };
});

jest.mock("@/lib/api/client", () => ({
  api: {
    zones: jest.fn(),
    simulatorStatus: jest.fn(),
    simulatorRun: jest.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(public code: string, message: string, public status: number) {
      super(message);
    }
  },
}));

const mockUseQuery = ReactQuery.useQuery as jest.Mock;
const mockUseMutation = ReactQuery.useMutation as jest.Mock;
const mockUseQueryClient = ReactQuery.useQueryClient as jest.Mock;

class FakeQueryClient {
  invalidateQueries = jest.fn();
}

describe("Simulator", () => {
  let capturedRun: { mutationFn: () => Promise<{ scenario: string }>; onSuccess: (d: { scenario: string }) => void };
  const queryClient = new FakeQueryClient();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQueryClient.mockReturnValue(queryClient);
    (apiClient.api.simulatorRun as jest.Mock).mockResolvedValue({
      scenario: "FILL_ZONE",
      zone: { id: "z1", code: "A", capacity: 20 },
      events: [],
      rejects: [],
      occupancy: { occupiedCount: 5, availableCount: 15 },
    });
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === "zones") {
        return {
          status: "success",
          data: [{ id: "z1", name: "Zone A", code: "A", capacity: 20, availableCount: 20, occupiedCount: 0, occupancyPct: 0, status: "ACTIVE", availability: "AVAILABLE", description: null, cameras: [], entryCamera: null, exitCamera: null }],
        };
      }
      return {
        status: "success",
        data: { runs: 1, eventsProcessed: 5, lastRunAt: null, scenarios: ["FILL_ZONE"] },
      };
    });
    const successData = {
      scenario: "SINGLE_ENTRY",
      zone: { id: "z1", code: "A", capacity: 20 },
      events: [{}, {}, {}, {}, {}],
      rejects: [],
      occupancy: { occupiedCount: 5, availableCount: 15 },
    };
    mockUseMutation.mockImplementation((opts) => {
      capturedRun = opts as typeof capturedRun;
      const mutate = jest.fn(() => {
        const result = opts.mutationFn();
        if (result instanceof Promise) {
          result.then((data) => opts.onSuccess?.(data as never));
        } else {
          opts.onSuccess?.(result as never);
        }
      });
      return {
        mutate,
        isPending: false,
        isError: false,
        error: null,
        isSuccess: true,
        data: successData,
      };
    });
  });

  it("is clearly labeled as simulation/demo", async () => {
    render(<SimulatorPage />);
    expect(await screen.findByText("SIMULATION / DEMO.")).toBeInTheDocument();
  });

  it("submits the selected scenario through the API when run is clicked", async () => {
    const user = userEvent.setup();
    render(<SimulatorPage />);
    // Select FILL_ZONE scenario (already default? default is SINGLE_ENTRY).
    await user.selectOptions(screen.getByLabelText("Scenario"), "FILL_ZONE");
    await user.click(screen.getByRole("button", { name: "Run simulation" }));

    const payload = capturedRun.mutationFn();
    await expect(payload).resolves.toMatchObject({ scenario: "FILL_ZONE" });
    expect(apiClient.api.simulatorRun).toHaveBeenCalledWith(
      expect.objectContaining({ scenario: "FILL_ZONE" })
    );
  });

  it("invalidates relevant queries after a successful run", async () => {
    const user = userEvent.setup();
    render(<SimulatorPage />);
    await user.selectOptions(screen.getByLabelText("Scenario"), "FILL_ZONE");
    await user.click(screen.getByRole("button", { name: "Run simulation" }));

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard"] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["zones"] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["sessions"] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["notifications"] });
  });
});
