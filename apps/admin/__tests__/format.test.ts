import { formatDate, formatDateTime, formatDuration, formatPct } from "@/lib/format";

describe("format helpers", () => {
  const fixed = new Date("2026-01-02T03:04:05.000Z").getTime();

  it("formats date/time for display", () => {
    expect(formatDate(fixed)).toMatch(/^\d{2}:\d{2}:\d{2} (AM|PM)$/);
  });

  it("formats date+time with locale string", () => {
    expect(formatDateTime(fixed)).toBeTruthy();
    expect(formatDateTime(fixed)).toContain("Jan");
  });

  it("returns a dash for null/invalid values", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
  });

  it("formats durations as HH:MM:SS", () => {
    expect(formatDuration(0)).toBe("00:00:00");
    expect(formatDuration(3661)).toBe("01:01:01");
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(-5)).toBe("00:00:00");
  });

  it("formats percentages", () => {
    expect(formatPct(0.5)).toBe("1%");
    expect(formatPct(87.6)).toBe("88%");
    expect(formatPct(100)).toBe("100%");
    expect(formatPct(null)).toBe("—");
    expect(formatPct(Number.NaN)).toBe("—");
  });
});
