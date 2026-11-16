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
