import { fireEvent, render, screen } from "@/src/test/utils";
import { CampusOverview, LottieGuide } from "@/src/components";
import type { PublicZone } from "@/lib/api/client";

const zone = (over: Partial<PublicZone>): PublicZone => ({
  id: "z1",
  name: "Main Loop",
  code: "A",
  description: null,
  capacity: 30,
  occupiedCount: 10,
  availableCount: 18,
  status: "ACTIVE",
  availability: "AVAILABLE",
  navigationLat: null,
  navigationLng: null,
  ...over,
});

describe("LottieGuide", () => {
  it("speaks the first line and moves to the next on tap", async () => {
    await render(<LottieGuide lines={["Main Loop has the most room right now.", "2 of 3 zones are open."]} testID="g" />);
    const bubble = screen.getByTestId("g-bubble");
    expect(bubble).toHaveProp("accessibilityRole", "button");
    expect(bubble).toHaveTextContent(/Main Loop has the most room right now\./);
    await fireEvent.press(bubble);
    expect(screen.getByTestId("g-bubble")).toHaveTextContent(/2 of 3 zones are open\./);
    await fireEvent.press(screen.getByTestId("g-bubble"));
    expect(screen.getByTestId("g-bubble")).toHaveTextContent(/Main Loop has the most room/);
  });

  it("advances when Lottie herself is tapped", async () => {
    await render(<LottieGuide lines={["one", "two"]} testID="g" />);
    await fireEvent.press(screen.getByTestId("g-lottie-tap", { includeHiddenElements: true }));
    expect(screen.getByTestId("g-bubble")).toHaveTextContent(/two/);
  });
});

describe("CampusOverview", () => {
  const zones = [zone({}), zone({ id: "z2", name: "Gym Side", code: "GS", availableCount: 0, occupiedCount: 16, capacity: 16, availability: "FULL" })];

  it("lists every zone with its free count and open total", async () => {
    await render(<CampusOverview zones={zones} leastBusyId="z1" onChoose={jest.fn()} />);
    expect(screen.getByText("1 of 2 zones open")).toBeOnTheScreen();
    expect(screen.getByTestId("campus-zone-A")).toHaveTextContent(/18 free/);
    expect(screen.getByTestId("campus-zone-GS")).toHaveTextContent(/Full/);
  });

  it("chooses an open zone and never a full one", async () => {
    const onChoose = jest.fn();
    await render(<CampusOverview zones={zones} leastBusyId="z1" onChoose={onChoose} />);
    await fireEvent.press(screen.getByTestId("campus-zone-A"));
    await fireEvent.press(screen.getByTestId("campus-zone-GS"));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith("z1");
  });
});
