import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DashboardPage from "@/app/(app)/page";
import { api } from "@/lib/api/client";
import type { AdminAnomaly, AdminDashboard } from "@/lib/api/types";

jest.mock("@/lib/api/client", () => ({
  api: { dashboard: jest.fn() },
  ApiError: jest.requireActual("@/lib/api/client").ApiError,
}));
jest.mock("next/link", () => {
  return ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>;
});
const mockedApi = api as unknown as Record<string, jest.Mock>;

const anomaly = (over: Partial<AdminAnomaly>): AdminAnomaly => ({
  id: "an1",
  occupancyEventId: null,
  cameraId: null,
  vehicleId: null,
  detectedPlate: "ABC123",
  anomalyType: "UNREGISTERED_PLATE",
  description: null,
  resolved: false,
  createdAt: "2026-09-26T02:00:00.000Z",
  zoneId: "z1",
  zoneCode: "A",
  cameraIdentifier: "CAM-A01",
  eventType: "ENTRY",
  source: "CAMERA",
  ...over,
});

function dashboard(over: Partial<AdminDashboard> = {}): AdminDashboard {
  return {
    summary: {
      totalZones: 1,
      totalCapacity: 30,
      totalOccupied: 10,
      totalAvailable: 20,
      occupancyPct: 33,
      activeSessions: 10,
      onlineCameras: 2,
      offlineCameras: 1,
    },
    zones: [],
    lowZones: [],
    fullZones: [],
    recentEvents: [],
    recentAnomalies: [],
    recentNotifications: [],
    trend: [],
    ...over,
  };
}

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DashboardPage />
    </QueryClientProvider>
  );

describe("Admin dashboard — honest status copy", () => {
  it("reports cameras as enabled (an admin switch), never online or healthy", async () => {
    mockedApi.dashboard.mockResolvedValue(dashboard());
    renderPage();
    expect(await screen.findByText("Cameras enabled")).toBeInTheDocument();
    expect(screen.getByText("2/3")).toBeInTheDocument();
    expect(screen.getByText(/1 disabled/)).toBeInTheDocument();
    expect(screen.queryByText(/online|pipeline health|vision pipeline/i)).not.toBeInTheDocument();
  });

  it("calls the alert feed Recent alerts and marks resolved anomalies", async () => {
    mockedApi.dashboard.mockResolvedValue(
      dashboard({
        recentAnomalies: [
          anomaly({ id: "open", anomalyType: "UNREGISTERED_PLATE", resolved: false }),
          anomaly({ id: "done", anomalyType: "DUPLICATE_SESSION", resolved: true, createdAt: "2026-09-26T01:00:00.000Z" }),
        ],
      })
    );
    renderPage();
    expect(await screen.findByText("Recent alerts")).toBeInTheDocument();
    expect(screen.queryByText(/live alerts/i)).not.toBeInTheDocument();
    // Human labels from ANOMALY_LABEL, not raw enums.
    expect(screen.getByText("Unknown Plate in Zone A")).toBeInTheDocument();
    expect(screen.getByText("Duplicate Session in Zone A")).toBeInTheDocument();
    expect(screen.getAllByText(/· Resolved/)).toHaveLength(1);
  });

  it("says No recent alerts (not 'No active alerts') when the feed is empty", async () => {
    mockedApi.dashboard.mockResolvedValue(dashboard());
    renderPage();
    expect(await screen.findByText("No recent alerts.")).toBeInTheDocument();
  });

  it("makes no real-time claim; shows when the data was last updated", async () => {
    mockedApi.dashboard.mockResolvedValue(dashboard());
    renderPage();
    expect(await screen.findByText(/^Updated /)).toBeInTheDocument();
    expect(screen.queryByText(/real-time/i)).not.toBeInTheDocument();
  });
});
