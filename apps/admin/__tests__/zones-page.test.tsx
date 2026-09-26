import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ZonesPage from "@/app/(app)/zones/page";
import { api } from "@/lib/api/client";
import type { AdminZoneDetail } from "@/lib/api/types";

jest.mock("@/lib/api/client", () => ({
  api: { zones: jest.fn(), createZone: jest.fn(), updateZone: jest.fn() },
  ApiError: jest.requireActual("@/lib/api/client").ApiError,
}));
const mockedApi = api as unknown as Record<string, jest.Mock>;

const zone: AdminZoneDetail = {
  id: "z1",
  name: "Zone A",
  code: "A",
  description: "North parking area",
  capacity: 30,
  occupiedCount: 10,
  availableCount: 20,
  occupancyPct: 33,
  status: "ACTIVE",
  availability: "AVAILABLE",
  navigationLat: null,
  navigationLng: null,
  cameras: [],
  entryCamera: null,
  exitCamera: null,
  physicalInventory: { total: 30, active: 25 },
};

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ZonesPage />
    </QueryClientProvider>
  );

describe("Admin zones page — Phase 11A configuration", () => {
  it("lists zones with authoritative capacity and physical-inventory indicator", async () => {
    mockedApi.zones.mockResolvedValue([zone]);
    renderPage();
    expect(await screen.findByText("Zone A")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("25 of 30 physical spaces active")).toBeInTheDocument();
  });

  it("shows an empty state when no zones are configured", async () => {
    mockedApi.zones.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("No parking zones yet.")).toBeInTheDocument();
  });

  it("creates a zone through the inline form", async () => {
    mockedApi.zones.mockResolvedValue([]);
    mockedApi.createZone.mockResolvedValue({ ...zone, id: "z-new", name: "Zone D", code: "D" });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /new zone/i }));
    fireEvent.change(screen.getByPlaceholderText("Zone A"), { target: { value: "Zone D" } });
    fireEvent.change(screen.getByPlaceholderText("A"), { target: { value: "D" } });
    fireEvent.change(screen.getByDisplayValue("10"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: /create zone/i }));

    await waitFor(() => {
      expect(mockedApi.createZone).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Zone D", code: "D", capacity: 40, status: "ACTIVE" })
      );
    });
  });

  it("sends the zone's navigation coordinates on create and rejects a half-filled pair locally", async () => {
    mockedApi.zones.mockResolvedValue([]);
    mockedApi.createZone.mockResolvedValue({ ...zone, id: "z-nav", navigationLat: 13.76447, navigationLng: 121.06462 });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /new zone/i }));
    fireEvent.change(screen.getByPlaceholderText("Zone A"), { target: { value: "Nav Zone" } });
    fireEvent.change(screen.getByPlaceholderText("A"), { target: { value: "N" } });
    fireEvent.change(screen.getByLabelText("Navigation latitude"), { target: { value: "13.76447" } });
    fireEvent.click(screen.getByRole("button", { name: /create zone/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/both a navigation latitude and longitude/);
    expect(mockedApi.createZone).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Navigation longitude"), { target: { value: "121.06462" } });
    fireEvent.click(screen.getByRole("button", { name: /create zone/i }));
    await waitFor(() => {
      expect(mockedApi.createZone).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Nav Zone", code: "N", navigationLat: 13.76447, navigationLng: 121.06462 })
      );
    });
  });

  it("rejects out-of-range coordinates before calling the API", async () => {
    mockedApi.zones.mockResolvedValue([]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /new zone/i }));
    fireEvent.change(screen.getByPlaceholderText("Zone A"), { target: { value: "Bad" } });
    fireEvent.change(screen.getByPlaceholderText("A"), { target: { value: "B" } });
    fireEvent.change(screen.getByLabelText("Navigation latitude"), { target: { value: "91" } });
    fireEvent.change(screen.getByLabelText("Navigation longitude"), { target: { value: "121" } });
    fireEvent.click(screen.getByRole("button", { name: /create zone/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/between -90 and 90/);
    expect(mockedApi.createZone).not.toHaveBeenCalled();
  });

  it("deactivates an active zone after confirmation", async () => {
    mockedApi.zones.mockResolvedValue([zone]);
    jest.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    fireEvent.click((await screen.findByText("Deactivate")).closest("button")!);

    await waitFor(() => {
      expect(mockedApi.updateZone).toHaveBeenCalledWith("z1", { status: "INACTIVE" });
    });
    // Success is confirmed, not silent.
    expect(await screen.findByRole("status")).toHaveTextContent("Zone A deactivated.");
  });

  it("names the zone in the toggle's accessible name and shows occupancy once", async () => {
    mockedApi.zones.mockResolvedValue([zone]);
    renderPage();
    expect(await screen.findByRole("button", { name: "Deactivate Zone A" })).toBeInTheDocument();
    // Available zones carry no status pill; the count and bar say it.
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
    expect(screen.queryByText(/available ·/)).not.toBeInTheDocument();
  });

  it("returns focus to New zone when the form closes", async () => {
    mockedApi.zones.mockResolvedValue([]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /new zone/i }));
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /new zone/i })).toHaveFocus());
  });

  it("displays validation/API errors returned by the backend", async () => {
    mockedApi.zones.mockResolvedValue([]);
    mockFailedCreate("Capacity cannot be lower than current occupancy (6).");
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /new zone/i }));
    fireEvent.change(screen.getByPlaceholderText("Zone A"), { target: { value: "Zone C" } });
    fireEvent.change(screen.getByPlaceholderText("A"), { target: { value: "C" } });
    fireEvent.click(screen.getByRole("button", { name: /create zone/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Capacity cannot be lower than current occupancy"
    );
  });
});

function mockFailedCreate(message: string) {
  const { ApiError } = jest.requireActual("@/lib/api/client");
  mockedApi.createZone.mockRejectedValue(new ApiError("CONFLICT", message, 409));
}

describe("Admin zones page — keyboard focus (found in the keyboard pass)", () => {
  it("moves focus into the new-zone form when it opens", async () => {
    mockedApi.zones.mockResolvedValue([]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /new zone/i }));
    await waitFor(() => expect(screen.getByPlaceholderText("Zone A")).toHaveFocus());
  });
});
