import { Pressable, Text as RNText } from "react-native";
import { __router } from "expo-router";
import type { ParkingSessionResponse, RealtimeEvent } from "@parada/types";
import { act, fireEvent, renderWithProviders, screen, waitFor } from "@/src/test/utils";
import { PopupProvider, TOAST_MS, usePopups } from "@/src/providers/PopupProvider";

// Capture the provider's realtime listener so tests can deliver events.
let deliver: ((event: RealtimeEvent) => void) | null = null;
jest.mock("@/src/lib/realtime", () => ({
  subscribeRealtimeEvents: (listener: (event: RealtimeEvent) => void) => {
    deliver = listener;
    return () => {
      deliver = null;
    };
  },
}));

const session: ParkingSessionResponse = {
  id: "s1",
  zoneId: "z1",
  userId: "u1",
  vehicleId: "v1",
  entryEventId: "e1",
  exitEventId: "e2",
  enteredAt: "2026-11-23T22:18:00.000Z",
  exitedAt: "2026-11-24T01:02:00.000Z",
  durationSeconds: 2 * 3600 + 44 * 60,
  feeAmount: 30,
  status: "COMPLETED",
  zone: { id: "z1", name: "Main Loop", code: "ML" },
  vehicle: { id: "v1", plateNumber: "NBC 4821", vehicleType: "CAR" },
  entryEvent: null,
  exitEvent: null,
};

async function send(event: Omit<RealtimeEvent, "seq" | "occurredAt"> & { occurredAt?: string }) {
  await act(async () => {
    deliver?.({ seq: 1, occurredAt: new Date().toISOString(), ...event } as RealtimeEvent);
  });
}

function ToastButton() {
  const { showToast } = usePopups();
  return (
    <Pressable testID="fire-toast" onPress={() => showToast({ title: "Reservation cancelled", body: "The kept space is released." })}>
      <RNText>fire</RNText>
    </Pressable>
  );
}

async function renderProvider() {
  await renderWithProviders(
    <PopupProvider>
      <ToastButton />
    </PopupProvider>,
  );
}

describe("in-app pop-ups", () => {
  beforeEach(() => {
    __router.push.mockClear();
  });

  it("drops a banner for a new notification and opens Notifications on tap", async () => {
    await renderProvider();
    await send({
      type: "NOTIFICATION_CREATED",
      payload: {
        id: "n1",
        zoneId: "z3",
        userId: "u1",
        type: "WRONG_ZONE_WARNING",
        message: "Your vehicle (NBC 4821) entered a zone different from your assigned zone.",
        targetRole: "USER",
        createdAt: "2026-11-24T00:00:00.000Z",
      },
    });
    const banner = await screen.findByTestId("popup-banner");
    expect(banner).toHaveProp("accessibilityRole", "alert");
    expect(screen.getByText("Wrong zone")).toBeOnTheScreen();
    await fireEvent.press(banner);
    expect(__router.push).toHaveBeenCalledWith("/notifications");
    expect(screen.queryByTestId("popup-banner")).toBeNull();
  });

  it("does not banner the fee notification — the session-ended sheet covers it", async () => {
    await renderProvider();
    await send({
      type: "NOTIFICATION_CREATED",
      payload: {
        id: "n2",
        zoneId: "z1",
        userId: "u1",
        type: "SESSION_COMPLETED",
        message: "Your parking session ended. Parking fee: ₱30.",
        targetRole: "USER",
        createdAt: "2026-11-24T00:00:00.000Z",
      },
    });
    expect(screen.queryByTestId("popup-banner")).toBeNull();
  });

  it("shows the parked sheet when a session starts, and closes it", async () => {
    await renderProvider();
    await send({ type: "PARKING_SESSION_STARTED", payload: { ...session, status: "ACTIVE", exitedAt: null, durationSeconds: null, feeAmount: null } });
    expect(await screen.findByTestId("popup-sheet-parked")).toBeOnTheScreen();
    expect(screen.getByText("You're parked")).toBeOnTheScreen();
    expect(screen.getByText("NBC 4821")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("popup-sheet-close"));
    expect(screen.queryByTestId("popup-sheet-parked")).toBeNull();
  });

  it("flags a parked sheet in a zone other than the active assignment", async () => {
    const { client } = await renderWithProviders(
      <PopupProvider>
        <></>
      </PopupProvider>,
    );
    client.setQueryData(["assignments"], [
      { id: "as1", status: "ACTIVE", expiresAt: null, zone: { id: "zA", name: "Gym Annex", code: "B" } },
    ]);
    await send({ type: "PARKING_SESSION_STARTED", payload: { ...session, status: "ACTIVE", exitedAt: null, durationSeconds: null, feeAmount: null } });
    expect(await screen.findByTestId("popup-parked-wrong-zone")).toHaveTextContent(/Not your assigned zone \(Gym Annex, B\)/);
  });

  it("adds no wrong-zone note when parked in the assigned zone", async () => {
    const { client } = await renderWithProviders(
      <PopupProvider>
        <></>
      </PopupProvider>,
    );
    client.setQueryData(["assignments"], [
      { id: "as1", status: "ACTIVE", expiresAt: null, zone: { id: session.zone.id, name: session.zone.name, code: session.zone.code } },
    ]);
    await send({ type: "PARKING_SESSION_STARTED", payload: { ...session, status: "ACTIVE", exitedAt: null, durationSeconds: null, feeAmount: null } });
    expect(await screen.findByTestId("popup-sheet-parked")).toBeOnTheScreen();
    expect(screen.queryByTestId("popup-parked-wrong-zone")).toBeNull();
  });

  it("ignores stale events (e.g. replayed long after the fact)", async () => {
    await renderProvider();
    await send({
      type: "PARKING_SESSION_STARTED",
      occurredAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      payload: { ...session, status: "ACTIVE", exitedAt: null, durationSeconds: null, feeAmount: null },
    });
    expect(screen.queryByTestId("popup-sheet-parked")).toBeNull();
  });

  it("shows duration and fee when a session ends", async () => {
    await renderProvider();
    await send({ type: "PARKING_SESSION_COMPLETED", payload: session });
    expect(await screen.findByTestId("popup-sheet-ended")).toBeOnTheScreen();
    expect(screen.getByTestId("popup-ended-duration")).toHaveTextContent("2h 44m");
    expect(screen.getByTestId("popup-ended-fee")).toHaveTextContent(/30/);
  });

  it("confirms an action with a toast that hides itself", async () => {
    await renderProvider();
    await fireEvent.press(screen.getByTestId("fire-toast"));
    expect(screen.getByTestId("popup-toast")).toHaveTextContent(/Reservation cancelled/);
    await waitFor(() => expect(screen.queryByTestId("popup-toast")).toBeNull(), { timeout: TOAST_MS + 1500 });
  }, TOAST_MS + 5000);
});
