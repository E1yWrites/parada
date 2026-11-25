import { renderWithProviders, screen } from "@/src/test/utils";
import PaymentsScreen from "@/app/payments";
import { api } from "@/lib/api/client";

jest.mock("@/lib/api/client", () => {
  const actual = jest.requireActual("@/lib/api/client");
  return { ...actual, api: { violations: jest.fn(), sessions: jest.fn() } };
});

describe("payments screen layout", () => {
  it("keeps the outstanding balance on one line, shrinking at large text sizes", async () => {
    (api.violations as jest.Mock).mockResolvedValue([]);
    (api.sessions as jest.Mock).mockResolvedValue([]);
    await renderWithProviders(<PaymentsScreen />);
    const total = await screen.findByTestId("payments-outstanding-total");
    expect(total.props.numberOfLines).toBe(1);
    expect(total.props.adjustsFontSizeToFit).toBe(true);
  });
});

describe("payments screen copy", () => {
  it("makes no payment-history or free-window claim (neither exists)", async () => {
    (api.violations as jest.Mock).mockResolvedValue([]);
    (api.sessions as jest.Mock).mockResolvedValue([]);
    await renderWithProviders(<PaymentsScreen />);

    expect(await screen.findByTestId("payments-fees-header-caption")).toHaveTextContent(
      "Charged when a session ends, at the establishment's rates.",
    );
    expect(screen.queryByText(/free window|payment history/i)).not.toBeOnTheScreen();
  });
});

// UAT 2026-11-17 (T6): no driver could read the fee after a simulated exit.
describe("payments screen session fees", () => {
  const session = (overrides: Record<string, unknown>) => ({
    id: "s1", zoneId: "z1", userId: "u1", vehicleId: "v1", entryEventId: "e1", exitEventId: null,
    enteredAt: "2026-11-17T01:00:00.000Z", exitedAt: null, durationSeconds: null, feeAmount: null, status: "ACTIVE",
    zone: { id: "z1", name: "Zone A", code: "A" }, vehicle: { id: "v1", plateNumber: "ABC-1234", vehicleType: "CAR" },
    entryEvent: null, exitEvent: null, ...overrides,
  });

  it("leads with the fines balance, then lists a completed session's fee with its plate", async () => {
    (api.violations as jest.Mock).mockResolvedValue([]);
    (api.sessions as jest.Mock).mockResolvedValue([
      session({ status: "COMPLETED", exitedAt: "2026-11-17T01:05:00.000Z", durationSeconds: 300, feeAmount: 20 }),
    ]);
    await renderWithProviders(<PaymentsScreen />);

    expect(await screen.findByTestId("payments-fee-s1")).toHaveTextContent(/20/);
    expect(screen.getByText(/ABC-1234 · /)).toBeOnTheScreen();
    // The ₱0 card is about fines only, so it can no longer read as "no fee".
    expect(screen.getByText("Unpaid fines")).toBeOnTheScreen();
    expect(screen.queryByText(/Outstanding balance|Nothing due/)).not.toBeOnTheScreen();
    // Queries return matches in tree order.
    const order = screen.getAllByTestId(/^payments-(fees-list|outstanding)$/).map((n) => n.props.testID);
    expect(order).toEqual(["payments-outstanding", "payments-fees-list"]);
  });

  it("explains an empty fee list and a session still in progress", async () => {
    (api.violations as jest.Mock).mockResolvedValue([]);
    (api.sessions as jest.Mock).mockResolvedValue([session({})]);
    await renderWithProviders(<PaymentsScreen />);

    expect(await screen.findByTestId("payments-fees-empty")).toHaveTextContent(
      "No session fees yet. A fee appears here when a parking session for one of your registered plates ends.",
    );
    expect(screen.getByTestId("payments-in-progress-s1")).toHaveTextContent(
      "ABC-1234 is parked in Zone A. Its fee is charged when the session ends.",
    );
  });
});
