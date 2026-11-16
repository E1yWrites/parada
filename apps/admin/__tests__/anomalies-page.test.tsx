import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AnomaliesPage from "@/app/(app)/anomalies/page";
import { api } from "@/lib/api/client";

jest.mock("@/lib/api/client", () => ({
  api: { anomalies: jest.fn(), resolveAnomaly: jest.fn() },
  ApiError: class ApiError extends Error {},
}));

const mockedApi = api as unknown as Record<string, jest.Mock>;

const row = (id: string, resolved: boolean) => ({
  id,
  occupancyEventId: `e-${id}`,
  cameraId: null,
  vehicleId: null,
  detectedPlate: "ABC1234",
  anomalyType: "UNREGISTERED_PLATE",
  description: null,
  resolved,
  createdAt: "2026-09-26T00:00:00.000Z",
  zoneId: "z1",
  zoneCode: "A",
  cameraIdentifier: null,
  eventType: "ENTRY",
  source: "CAMERA",
});

describe("Anomalies page — resolve", () => {
  it("offers Resolve only on unresolved rows and calls resolveAnomaly", async () => {
    mockedApi.anomalies.mockResolvedValue([row("open1", false), row("done1", true)]);
    mockedApi.resolveAnomaly.mockResolvedValue(row("open1", true));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AnomaliesPage />
      </QueryClientProvider>
    );

    const button = await screen.findByRole("button", { name: "Resolve anomaly open1" });
    expect(screen.queryByRole("button", { name: "Resolve anomaly done1" })).not.toBeInTheDocument();
    fireEvent.click(button);
    await waitFor(() => expect(mockedApi.resolveAnomaly).toHaveBeenCalledWith("open1"));
  });
});
