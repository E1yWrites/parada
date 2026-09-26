import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DashboardPage from "@/app/(app)/page";
import { api } from "@/lib/api/client";
import type { AdminAnomaly, AdminDashboard } from "@/lib/api/types";

jest.mock("@/lib/api/client", () => ({
  api: { dashboard: jest.fn(), unresolvedAnomalies: jest.fn(), appeals: jest.fn() },
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

beforeEach(() => {
  mockedApi.unresolvedAnomalies.mockResolvedValue([]);
  mockedApi.appeals.mockResolvedValue([]);
});

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

const zoneRow = (over: Partial<AdminDashboard["zones"][number]>) =>
  ({
    id: "z1",
    name: "Zone A",
    code: "A",
    description: null,
    capacity: 30,
    occupiedCount: 10,
    availableCount: 20,
    occupancyPct: 33,
    status: "ACTIVE",
    availability: "AVAILABLE",
    navigationLat: null,
    navigationLng: null,
    ...over,
  }) as AdminDashboard["zones"][number];

describe("Admin dashboard — needs attention (redesign)", () => {
  it("lists open anomalies, pending appeals and full zones, each linking to where it is acted on", async () => {
    const full = zoneRow({ id: "z2", name: "Zone B", code: "B", occupiedCount: 30, availableCount: 0, occupancyPct: 100, availability: "FULL" });
    mockedApi.dashboard.mockResolvedValue(dashboard({ zones: [full], fullZones: [full] }));
    mockedApi.unresolvedAnomalies.mockResolvedValue([anomaly({ id: "a1" }), anomaly({ id: "a2" })]);
    mockedApi.appeals.mockResolvedValue([
      { id: "p1", status: "PENDING" },
      { id: "p2", status: "APPROVED" },
    ]);
    renderPage();

    expect(await screen.findByRole("link", { name: /2 unresolved anomalies/ })).toHaveAttribute("href", "/anomalies");
    expect(await screen.findByRole("link", { name: /1 appeal awaiting a decision/ })).toHaveAttribute("href", "/appeals");
    expect(screen.getByRole("link", { name: /Zone B is full/ })).toHaveAttribute("href", "/zones/z2");
  });

  it("says Nothing needs attention when every source is empty", async () => {
    mockedApi.dashboard.mockResolvedValue(dashboard());
    renderPage();
    expect(await screen.findByText("Nothing needs attention.")).toBeInTheDocument();
  });

  it("reports a failed source instead of claiming nothing needs attention", async () => {
    mockedApi.dashboard.mockResolvedValue(dashboard());
    mockedApi.unresolvedAnomalies.mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByText(/Couldn't load anomalies/)).toBeInTheDocument();
  });
});

describe("Admin dashboard — one representation per figure (redesign)", () => {
  it("shows occupancy once per zone row: count and bar, status only when not Available", async () => {
    mockedApi.dashboard.mockResolvedValue(
      dashboard({
        zones: [
          zoneRow({}),
          zoneRow({ id: "z3", name: "Zone C", code: "C", occupiedCount: 28, availableCount: 2, occupancyPct: 93, availability: "LOW_AVAILABILITY" }),
        ],
      })
    );
    renderPage();
    expect(await screen.findByText("Zone A")).toBeInTheDocument();
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
    expect(screen.getByText("Few spaces")).toBeInTheDocument();
    expect(screen.queryByText(/20 available/)).not.toBeInTheDocument();
  });

  it("counts only ACTIVE zones (was 'zones reporting', counting inactive ones too)", async () => {
    mockedApi.dashboard.mockResolvedValue(
      dashboard({ zones: [zoneRow({}), zoneRow({ id: "z9", code: "Z", name: "Old lot", status: "INACTIVE", availability: "OFFLINE" })] })
    );
    renderPage();
    expect(await screen.findByText(/of 1 active zone$/)).toBeInTheDocument();
    expect(screen.queryByText(/zones reporting/)).not.toBeInTheDocument();
  });

  it("labels gate events in words, never raw enums", async () => {
    mockedApi.dashboard.mockResolvedValue(
      dashboard({
        recentEvents: [
          { id: "e1", zoneId: "z1", eventType: "ENTRY", detectedPlate: "ABC123", source: "CAMERA", detectedAt: "2026-09-26T02:00:00.000Z" },
        ],
      })
    );
    renderPage();
    expect(await screen.findByText("Entry · Camera")).toBeInTheDocument();
    expect(screen.queryByText(/ENTRY|CAMERA/)).not.toBeInTheDocument();
  });
});
