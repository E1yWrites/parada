import { render, screen } from "@testing-library/react";
import DashboardPage from "@/app/(app)/page";
import * as ReactQuery from "@tanstack/react-query";

jest.mock("@tanstack/react-query", () => {
  const actual = jest.requireActual("@tanstack/react-query");
  return { ...actual, useQuery: jest.fn() };
});

jest.mock("next/link", () => {
  const MockLink = ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
  MockLink.displayName = "MockLink";
  return MockLink;
});

const mockUseQuery = ReactQuery.useQuery as jest.Mock;

function zone(code: string, availability: string, occupied: number, capacity: number) {
  return {
    id: `z-${code}`,
    name: `Zone ${code}`,
    code,
    description: null,
    capacity,
    occupiedCount: occupied,
    availableCount: capacity - occupied,
    occupancyPct: Math.round((occupied / capacity) * 100),
    status: "ACTIVE",
    availability,
  };
}

function fullData() {
  return {
    summary: {
      totalZones: 1,
      totalCapacity: 20,
      totalOccupied: 20,
      totalAvailable: 0,
      occupancyPct: 100,
      activeSessions: 4,
      onlineCameras: 2,
      offlineCameras: 0,
    },
    zones: [zone("A", "FULL", 20, 20)],
    lowZones: [],
    fullZones: [zone("A", "FULL", 20, 20)],
    recentEvents: [],
    recentAnomalies: [],
    recentNotifications: [],
  };
}

function mockQuery(status: string, data?: unknown, error?: unknown) {
  mockUseQuery.mockReturnValue({ status, data, error, isLoading: status === "pending" });
}

describe("Dashboard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("displays the backend occupancy summary", () => {
    mockQuery("success", fullData());
    render(<DashboardPage />);
    expect(screen.getByText("Parking Overview")).toBeInTheDocument();
    // Unique stat labels are always rendered by the StatCard components.
    for (const label of ["Capacity", "Occupied", "Available", "Occupancy", "Active Sessions", "Cameras Online", "Total Zones"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // Occupancy is rendered as a percentage string; it may appear in cards and zone rows.
    expect(screen.getAllByText("100%").length).toBeGreaterThanOrEqual(1);
  });

  it("shows FULL status when the backend reports a zone is FULL", () => {
    mockQuery("success", fullData());
    render(<DashboardPage />);
    expect(screen.getByText("FULL")).toBeInTheDocument();
    expect(screen.queryByText("LOW AVAILABILITY")).not.toBeInTheDocument();
  });

  it("shows LOW AVAILABILITY when the backend reports LOW", () => {
    mockQuery(
      "success",
      {
        ...fullData(),
        zones: [zone("A", "LOW_AVAILABILITY", 17, 20)],
        lowZones: [zone("A", "LOW_AVAILABILITY", 17, 20)],
        fullZones: [],
        summary: {
          totalZones: 1,
          totalCapacity: 20,
          totalOccupied: 17,
          totalAvailable: 3,
          occupancyPct: 85,
          activeSessions: 4,
          onlineCameras: 2,
          offlineCameras: 0,
        },
      }
    );
    render(<DashboardPage />);
    expect(screen.getByText("LOW AVAILABILITY")).toBeInTheDocument();
    expect(screen.queryByText("FULL")).not.toBeInTheDocument();
  });

  it("renders an error state when the request fails", () => {
    mockQuery("error", undefined, new Error("Unable to load parking data."));
    render(<DashboardPage />);
    expect(screen.getByText("Unable to load parking data.")).toBeInTheDocument();
  });

  it("renders a loading state while pending", () => {
    mockQuery("pending");
    render(<DashboardPage />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
