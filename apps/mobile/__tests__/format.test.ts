import {
  normalizePlateInput,
  formatDurationSeconds,
  formatElapsed,
  formatDateTime,
  formatCurrency,
  formatVehicleType,
} from "@/lib/format";

describe("normalizePlateInput", () => {
  it("strips non-alphanumerics and uppercases", () => {
    expect(normalizePlateInput("abc-1234")).toBe("ABC1234");
    expect(normalizePlateInput("ab c-12.34_")).toBe("ABC1234");
  });
  it("handles empty input", () => {
    expect(normalizePlateInput("   ")).toBe("");
  });
  it("caps length at 12 characters", () => {
    expect(normalizePlateInput("ABCDEFGHIJKLMNOPQRSTUVWXYZ")).toHaveLength(12);
  });
});

describe("formatDurationSeconds", () => {
  it("renders minutes under an hour", () => {
    expect(formatDurationSeconds(42 * 60)).toBe("42m");
  });
  it("renders hours + minutes", () => {
    expect(formatDurationSeconds(61 * 60 + 30)).toBe("1h 01m");
  });
  it("renders days + hours", () => {
    expect(formatDurationSeconds(2 * 24 * 3600 + 3 * 3600)).toBe("2d 03h");
  });
  it("returns placeholder for null/NaN/negative", () => {
    expect(formatDurationSeconds(null)).toBe("--:--");
    expect(formatDurationSeconds(Number.NaN)).toBe("--:--");
    expect(formatDurationSeconds(-5)).toBe("--:--");
  });
});

describe("formatElapsed", () => {
  const enteredAt = "2026-09-01T10:00:00.000Z";
  it("computes elapsed from injected now", () => {
    expect(formatElapsed(enteredAt, new Date("2026-09-01T10:42:00.000Z"))).toBe("42m");
  });
  it("handles crossing into hours", () => {
    expect(formatElapsed(enteredAt, new Date("2026-09-01T11:42:00.000Z"))).toBe("1h 42m");
  });
});

describe("formatDateTime", () => {
  it("renders local YYYY-MM-DD HH:mm regardless of host timezone", () => {
    const local = new Date(2026, 8, 1, 10, 42, 0); // Sep 1, 10:42 local
    expect(formatDateTime(local)).toBe("2026-09-01 10:42");
  });
  it("falls back for invalid input", () => {
    expect(formatDateTime("not-a-date")).toBe("-- --");
  });
});

describe("formatVehicleType", () => {
  it("maps PARADA vehicle types to friendly labels", () => {
    expect(formatVehicleType("CAR")).toBe("Car");
    expect(formatVehicleType("MOTORCYCLE")).toBe("Motorcycle");
    expect(formatVehicleType("VAN")).toBe("Van");
    expect(formatVehicleType("TRUCK")).toBe("Truck");
    expect(formatVehicleType("OTHER")).toBe("Other");
  });
  it("defaults unknown values to Car", () => {
    expect(formatVehicleType("HELICOPTER")).toBe("Car");
  });
});

describe("formatCurrency", () => {
  it("formats whole pesos with cents", () => {
    expect(formatCurrency(20)).toBe("₱20.00");
    expect(formatCurrency(30)).toBe("₱30.00");
    expect(formatCurrency(0)).toBe("₱0.00");
  });
  it("formats decimal amounts deterministically", () => {
    expect(formatCurrency(30.5)).toBe("₱30.50");
    expect(formatCurrency(29.99)).toBe("₱29.99");
    expect(formatCurrency(0.01)).toBe("₱0.01");
  });
  it("groups thousands without locale dependence", () => {
    expect(formatCurrency(1000)).toBe("₱1,000.00");
    expect(formatCurrency(1234567.89)).toBe("₱1,234,567.89");
  });
  it("returns a neutral placeholder for null/NaN", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency(undefined)).toBe("—");
    expect(formatCurrency(Number.NaN)).toBe("—");
  });
});