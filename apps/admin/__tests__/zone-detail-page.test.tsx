import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ZoneDetailPage from "@/app/(app)/zones/[id]/page";
import { api } from "@/lib/api/client";
import type { AdminZoneDetail } from "@/lib/api/types";

jest.mock("next/navigation", () => ({ useParams: () => ({ id: "z1" }) }));
jest.mock("@/lib/api/client", () => ({
  api: { zones: jest.fn(), updateZone: jest.fn(), zoneSlots: jest.fn(), setZoneSlots: jest.fn(), history: jest.fn() },
  ApiError: jest.requireActual("@/lib/api/client").ApiError,
}));
const mockedApi = api as unknown as Record<string, jest.Mock>;

const zone: AdminZoneDetail = {
  id: "z1",
  name: "Main Loop",
  code: "A",
  description: null,
  capacity: 30,
  occupiedCount: 3,
  availableCount: 27,
  occupancyPct: 10,
  status: "ACTIVE",
  availability: "AVAILABLE",
  navigationLat: 13.76447,
  navigationLng: 121.06462,
  cameras: [],
  entryCamera: null,
  exitCamera: null,
  physicalInventory: { total: 30, active: 30 },
};

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ZoneDetailPage />
    </QueryClientProvider>
  );

describe("Admin zone detail — navigation coordinates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.zoneSlots.mockResolvedValue([]);
    mockedApi.history.mockResolvedValue({
      zone: { id: "z1", name: "Main Loop", code: "A", capacity: 30 },
      from: null,
      to: null,
      limit: 30,
      entries: [],
    });
  });

  it("shows the configured directions target and lets the admin move it", async () => {
    mockedApi.zones.mockResolvedValue([zone]);
    mockedApi.updateZone.mockResolvedValue({ ...zone, navigationLat: 13.7678, navigationLng: 121.0627 });
    renderPage();

    expect(await screen.findByTestId("zone-navigation-summary")).toHaveTextContent("Directions target: 13.76447, 121.06462");
    expect(screen.getByLabelText("Navigation latitude")).toHaveValue("13.76447");

    fireEvent.change(screen.getByLabelText("Navigation latitude"), { target: { value: "13.7678" } });
    fireEvent.change(screen.getByLabelText("Navigation longitude"), { target: { value: "121.0627" } });
    fireEvent.click(screen.getByRole("button", { name: /save zone/i }));

    await waitFor(() =>
      expect(mockedApi.updateZone).toHaveBeenCalledWith(
        "z1",
        expect.objectContaining({ navigationLat: 13.7678, navigationLng: 121.0627 })
      )
    );
    expect(await screen.findByText("Zone saved.")).toBeInTheDocument();
  });

  it("clears both coordinates (null pair) and explains that Directions are disabled", async () => {
    mockedApi.zones.mockResolvedValue([{ ...zone, navigationLat: null, navigationLng: null }]);
    mockedApi.updateZone.mockResolvedValue({ ...zone, navigationLat: null, navigationLng: null });
    renderPage();
    expect(await screen.findByTestId("zone-navigation-summary")).toHaveTextContent(/not configured/);
    fireEvent.click(screen.getByRole("button", { name: /save zone/i }));
    await waitFor(() =>
      expect(mockedApi.updateZone).toHaveBeenCalledWith(
        "z1",
        expect.objectContaining({ navigationLat: null, navigationLng: null })
      )
    );
  });

  it("surfaces the server's coordinate validation error", async () => {
    mockedApi.zones.mockResolvedValue([zone]);
    const { ApiError } = jest.requireActual("@/lib/api/client");
    mockedApi.updateZone.mockRejectedValue(
      new ApiError("UNPROCESSABLE", "'navigationLng' must be a number between -180 and 180.", 422)
    );
    renderPage();
    await screen.findByLabelText("Navigation longitude");
    fireEvent.change(screen.getByLabelText("Navigation longitude"), { target: { value: "121.5" } });
    fireEvent.click(screen.getByRole("button", { name: /save zone/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/between -180 and 180/);
  });
});
