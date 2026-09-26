import { render, screen } from "@testing-library/react";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { RealtimeConnection, RealtimeStatusProvider } from "@/components/providers/realtime-status";
import type { RealtimeStatus } from "@/lib/realtime";

let mockStatus: RealtimeStatus = "DISCONNECTED";

jest.mock("@/lib/realtime", () => ({
  useRealtime: () => ({ status: mockStatus }),
}));

function Harness({ connected }: { connected: boolean }) {
  return (
    <RealtimeStatusProvider>
      {connected ? <RealtimeConnection /> : null}
      <ConnectionIndicator />
    </RealtimeStatusProvider>
  );
}

describe("ConnectionIndicator — bound to the real stream status", () => {
  it.each<[RealtimeStatus, string]>([
    ["CONNECTED", "Live"],
    ["RECONNECTING", "Reconnecting…"],
    ["DISCONNECTED", "Not live"],
    ["ERROR", "Not live"],
  ])("%s renders %s", (status, label) => {
    mockStatus = status;
    render(<Harness connected />);
    expect(screen.getByRole("status")).toHaveTextContent(label);
  });

  it("never says Live unless the stream is CONNECTED", () => {
    for (const status of ["RECONNECTING", "DISCONNECTED", "ERROR"] as RealtimeStatus[]) {
      mockStatus = status;
      const { unmount } = render(<Harness connected />);
      expect(screen.getByRole("status")).not.toHaveTextContent(/^Live$/);
      expect(screen.getByRole("status")).toHaveAttribute("data-status", status);
      unmount();
    }
  });

  it("falls back to Not live when the stream unmounts (sign-out)", () => {
    mockStatus = "CONNECTED";
    const { rerender } = render(<Harness connected />);
    expect(screen.getByRole("status")).toHaveTextContent("Live");
    rerender(<Harness connected={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("Not live");
  });

  it("says Not live without any provider (no stream mounted)", () => {
    render(<ConnectionIndicator />);
    expect(screen.getByRole("status")).toHaveTextContent("Not live");
  });
});
