import * as SecureStore from "expo-secure-store";
import { useState } from "react";
import { Text as RNText } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/src/test/utils";
import { ZoneAssignmentPanel } from "@/src/components/ZoneAssignmentPanel";
import { api, ApiError, type PublicZone } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import type { Vehicle, ZoneAssignmentResponse } from "@parada/types";

jest.mock("@/lib/api/client", () => {
  const actual = jest.requireActual("@/lib/api/client");
  return {
    ...actual,
    api: {
      me: jest.fn(),
      login: jest.fn(),
      register: jest.fn(),
      logout: jest.fn(),
      zones: jest.fn(),
      zoneOccupancy: jest.fn(),
      vehicles: jest.fn(),
      createVehicle: jest.fn(),
      sessions: jest.fn(),
      activeSession: jest.fn(),
      recommendedZone: jest.fn(),
      assignments: jest.fn(),
      createAssignment: jest.fn(),
      reservations: jest.fn(),
      createReservation: jest.fn(),
      cancelReservation: jest.fn(),
    },
  };
});

type SecureStoreMock = typeof SecureStore & { __reset: () => void };

const baseZone = (over: Partial<PublicZone>): PublicZone => ({
  id: "z1",
  name: "Zone A",
  code: "A",
  description: null,
  capacity: 20,
  occupiedCount: 12,
  availableCount: 8,
  status: "ACTIVE",
  availability: "AVAILABLE",
  ...over,
});

const zoneA = baseZone({});
const fullZone = baseZone({
  id: "z3",
  name: "Zone C",
  code: "C",
  capacity: 10,
  occupiedCount: 10,
  availableCount: 0,
  availability: "FULL",
});

const vehicle: Vehicle = {
  id: "v1",
  userId: "u1",
  plateNumber: "ABC-1234",
  normalizedPlate: "ABC1234",
  vehicleType: "CAR",
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const otherVehicle: Vehicle = {
  ...vehicle,
  id: "v2",
  plateNumber: "XYZ-5678",
  normalizedPlate: "XYZ5678",
};

const assignment: ZoneAssignmentResponse = {
  id: "a1",
  userId: "u1",
  vehicleId: "v1",
  zoneId: "z2",
  status: "ACTIVE",
  assignedAt: "2026-09-05T09:00:00.000Z",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  createdAt: "2026-09-05T09:00:00.000Z",
  updatedAt: "2026-09-05T09:00:00.000Z",
  zone: { id: "z2", name: "Zone B", code: "B" },
  vehicle: { id: "v1", plateNumber: "ABC-1234", vehicleType: "CAR" },
};

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as SecureStoreMock).__reset?.();
  (api.vehicles as jest.Mock).mockResolvedValue([vehicle]);
  (api.assignments as jest.Mock).mockResolvedValue([]);
  (api.createAssignment as jest.Mock).mockResolvedValue(assignment);
  (api.zones as jest.Mock).mockResolvedValue([zoneA, fullZone]);
  (api.recommendedZone as jest.Mock).mockResolvedValue({ recommendedZone: null });
});

/** Zone that turns full after selection — simulates live refresh data. */
function FillableZoneHarness() {
  const [zone, setZone] = useState<PublicZone>(zoneA);
  return (
    <>
      <ZoneAssignmentPanel selectedZone={zone} />
      <RNText onPress={() => setZone(fullZone)} testID="make-zone-full">
        make-full
      </RNText>
    </>
  );
}

/** Observes the same query keys the Parking screen keeps alive. */
function ScreenQueriesHarness() {
  const zones = useQuery({ queryKey: queryKeys.zones, queryFn: api.zones });
  const recommendation = useQuery({
    queryKey: queryKeys.recommendation,
    queryFn: api.recommendedZone,
  });
  return (
    <RNText testID="screen-queries">
      {`zones:${zones.data?.length ?? 0};rec:${recommendation.data?.recommendedZone?.id ?? "none"}`}
    </RNText>
  );
}

function Harness() {
  return (
    <>
      <ZoneAssignmentPanel selectedZone={zoneA} />
      <ScreenQueriesHarness />
    </>
  );
}

describe("zone assignment: zone selection gating", () => {
  it("asks for a zone first and never submits without one", async () => {
    renderWithProviders(<ZoneAssignmentPanel selectedZone={null} />);

    expect(screen.getByTestId("assignment-zone-hint")).toHaveTextContent(
      "Select a parking zone above.",
    );
    const submit = await screen.findByTestId("assignment-submit");
    expect(submit).toHaveTextContent("Select a zone");
    expect(submit.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(submit);
    expect(api.createAssignment).not.toHaveBeenCalled();
  });

  it("shows the selected zone summary and enables submission", async () => {
    renderWithProviders(<ZoneAssignmentPanel selectedZone={zoneA} />);

    const submit = await screen.findByTestId("assignment-submit");
    expect(screen.getByTestId("assignment-summary")).toHaveTextContent(/Zone A/);
    expect(screen.getByTestId("assignment-summary")).toHaveTextContent(/8 spaces available/);
    expect(submit).toHaveTextContent("Assign to Zone");
    expect(submit.props.accessibilityLabel).toBe("Assign ABC-1234 to Zone A.");
    expect(submit.props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("rejects a full zone: warning shown and no submission", async () => {
    renderWithProviders(<ZoneAssignmentPanel selectedZone={fullZone} />);

    await screen.findByTestId("assignment-submit");
    expect(screen.getByTestId("assignment-zone-full")).toHaveTextContent(
      "This zone is now full. Please choose another zone.",
    );
    const submit = screen.getByTestId("assignment-submit");
    expect(submit).toHaveTextContent("Select another zone");
    expect(submit.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(submit);
    expect(api.createAssignment).not.toHaveBeenCalled();
  });

  it("treats a zone that filled up after selection as unavailable", async () => {
    renderWithProviders(<FillableZoneHarness />);
    await screen.findByTestId("assignment-submit");
    expect(screen.queryByTestId("assignment-zone-full")).not.toBeOnTheScreen();

    fireEvent.press(screen.getByTestId("make-zone-full"));
    expect(screen.getByTestId("assignment-zone-full")).toBeOnTheScreen();
    expect(screen.getByTestId("assignment-submit")).toHaveTextContent("Select another zone");
    expect(screen.getByTestId("assignment-submit").props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });
});

describe("zone assignment: vehicle requirement", () => {
  it("blocks submission when there is no vehicle and offers the vehicle flow", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([]);
    const router = useRouter();
    renderWithProviders(<ZoneAssignmentPanel selectedZone={zoneA} />);

    expect(await screen.findByTestId("assignment-no-vehicle")).toHaveTextContent(
      /Add a vehicle first to assign a zone\./,
    );
    expect(screen.queryByTestId("assignment-submit")).not.toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("assignment-add-vehicle"));
    expect(router.push).toHaveBeenCalledWith("/vehicles");
  });

  it("auto-uses the single active vehicle", async () => {
    renderWithProviders(<ZoneAssignmentPanel selectedZone={zoneA} />);

    expect(await screen.findByTestId("assignment-vehicle")).toHaveTextContent(/ABC-1234/);
    expect(screen.queryByTestId("assignment-vehicle-v1")).not.toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("assignment-submit"));
    await waitFor(() => expect(api.createAssignment).toHaveBeenCalledTimes(1));
    expect(api.createAssignment).toHaveBeenCalledWith({ zoneId: "z1", vehicleId: "v1" });
  });

  it("requires an explicit vehicle choice when several are registered", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([vehicle, otherVehicle]);
    renderWithProviders(<ZoneAssignmentPanel selectedZone={zoneA} />);

    await screen.findByTestId("assignment-vehicle-v1");
    const submit = screen.getByTestId("assignment-submit");
    expect(submit).toHaveTextContent("Select a vehicle");
    expect(submit.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(submit);
    expect(api.createAssignment).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("assignment-vehicle-v2"));
    expect(screen.getByTestId("assignment-vehicle-v2").props.accessibilityState).toMatchObject({
      selected: true,
    });
    fireEvent.press(screen.getByTestId("assignment-submit"));

    await waitFor(() => expect(api.createAssignment).toHaveBeenCalledTimes(1));
    expect(api.createAssignment).toHaveBeenCalledWith({ zoneId: "z1", vehicleId: "v2" });
  });

  it("never fabricates a vehicle and never auto-picks when several exist", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([vehicle, otherVehicle]);
    renderWithProviders(<ZoneAssignmentPanel selectedZone={zoneA} />);

    await screen.findByTestId("assignment-vehicle-v1");
    fireEvent.press(screen.getByTestId("assignment-submit"));
    expect(api.createAssignment).not.toHaveBeenCalled();
    expect(screen.getByTestId("assignment-vehicle-v1").props.accessibilityState.selected).toBe(
      false,
    );
    expect(screen.getByTestId("assignment-vehicle-v2").props.accessibilityState.selected).toBe(
      false,
    );
  });
});

describe("zone assignment: submission", () => {
  it("submits the user-selected zone and vehicle only on explicit action", async () => {
    renderWithProviders(<ZoneAssignmentPanel selectedZone={zoneA} />);

    await screen.findByTestId("assignment-submit");
    expect(api.createAssignment).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("assignment-submit"));

    await waitFor(() => expect(api.createAssignment).toHaveBeenCalledTimes(1));
    expect(api.createAssignment).toHaveBeenCalledWith({ zoneId: "z1", vehicleId: "v1" });
  });

  it("shows pending state and prevents duplicate submission", async () => {
    let resolveAssign!: (value: ZoneAssignmentResponse) => void;
    (api.createAssignment as jest.Mock).mockReturnValueOnce(
      new Promise<ZoneAssignmentResponse>((resolve) => {
        resolveAssign = resolve;
      }),
    );
    renderWithProviders(<ZoneAssignmentPanel selectedZone={zoneA} />);

    fireEvent.press(await screen.findByTestId("assignment-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("assignment-submit")).toHaveTextContent("Assigning…"),
    );
    const submit = screen.getByTestId("assignment-submit");
    expect(submit.props.accessibilityState).toMatchObject({ busy: true, disabled: true });

    fireEvent.press(submit);
    expect(api.createAssignment).toHaveBeenCalledTimes(1);

    resolveAssign(assignment);
    await waitFor(() => expect(screen.getByTestId("assignment-already-assigned")).toBeOnTheScreen());
    expect(screen.queryByTestId("assignment-submit")).not.toBeOnTheScreen();
  });

  it("renders backend-confirmed assignment state only after success", async () => {
    let resolveAssign!: (value: ZoneAssignmentResponse) => void;
    (api.createAssignment as jest.Mock).mockReturnValueOnce(
      new Promise<ZoneAssignmentResponse>((resolve) => {
        resolveAssign = resolve;
      }),
    );
    renderWithProviders(<ZoneAssignmentPanel selectedZone={zoneA} />);

    fireEvent.press(await screen.findByTestId("assignment-submit"));
    expect(screen.queryByTestId("assignment-already-assigned")).not.toBeOnTheScreen();

    resolveAssign(assignment);
    await waitFor(() => expect(screen.getByTestId("assignment-already-assigned")).toBeOnTheScreen());
    expect(screen.queryByTestId("assignment-submit")).not.toBeOnTheScreen();
  });

  it("refreshes assignment, zone and recommendation data after success", async () => {
    renderWithProviders(<Harness />);

    await screen.findByTestId("screen-queries");
    await waitFor(() =>
      expect(screen.getByTestId("screen-queries")).toHaveTextContent(/zones:2;rec:none/),
    );
    expect(api.assignments).toHaveBeenCalledTimes(1);

    fireEvent.press(await screen.findByTestId("assignment-submit"));
    await waitFor(() => expect(screen.getByTestId("assignment-already-assigned")).toBeOnTheScreen());

    // The panel invalidates all three keys; live consumers refetch each.
    await waitFor(() => expect(api.assignments).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.zones).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.recommendedZone).toHaveBeenCalledTimes(2));
  });
});

describe("zone assignment: failures", () => {
  it("never shows assigned state on failure and maps a zone-went-full conflict", async () => {
    (api.createAssignment as jest.Mock).mockRejectedValue(
      new ApiError("CONFLICT", "Zone 'z1' cannot accept assignments.", 409),
    );
    renderWithProviders(<ZoneAssignmentPanel selectedZone={zoneA} />);

    fireEvent.press(await screen.findByTestId("assignment-submit"));

    await waitFor(() => expect(screen.getByTestId("assignment-error")).toBeOnTheScreen());
    expect(screen.getByText("This zone is no longer available. Please choose another zone.")).toBeOnTheScreen();
    expect(screen.queryByTestId("assignment-confirmed")).not.toBeOnTheScreen();
    expect(screen.queryByText(/409|CONFLICT|z1|cannot accept/)).not.toBeOnTheScreen();
  });

  it("maps an existing-assignment conflict to a friendly message", async () => {
    (api.createAssignment as jest.Mock).mockRejectedValue(
      new ApiError("CONFLICT", "This vehicle already has an active zone assignment.", 409),
    );
    renderWithProviders(<ZoneAssignmentPanel selectedZone={zoneA} />);

    fireEvent.press(await screen.findByTestId("assignment-submit"));

    await waitFor(() => expect(screen.getByTestId("assignment-error")).toBeOnTheScreen());
    expect(screen.getByText("This vehicle already has an assigned zone.")).toBeOnTheScreen();
    expect(screen.queryByText(/409|CONFLICT/)).not.toBeOnTheScreen();
  });

  it("handles network failures with a friendly message and keeps controls usable", async () => {
    (api.createAssignment as jest.Mock).mockRejectedValue(
      new ApiError("NETWORK", "Cannot reach the PARADA server. Check your connection and try again.", 0),
    );
    renderWithProviders(<ZoneAssignmentPanel selectedZone={zoneA} />);

    fireEvent.press(await screen.findByTestId("assignment-submit"));

    await waitFor(() => expect(screen.getByTestId("assignment-error")).toBeOnTheScreen());
    expect(screen.getByText("We couldn't connect to the parking service. Please try again.")).toBeOnTheScreen();
    expect(screen.queryByText(/NETWORK|Cannot reach/)).not.toBeOnTheScreen();
    expect(screen.queryByTestId("assignment-confirmed")).not.toBeOnTheScreen();
    expect(screen.getByTestId("assignment-submit")).toBeOnTheScreen();
  });

  it("preserves authentication when the assignment fails (non-401)", async () => {
    await SecureStore.setItemAsync("parada.session.token", "tok-alive");
    (api.createAssignment as jest.Mock).mockRejectedValue(
      new ApiError("BAD_GATEWAY", "The server is down.", 502),
    );
    renderWithProviders(<ZoneAssignmentPanel selectedZone={zoneA} />);

    fireEvent.press(await screen.findByTestId("assignment-submit"));

    await waitFor(() => expect(screen.getByTestId("assignment-error")).toBeOnTheScreen());
    const token = await SecureStore.getItemAsync("parada.session.token");
    expect(token).toBe("tok-alive");
  });
});

describe("zone assignment: existing assignment", () => {
  it("shows the backend-confirmed assignment without offering another request", async () => {
    (api.assignments as jest.Mock).mockResolvedValue([assignment]);
    renderWithProviders(<ZoneAssignmentPanel selectedZone={zoneA} />);

    await waitFor(() => expect(screen.getByTestId("assignment-already-assigned")).toBeOnTheScreen());
    expect(screen.queryByTestId("assignment-submit")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("assignment-vehicle-v1")).not.toBeOnTheScreen();
    expect(api.createAssignment).not.toHaveBeenCalled();
  });

  it("ignores expired assignments and allows a fresh assignment", async () => {
    (api.assignments as jest.Mock).mockResolvedValue([
      {
        ...assignment,
        status: "ACTIVE",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      },
    ]);
    renderWithProviders(<ZoneAssignmentPanel selectedZone={zoneA} />);

    await screen.findByTestId("assignment-submit");
    expect(screen.queryByTestId("assignment-confirmed")).not.toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("assignment-submit"));
    await waitFor(() => expect(api.createAssignment).toHaveBeenCalledTimes(1));
  });
});