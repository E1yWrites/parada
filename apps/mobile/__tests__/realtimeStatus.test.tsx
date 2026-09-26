import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import type { RealtimeStatus } from "@/src/lib/realtime";
import {
  RealtimeConnection,
  RealtimeStatusProvider,
  connectionLabel,
  useConnectionLabel,
} from "@/src/providers/RealtimeStatusProvider";

let mockStatus: RealtimeStatus = "DISCONNECTED";

jest.mock("@/src/lib/realtime", () => ({
  useRealtime: () => ({ status: mockStatus }),
}));

function Line({ updatedAt }: { updatedAt?: number }) {
  return <Text testID="line">{useConnectionLabel(updatedAt)}</Text>;
}

function Harness({ connected, updatedAt }: { connected: boolean; updatedAt?: number }) {
  return (
    <RealtimeStatusProvider>
      {connected ? <RealtimeConnection /> : null}
      <Line updatedAt={updatedAt} />
    </RealtimeStatusProvider>
  );
}

// 2026-09-26 10:42 local time.
const UPDATED = new Date(2026, 8, 26, 10, 42).getTime();

describe("connectionLabel", () => {
  it("says Live only when CONNECTED, with no timestamp", () => {
    expect(connectionLabel("CONNECTED", UPDATED)).toBe("Live");
  });

  it.each<[RealtimeStatus, string]>([
    ["RECONNECTING", "Reconnecting… · Updated 10:42"],
    ["DISCONNECTED", "Not live · Updated 10:42"],
    ["ERROR", "Not live · Updated 10:42"],
  ])("%s shows the plain state and last update", (status, expected) => {
    expect(connectionLabel(status, UPDATED)).toBe(expected);
  });

  it("omits Updated when the screen's data was never fetched", () => {
    expect(connectionLabel("RECONNECTING", 0)).toBe("Reconnecting…");
    expect(connectionLabel("DISCONNECTED")).toBe("Not live");
  });
});

describe("RealtimeStatusProvider — bound to the real stream", () => {
  it("publishes the stream's status to screens", () => {
    mockStatus = "CONNECTED";
    render(<Harness connected updatedAt={UPDATED} />);
    expect(screen.getByTestId("line")).toHaveTextContent("Live");
  });

  it("never says Live while reconnecting", () => {
    mockStatus = "RECONNECTING";
    render(<Harness connected updatedAt={UPDATED} />);
    expect(screen.getByTestId("line")).toHaveTextContent("Reconnecting… · Updated 10:42");
  });

  it("falls back to Not live when the stream unmounts (sign-out)", () => {
    mockStatus = "CONNECTED";
    const { rerender } = render(<Harness connected />);
    expect(screen.getByTestId("line")).toHaveTextContent("Live");
    rerender(<Harness connected={false} />);
    expect(screen.getByTestId("line")).toHaveTextContent("Not live");
  });

  it("says Not live with no provider mounted", () => {
    render(<Line />);
    expect(screen.getByTestId("line")).toHaveTextContent("Not live");
  });
});
