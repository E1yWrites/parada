import { calculateParkingFee } from "./fees";
import { DEFAULT_PARKING_FEE } from "@parada/config";

const cfg = { ...DEFAULT_PARKING_FEE };

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

describe("calculateParkingFee", () => {
  it("charges the base fee for a very short duration (0s)", () => {
    expect(calculateParkingFee(0, cfg).amount).toBe(20);
  });

  it("charges the base fee up to exactly 2 hours", () => {
    expect(calculateParkingFee(2 * HOUR, cfg).amount).toBe(20);
  });

  it("charges base + one additional hour just over 2h", () => {
    expect(calculateParkingFee(2 * HOUR + 1 * MIN, cfg).amount).toBe(30);
  });

  it("charges base + one additional hour exactly at 3h", () => {
    expect(calculateParkingFee(3 * HOUR, cfg).amount).toBe(30);
  });

  it("charges base + two additional hours just over 3h", () => {
    expect(calculateParkingFee(3 * HOUR + 1 * MIN, cfg).amount).toBe(40);
  });

  it("charges the correct amount for multiple hours", () => {
    // 5h -> base (2h) + 3 additional started hours = 20 + 30 = 50
    expect(calculateParkingFee(5 * HOUR, cfg).amount).toBe(50);
  });

  it("charges base + N for durations just beyond a whole-hour boundary", () => {
    expect(calculateParkingFee(3 * HOUR + 59 * MIN, cfg).amount).toBe(40);
    expect(calculateParkingFee(4 * HOUR, cfg).amount).toBe(40);
  });

  it("clamps negative durations to zero and charges the base fee", () => {
    expect(calculateParkingFee(-5000, cfg).amount).toBe(20);
  });

  it("uses a custom fee configuration when provided", () => {
    const custom = { baseFee: 30, baseDurationHours: 1, additionalFeePerHour: 15 };
    // 1h32m -> base(1h) + 1 additional started hour = 30 + 15 = 45
    expect(calculateParkingFee(1 * HOUR + 32 * MIN, custom).amount).toBe(45);
    // 2h exactly -> base + 1 additional hour = 45
    expect(calculateParkingFee(2 * HOUR, custom).amount).toBe(45);
  });

  it("records a rate breakdown for audit", () => {
    const result = calculateParkingFee(5 * HOUR, cfg);
    expect(result.breakdown).toMatchObject({
      baseFee: 20,
      additionalHours: 3,
      additionalFee: 30,
      durationMs: 5 * HOUR,
    });
  });
});
