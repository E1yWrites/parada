import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ViolationsPage from "@/app/(app)/violations/page";
import { api } from "@/lib/api/client";
import type { AdminViolation } from "@/lib/api/types";

jest.mock("@/lib/api/client", () => ({
  api: { violations: jest.fn(), updateViolationStatus: jest.fn() },
  ApiError: jest.requireActual("@/lib/api/client").ApiError,
}));
const mockedApi = api as unknown as Record<string, jest.Mock>;

const violation: AdminViolation = {
  id: "v1",
  userId: "u1",
  vehicleId: "car1",
  zoneId: "z1",
  sessionId: null,
  violationType: "WRONG_ZONE",
  description: "Parked in a zone other than the assigned one.",
  fineAmount: 100,
  status: "PENDING",
  issuedAt: "2026-09-26T02:00:00.000Z",
  createdAt: "2026-09-26T02:00:00.000Z",
  user: { id: "u1", name: "Alex Driver", email: "alex@parada.test" },
  vehicle: { id: "car1", plateNumber: "ABC123", vehicleType: "CAR" },
  zone: { id: "z1", name: "Zone A", code: "A" },
  session: null,
  appeal: null,
};

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ViolationsPage />
    </QueryClientProvider>
  );

describe("Admin violations page — redesign", () => {
  it("shows the violation type as a human label, never the raw enum", async () => {
    mockedApi.violations.mockResolvedValue([violation]);
    renderPage();
    expect(await screen.findByText("Wrong zone")).toBeInTheDocument();
    expect(screen.queryByText("WRONG_ZONE")).not.toBeInTheDocument();
  });

  it("names the row in the Dismiss action's accessible name", async () => {
    mockedApi.violations.mockResolvedValue([violation]);
    renderPage();
    expect(await screen.findByRole("button", { name: "Dismiss wrong zone violation for ABC123" })).toBeInTheDocument();
  });

  it("confirms a dismissal with a status message after the backend accepts it", async () => {
    mockedApi.violations.mockResolvedValue([violation]);
    mockedApi.updateViolationStatus.mockResolvedValue({ ...violation, status: "DISMISSED" });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /dismiss/i }));
    await waitFor(() => expect(mockedApi.updateViolationStatus).toHaveBeenCalledWith("v1", "DISMISSED"));
    expect(await screen.findByRole("status")).toHaveTextContent("Violation for ABC123 dismissed.");
  });

  it("shows no success message when the backend refuses", async () => {
    const { ApiError } = jest.requireActual("@/lib/api/client");
    mockedApi.violations.mockResolvedValue([violation]);
    mockedApi.updateViolationStatus.mockRejectedValue(new ApiError("CONFLICT", "Already resolved.", 409));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /dismiss/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Already resolved.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
