/** Normalize user-entered plate: uppercase, strip non-alphanumeric. */
export function normalizePlateInput(input: string): string {
  const cleaned = input.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return cleaned.slice(0, 12);
}

/** Render a duration from whole seconds into "42m" / "1h 42m" / "2d 03h". */
export function formatDurationSeconds(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || Number.isNaN(totalSeconds) || totalSeconds < 0) {
    return "--:--";
  }
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 1) {
    return "0m";
  }
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) {
    const remHours = hours % 24;
    return `${days}d ${String(remHours).padStart(2, "0")}h`;
  }
  if (hours >= 1) {
    const remMinutes = minutes % 60;
    return `${hours}h ${String(remMinutes).padStart(2, "0")}m`;
  }
  return `${minutes}m`;
}

/** Current elapsed duration for an active session (`enteredAt` known, `now` injectable for tests). */
export function formatElapsed(enteredAt: string | Date, now: Date = new Date()): string {
  const from = new Date(enteredAt).getTime();
  if (Number.isNaN(from)) {
    return "--:--";
  }
  const seconds = Math.max(0, Math.floor((now.getTime() - from) / 1000));
  if (seconds === 0 && now.getTime() < from) {
    return "0m";
  }
  return formatDurationSeconds(seconds);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local wall-clock "2026-09-01 11:19" rendering. `Date` respects process TZ. */
export function formatDateTime(iso: string | Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "-- --";
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Human-friendly vehicle-type labels for PARADA enum values. */
export function formatVehicleType(type: string): string {
  switch (type) {
    case "MOTORCYCLE":
      return "Motorcycle";
    case "VAN":
      return "Van";
    case "TRUCK":
      return "Truck";
    case "OTHER":
      return "Other";
    case "CAR":
    default:
      return "Car";
  }
}