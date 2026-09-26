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

/** "1 space" / "12 spaces" — a count with its correctly pluralised noun. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Local wall-clock "11:19" (24-hour), for "Updated 11:19". */
export function formatClockTime(value: number | string | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return "--:--";
  }
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Render a past timestamp as "2h" / "Yesterday" / "Aug 29" for feed rows.
 *  `now` is injectable for deterministic tests. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) {
    return "";
  }
  const seconds = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  if (seconds < 60) {
    return "Just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);
  if (dayDiff === 1) {
    return "Yesterday";
  }
  if (dayDiff < 7) {
    return `${dayDiff}d`;
  }
  return `${MONTHS[then.getMonth()]} ${then.getDate()}`;
}

/** Deterministic Philippine-peso formatting, e.g. 20 -> "₱20.00". Intl-free so
 *  tests/snapshots never depend on host locale. */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) {
    return "—";
  }
  const negative = amount < 0;
  const fixed = Math.abs(amount).toFixed(2);
  const [whole, cents] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}₱${grouped}.${cents}`;
}
