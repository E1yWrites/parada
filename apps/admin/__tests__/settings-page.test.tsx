import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SettingsPage from "@/app/(app)/settings/page";
import { api } from "@/lib/api/client";
import type { EstablishmentSettings } from "@/lib/api/types";

jest.mock("@/lib/api/client", () => ({
  api: { config: jest.fn(), updateConfig: jest.fn(), zones: jest.fn() },
  ApiError: jest.requireActual("@/lib/api/client").ApiError,
}));
const mockedApi = api as unknown as Record<string, jest.Mock>;

const settings: EstablishmentSettings = {
  parkingFee: { baseFee: 20, baseDurationHours: 2, additionalFeePerHour: 10 },
  guestPolicy: { policy: "PRIMARY_ZONE", primaryZoneId: null },
  zoneDefaults: { maxReservationDurationMinutes: 15, occupancyLowThreshold: 0.2 },
  violations: [{ type: "WRONG_ZONE", fineAmount: 100, description: "Wrong zone." }],
  location: null,
};

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SettingsPage />
    </QueryClientProvider>
  );

describe("Admin settings page — establishment location (mobile navigation destination)", () => {
  beforeEach(() => {
    mockedApi.zones.mockResolvedValue([]);
  });

  it("saves an address + coordinates as the `location` the API and mobile app already contract on", async () => {
    mockedApi.config.mockResolvedValue(settings);
    mockedApi.updateConfig.mockImplementation(async (payload: EstablishmentSettings) => payload);
    renderPage();

    const address = await screen.findByLabelText("Address");
    fireEvent.change(address, { target: { value: "LPU Batangas" } });
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "13.7565" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "121.0583" } });
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => expect(mockedApi.updateConfig).toHaveBeenCalledTimes(1));
    expect(mockedApi.updateConfig.mock.calls[0][0]).toMatchObject({
      location: { address: "LPU Batangas", latitude: 13.7565, longitude: 121.0583 },
      parkingFee: settings.parkingFee,
      violations: settings.violations,
    });
    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
  });

  it("shows the configured destination and clears it when the address is blanked", async () => {
    mockedApi.config.mockResolvedValue({ ...settings, location: { address: "Main Gate", latitude: 13.7, longitude: 121.05 } });
    mockedApi.updateConfig.mockImplementation(async (payload: EstablishmentSettings) => payload);
    renderPage();

    expect(await screen.findByDisplayValue("Main Gate")).toBeInTheDocument();
    expect(screen.getByDisplayValue("13.7")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => expect(mockedApi.updateConfig).toHaveBeenCalledTimes(1));
    expect(mockedApi.updateConfig.mock.calls[0][0].location).toBeNull();
  });

  it("rejects an address without usable coordinates before calling the API", async () => {
    mockedApi.config.mockResolvedValue(settings);
    renderPage();

    // Out-of-range values are already stopped by the inputs' min/max; a
    // missing coordinate is the case only the submit handler can catch.
    fireEvent.change(await screen.findByLabelText("Address"), { target: { value: "Somewhere" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "121" } });
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/latitude/i);
    expect(mockedApi.updateConfig).not.toHaveBeenCalled();
  });
});
