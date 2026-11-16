import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SettingsPage from "@/app/(app)/settings/page";
import { ThemeProvider } from "@/components/providers/theme-provider";
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
};

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider>
        <SettingsPage />
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("Admin settings page", () => {
  beforeEach(() => {
    mockedApi.zones.mockResolvedValue([]);
    mockedApi.config.mockResolvedValue(settings);
    mockedApi.updateConfig.mockImplementation(async (payload: EstablishmentSettings) => payload);
  });

  it("has no navigation-destination form (the mobile app uses per-zone coordinates)", async () => {
    renderPage();
    await screen.findByRole("button", { name: /save settings/i });
    expect(screen.queryByLabelText("Address")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Latitude")).not.toBeInTheDocument();
    expect(screen.queryByText(/navigation destination/i)).not.toBeInTheDocument();
  });

  it("saves the remaining settings without any `location`", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /save settings/i }));

    await waitFor(() => expect(mockedApi.updateConfig).toHaveBeenCalledTimes(1));
    const payload = mockedApi.updateConfig.mock.calls[0][0];
    expect(payload).toMatchObject({ parkingFee: settings.parkingFee, violations: settings.violations });
    expect(payload).not.toHaveProperty("location");
    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
  });
});
