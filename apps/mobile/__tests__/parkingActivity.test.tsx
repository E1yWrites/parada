import { fireEvent, render, screen } from "@/src/test/utils";
import { ParkingActivity, formatMinutes, minutesByDay } from "@/src/components/ParkingActivity";
import type { SessionDto } from "@/lib/api/client";

const now = new Date(2026, 10, 24, 7, 42); // Tue 24 Nov 2026, local time
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();
const session = (over: Partial<SessionDto>): SessionDto =>
  ({ id: "s", status: "COMPLETED", enteredAt: at(23, 6, 18), durationSeconds: 164 * 60, ...over }) as SessionDto;

const sessions: SessionDto[] = [
  session({ id: "a", enteredAt: at(23, 6, 18), durationSeconds: 164 * 60 }),
  session({ id: "b", enteredAt: at(19, 13, 5), durationSeconds: 275 * 60 }),
  session({ id: "c", enteredAt: at(18, 7, 30), durationSeconds: 45 * 60 }),
  session({ id: "d", enteredAt: at(3, 8, 0), durationSeconds: 95 * 60 }),
  session({ id: "live", status: "ACTIVE", enteredAt: at(24, 6, 18), durationSeconds: null }),
  session({ id: "x", status: "CANCELLED" as SessionDto["status"], enteredAt: at(22, 9), durationSeconds: 999 }),
];

describe("parking activity", () => {
  it("sums minutes per local day, counting the active session so far", () => {
    const byDay = minutesByDay(sessions, now);
    expect(byDay.get("2026-10-23")).toBe(164);
    expect(byDay.get("2026-10-24")).toBe(84);
    expect(byDay.get("2026-10-22")).toBeUndefined();
  });

  it("formats minutes as h mm", () => {
    expect(formatMinutes(484)).toBe("8h 04m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(0)).toBe("0m");
  });

  it("shows the 7-day total, then a tapped day", async () => {
    await render(<ParkingActivity sessions={sessions} now={now} testID="act" />);
    // 18, 19, 23 Nov + today's 84m so far (3 Nov is outside the week).
    expect(screen.getByTestId("act-total")).toHaveTextContent("9h 28m");
    await fireEvent.press(screen.getByTestId("act-day-0")); // Wed 18
    expect(screen.getByTestId("act-total")).toHaveTextContent("45m");
    expect(screen.getByText("Wed 18 · parked")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("act-day-0"));
    expect(screen.getByTestId("act-total")).toHaveTextContent("9h 28m");
  });

  it("counts parked days in the month calendar", async () => {
    await render(<ParkingActivity sessions={sessions} now={now} testID="act" />);
    expect(screen.getByTestId("act-month")).toHaveTextContent(/5 days parked/);
  });
});
