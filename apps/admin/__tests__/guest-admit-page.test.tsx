import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import GuestAdmissionPage from "@/app/(app)/guest-admit/page";
import { api } from "@/lib/api/client";

jest.mock("@/lib/api/client", () => ({ api: { zones: jest.fn(), cameras: jest.fn(), guestAdmit: jest.fn() } }));
const mockedApi = api as unknown as Record<string, jest.Mock>;

function renderPage() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><GuestAdmissionPage /></QueryClientProvider>);
}

describe("Guest admission page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.zones.mockResolvedValue([{ id: "z1", code: "A", name: "Zone A" }]);
    mockedApi.cameras.mockResolvedValue([{ id: "c1", identifier: "cam-entry", gateType: "ENTRY", zone: { id: "z1" } }]);
    mockedApi.guestAdmit.mockResolvedValue({ id: "e1", admitted: true, deniedReason: null, newOccupied: 1, guestSessionId: "g1" });
  });

  it("validates required fields and submits the ADMIN override", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Admit guest" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("required");
    fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "z1" } });
    fireEvent.change(screen.getByLabelText("Entry camera"), { target: { value: "cam-entry" } });
    fireEvent.change(screen.getByLabelText("Detected plate"), { target: { value: "GUEST-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Admit guest" }));
    await waitFor(() => expect(mockedApi.guestAdmit).toHaveBeenCalledWith({ zoneId: "z1", cameraIdentifier: "cam-entry", sourceEventId: expect.stringMatching(/^admin-guest-/), detectedPlate: "GUEST-1" }));
    expect(await screen.findByText("Guest admitted")).toBeInTheDocument();
    expect(screen.queryByLabelText("Source event ID")).not.toBeInTheDocument();
  });

  it("sends a different event id for each successful admission", async () => {
    renderPage();
    await screen.findByRole("option", { name: /Zone A/ });
    fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "z1" } });
    await screen.findByRole("option", { name: /cam-entry/ });
    fireEvent.change(screen.getByLabelText("Entry camera"), { target: { value: "cam-entry" } });
    fireEvent.change(screen.getByLabelText("Detected plate"), { target: { value: "GUEST-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Admit guest" }));
    await waitFor(() => expect(mockedApi.guestAdmit).toHaveBeenCalledTimes(1));
    await screen.findByText("Guest admitted");
    fireEvent.click(screen.getByRole("button", { name: "Admit guest" }));
    await waitFor(() => expect(mockedApi.guestAdmit).toHaveBeenCalledTimes(2));
    const [first, second] = mockedApi.guestAdmit.mock.calls.map((c) => c[0].sourceEventId);
    expect(first).not.toBe(second);
  });
});
