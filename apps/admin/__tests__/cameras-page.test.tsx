import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CamerasPage from "@/app/(app)/cameras/page";
import { api } from "@/lib/api/client";
import type { AdminCamera, AdminZoneDetail } from "@/lib/api/types";

jest.mock("@/lib/api/client", () => ({
  api: { cameras: jest.fn(), zones: jest.fn(), createCamera: jest.fn(), updateCamera: jest.fn() },
  ApiError: jest.requireActual("@/lib/api/client").ApiError,
}));
const mockedApi = api as unknown as Record<string, jest.Mock>;

const zone: AdminZoneDetail = {
  id: "z1",
  name: "Zone A",
  code: "A",
  description: null,
  capacity: 30,
  occupiedCount: 0,
  availableCount: 30,
  occupancyPct: 0,
  status: "ACTIVE",
  availability: "AVAILABLE",
  navigationLat: null,
  navigationLng: null,
  cameras: [],
  entryCamera: null,
  exitCamera: null,
  physicalInventory: { total: 0, active: 0 },
};

const camera: AdminCamera = {
  id: "c1",
  identifier: "CAM-A01",
  name: "Zone A Entry gate",
  location: "North gate",
  gateType: "ENTRY",
  status: "ONLINE",
  zone: { id: "z1", name: "Zone A", code: "A" },
  recentEvents: [],
};

const zoneSelect = () => screen.getAllByRole("combobox")[0];
const gateSelect = () => screen.getAllByRole("combobox")[1];

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CamerasPage />
    </QueryClientProvider>
  );

describe("Admin cameras page — Phase 11A configuration", () => {
  it("lists registered cameras with zone, gate direction and status", async () => {
    mockedApi.cameras.mockResolvedValue([camera]);
    mockedApi.zones.mockResolvedValue([zone]);
    renderPage();
    expect(await screen.findByText("CAM-A01")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("Entry")).toBeInTheDocument();
    // ONLINE is an admin on/off switch, not a health signal: it reads "Enabled".
    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(screen.queryByText(/online|health/i)).not.toBeInTheDocument();
  });

  it("labels a switched-off camera Disabled, never Offline", async () => {
    mockedApi.cameras.mockResolvedValue([{ ...camera, status: "OFFLINE" }]);
    mockedApi.zones.mockResolvedValue([zone]);
    renderPage();
    expect(await screen.findByText("CAM-A01")).toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
  });

  it("shows an empty state when no cameras are configured", async () => {
    mockedApi.cameras.mockResolvedValue([]);
    mockedApi.zones.mockResolvedValue([zone]);
    renderPage();
    expect(await screen.findByText("No cameras configured.")).toBeInTheDocument();
  });

  it("registers a camera bound to a zone with direction and status", async () => {
    mockedApi.cameras.mockResolvedValue([]);
    mockedApi.zones.mockResolvedValue([zone]);
    mockedApi.createCamera.mockResolvedValue({ ...camera, id: "c2" });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /register camera/i }));
    fireEvent.change(screen.getByPlaceholderText("CAM-A01"), { target: { value: "CAM-A02" } });
    fireEvent.change(zoneSelect(), { target: { value: "z1" } });
    fireEvent.click(screen.getByRole("button", { name: /register camera$/i }));

    await waitFor(() => {
      expect(mockedApi.createCamera).toHaveBeenCalledWith(
        expect.objectContaining({
          zoneId: "z1",
          identifier: "CAM-A02",
          gateType: "BIDIRECTIONAL",
          status: "ONLINE",
        })
      );
    });
  });

  it("edits a camera's zone and direction while keeping the identifier immutable", async () => {
    const otherZone: AdminZoneDetail = { ...zone, id: "z2", name: "Zone B", code: "B" };
    mockedApi.cameras.mockResolvedValue([camera]);
    mockedApi.zones.mockResolvedValue([zone, otherZone]);
    mockedApi.updateCamera.mockResolvedValue({ ...camera, zone: { id: "z2", name: "Zone B", code: "B" }, gateType: "EXIT" });
    renderPage();

    fireEvent.click(await screen.findByText("Edit"));
    expect(await screen.findByDisplayValue("CAM-A01")).toBeDisabled();
    fireEvent.change(zoneSelect(), { target: { value: "z2" } });
    fireEvent.change(gateSelect(), { target: { value: "EXIT" } });
    fireEvent.click(screen.getByRole("button", { name: /save camera/i }));

    await waitFor(() => {
      expect(mockedApi.updateCamera).toHaveBeenCalledWith(
        "c1",
        expect.objectContaining({ zoneId: "z2", gateType: "EXIT" })
      );
    });
  });

  it("disables an ONLINE camera (confirmation) and enables an OFFLINE one (no confirm)", async () => {
    const offline: AdminCamera = { ...camera, id: "c2", identifier: "CAM-B01", status: "OFFLINE" };
    mockedApi.cameras.mockResolvedValue([camera, offline]);
    mockedApi.zones.mockResolvedValue([zone]);
    const confirm = jest.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    const disableButtons = await screen.findAllByText("Disable");
    fireEvent.click(disableButtons[0]!.closest("button")!);
    await waitFor(() => {
      expect(mockedApi.updateCamera).toHaveBeenCalledWith("c1", { status: "OFFLINE" });
    });
    expect(confirm).toHaveBeenCalled();

    mockedApi.updateCamera.mockClear();
    fireEvent.click(screen.getByText("Enable").closest("button")!);
    await waitFor(() => {
      expect(mockedApi.updateCamera).toHaveBeenCalledWith("c2", { status: "ONLINE" });
    });
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});