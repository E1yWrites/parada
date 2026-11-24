import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MapPicker } from "@/components/MapPicker";
import ZoneDetailPage from "@/app/(app)/zones/[id]/page";
import { api } from "@/lib/api/client";
import type { AdminZoneDetail } from "@/lib/api/types";

/**
 * Leaflet needs a real layout engine, so these tests drive a stand-in that
 * records what the picker asks of it and lets a test fire the map's click and
 * the pin's dragend the way Leaflet would.
 */
type Handler = (event?: unknown) => void;
const mockMapHandlers: Record<string, Handler> = {};
const mockMarkerHandlers: Record<string, Handler> = {};
const mockTileHandlers: Record<string, Handler> = {};
interface FakeMarker {
  on: jest.Mock;
  addTo: jest.Mock;
  setLatLng: jest.Mock;
  getLatLng: jest.Mock;
  remove: jest.Mock;
}
interface FakeMap {
  on: jest.Mock;
  remove: jest.Mock;
  getBounds: jest.Mock;
  panTo: jest.Mock;
}
const mockMarker: FakeMarker = {
  on: jest.fn((name: string, handler: Handler) => {
    mockMarkerHandlers[name] = handler;
    return mockMarker;
  }),
  addTo: jest.fn(() => mockMarker),
  setLatLng: jest.fn(),
  getLatLng: jest.fn(),
  remove: jest.fn(),
};
const mockMapInstance: FakeMap = {
  on: jest.fn((name: string, handler: Handler) => {
    mockMapHandlers[name] = handler;
    return mockMapInstance;
  }),
  remove: jest.fn(),
  getBounds: jest.fn(() => ({ contains: () => true })),
  panTo: jest.fn(),
};
jest.mock("leaflet", () => ({
  map: jest.fn(() => mockMapInstance),
  tileLayer: jest.fn(() => ({
    on: jest.fn((name: string, handler: Handler) => {
      mockTileHandlers[name] = handler;
    }),
    addTo: jest.fn(),
  })),
  control: { layers: jest.fn(() => ({ addTo: jest.fn() })) },
  marker: jest.fn(() => mockMarker),
  divIcon: jest.fn(() => ({})),
  latLng: (lat: number, lng: number) => ({ lat, lng }),
}));

jest.mock("next/navigation", () => ({ useParams: () => ({ id: "z1" }) }));
jest.mock("@/lib/api/client", () => ({
  api: { zones: jest.fn(), updateZone: jest.fn(), zoneSlots: jest.fn(), setZoneSlots: jest.fn(), history: jest.fn() },
  ApiError: jest.requireActual("@/lib/api/client").ApiError,
}));

const leaflet = require("leaflet") as Record<string, jest.Mock> & { control: { layers: jest.Mock } };
const mockedApi = api as unknown as Record<string, jest.Mock>;

beforeEach(() => {
  jest.clearAllMocks();
  for (const handlers of [mockMapHandlers, mockMarkerHandlers, mockTileHandlers]) {
    for (const key of Object.keys(handlers)) delete handlers[key];
  }
});

const PIN = { lat: 13.76447, lng: 121.06462 };

describe("MapPicker", () => {
  it("opens close in on the zone's pin and shows a draggable pin there", async () => {
    render(<MapPicker id="m" label="Directions target map" value={PIN} fallbackCenter={null} onPick={jest.fn()} />);

    await waitFor(() => expect(leaflet.map).toHaveBeenCalled());
    expect(leaflet.map.mock.calls[0][1]).toMatchObject({ center: PIN, zoom: 18 });
    await waitFor(() => expect(leaflet.marker).toHaveBeenCalledWith(PIN, expect.objectContaining({ draggable: true })));
    expect(screen.getByRole("region", { name: "Directions target map" })).toBeInTheDocument();
  });

  it("opens on another zone's pin with no pin of its own when the zone has none", async () => {
    render(<MapPicker id="m" label="Map" value={null} fallbackCenter={PIN} onPick={jest.fn()} />);

    await waitFor(() => expect(leaflet.map).toHaveBeenCalled());
    expect(leaflet.map.mock.calls[0][1]).toMatchObject({ center: PIN, zoom: 18 });
    expect(leaflet.marker).not.toHaveBeenCalled();
  });

  it("shows the whole map instead of guessing a place when nothing is configured", async () => {
    render(<MapPicker id="m" label="Map" value={null} fallbackCenter={null} onPick={jest.fn()} />);

    await waitFor(() => expect(leaflet.map).toHaveBeenCalled());
    expect(leaflet.map.mock.calls[0][1]).toMatchObject({ zoom: 2 });
  });

  it("offers satellite and street basemaps with their attribution", async () => {
    render(<MapPicker id="m" label="Map" value={null} fallbackCenter={null} onPick={jest.fn()} />);

    await waitFor(() => expect(leaflet.control.layers).toHaveBeenCalled());
    expect(Object.keys(leaflet.control.layers.mock.calls[0][0])).toEqual(["Satellite", "Streets"]);
    for (const [, options] of leaflet.tileLayer.mock.calls) {
      expect(options.attribution).toBeTruthy();
    }
  });

  it("a click on the map reports the point, rounded for the fields", async () => {
    const onPick = jest.fn();
    render(<MapPicker id="m" label="Map" value={null} fallbackCenter={PIN} onPick={onPick} />);
    await waitFor(() => expect(mockMapHandlers.click).toBeDefined());

    act(() => mockMapHandlers.click({ latlng: { lat: 13.764881234567, lng: 121.065012345678 } }));

    expect(onPick).toHaveBeenCalledWith("13.764881", "121.065012");
  });

  it("dragging the pin reports where it was dropped", async () => {
    const onPick = jest.fn();
    render(<MapPicker id="m" label="Map" value={PIN} fallbackCenter={null} onPick={onPick} />);
    await waitFor(() => expect(mockMarkerHandlers.dragend).toBeDefined());

    mockMarker.getLatLng.mockReturnValue({ lat: 13.7651, lng: 121.0649 });
    act(() => mockMarkerHandlers.dragend());

    expect(onPick).toHaveBeenCalledWith("13.7651", "121.0649");
  });

  it("follows typed coordinates and removes the pin when they are cleared or invalid", async () => {
    const { rerender } = render(<MapPicker id="m" label="Map" value={PIN} fallbackCenter={null} onPick={jest.fn()} />);
    await waitFor(() => expect(leaflet.marker).toHaveBeenCalledTimes(1));

    mockMapInstance.getBounds.mockReturnValueOnce({ contains: () => false });
    rerender(<MapPicker id="m" label="Map" value={{ lat: 14.5, lng: 121 }} fallbackCenter={null} onPick={jest.fn()} />);
    await waitFor(() => expect(mockMarker.setLatLng).toHaveBeenCalledWith({ lat: 14.5, lng: 121 }));
    expect(mockMapInstance.panTo).toHaveBeenCalledWith({ lat: 14.5, lng: 121 });
    expect(leaflet.marker).toHaveBeenCalledTimes(1);

    rerender(<MapPicker id="m" label="Map" value={null} fallbackCenter={null} onPick={jest.fn()} />);
    await waitFor(() => expect(mockMarker.remove).toHaveBeenCalled());
  });

  it("falls back to typing when the map cannot load", async () => {
    leaflet.map.mockImplementationOnce(() => {
      throw new Error("no layout");
    });
    render(<MapPicker id="m" label="Map" value={PIN} fallbackCenter={null} onPick={jest.fn()} />);

    expect(await screen.findByRole("status")).toHaveTextContent("The map could not load. Type the latitude and longitude instead.");
  });

  it("says so when map tiles fail, e.g. without internet", async () => {
    render(<MapPicker id="m" label="Map" value={PIN} fallbackCenter={null} onPick={jest.fn()} />);
    await waitFor(() => expect(mockTileHandlers.tileerror).toBeDefined());

    act(() => mockTileHandlers.tileerror());

    expect(screen.getByRole("status")).toHaveTextContent(/map tiles could not load/);
  });

  it("removes the map when unmounted", async () => {
    const { unmount } = render(<MapPicker id="m" label="Map" value={null} fallbackCenter={null} onPick={jest.fn()} />);
    await waitFor(() => expect(leaflet.map).toHaveBeenCalled());

    unmount();

    expect(mockMapInstance.remove).toHaveBeenCalled();
  });
});

describe("Zone detail — placing the Directions target on the map", () => {
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

  beforeEach(() => {
    mockedApi.zoneSlots.mockResolvedValue([]);
    mockedApi.history.mockResolvedValue({
      zone: { id: "z1", name: "Main Loop", code: "A", capacity: 30 },
      from: null,
      to: null,
      limit: 30,
      entries: [],
    });
  });

  it("a map click fills the coordinate fields and Save sends that point", async () => {
    mockedApi.zones.mockResolvedValue([zone]);
    mockedApi.updateZone.mockResolvedValue({ ...zone, navigationLat: 13.76505, navigationLng: 121.06489 });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ZoneDetailPage />
      </QueryClientProvider>
    );

    expect(await screen.findByRole("region", { name: "Directions target map" })).toBeInTheDocument();
    await waitFor(() => expect(mockMapHandlers.click).toBeDefined());
    act(() => mockMapHandlers.click({ latlng: { lat: 13.76505, lng: 121.06489 } }));

    expect(screen.getByLabelText("Navigation latitude")).toHaveValue("13.76505");
    expect(screen.getByLabelText("Navigation longitude")).toHaveValue("121.06489");
    await waitFor(() => expect(mockMarker.setLatLng).toHaveBeenCalledWith({ lat: 13.76505, lng: 121.06489 }));

    fireEvent.click(screen.getByRole("button", { name: "Save zone" }));
    await waitFor(() =>
      expect(mockedApi.updateZone).toHaveBeenCalledWith(
        "z1",
        expect.objectContaining({ navigationLat: 13.76505, navigationLng: 121.06489 })
      )
    );
  });
});
