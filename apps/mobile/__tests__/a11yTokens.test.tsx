import { render, screen } from "@/src/test/utils";
import { IconButton, ZoneCard } from "@/src/components";
import { useColors } from "@/src/providers/ThemeProvider";
import type { PublicZone } from "@/lib/api/client";
import type { ColorTokens } from "@/src/theme/colors";

const zone: PublicZone = {
  id: "z1",
  name: "Zone A",
  code: "A",
  description: null,
  capacity: 20,
  occupiedCount: 8,
  availableCount: 12,
  status: "ACTIVE",
  availability: "AVAILABLE",
  navigationLat: null,
  navigationLng: null,
};

async function liveTokens(): Promise<ColorTokens> {
  let captured: ColorTokens | undefined;
  function Probe() {
    captured = useColors();
    return null;
  }
  await render(<Probe />);
  return captured as ColorTokens;
}

const flat = (style: unknown) =>
  [style].flat(Infinity).reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...((s as object) || {}) }), {});

describe("contrast-safe tokens in components", () => {
  it("the unread badge text uses onDanger", async () => {
    const colors = await liveTokens();
    await render(<IconButton icon="notifications" accessibilityLabel="Notifications" badge={3} onPress={jest.fn()} testID="bell" />);
    expect(flat(screen.getByText("3").props.style).color).toBe(colors.onDanger);
  });

  it("a selected zone is outlined with primaryDeep, an unselected one is not", async () => {
    const colors = await liveTokens();
    const { unmount } = await render(<ZoneCard zone={zone} onPress={jest.fn()} selected testID="zone" />);
    expect(JSON.stringify(screen.toJSON())).toContain(`"borderColor":"${colors.primaryDeep}"`);
    await unmount();
    await render(<ZoneCard zone={zone} onPress={jest.fn()} testID="zone" />);
    expect(JSON.stringify(screen.toJSON())).not.toContain(`"borderColor":"${colors.primaryDeep}"`);
  });
});
