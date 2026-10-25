import { addCalendarDays, dayKey, localDayKey, localParts, zonedToUtc } from "@/lib/planner/time";

export async function apiJson<T>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error ?? "The request failed.") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body as T;
}

export function formatTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

export function formatDateTime(iso: string | null, timeZone: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function formatDayHeading(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

export function dayKeyOf(iso: string, timeZone: string) {
  return localDayKey(Date.parse(iso), timeZone);
}

export function todayKey(timeZone: string) {
  return localDayKey(Date.now(), timeZone);
}

export function shiftDay(key: string, offset: number) {
  const [year, month, day] = key.split("-").map(Number);
  const next = addCalendarDays(year, month, day, offset);
  return dayKey(next.year, next.month, next.day);
}

export function weekDays(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const monday = shiftDay(key, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => shiftDay(monday, index));
}

/** ISO instant → value for <input type="datetime-local"> in the workspace time zone. */
export function toLocalInput(iso: string | null, timeZone: string) {
  if (!iso) return "";
  const p = localParts(Date.parse(iso), timeZone);
  return `${dayKey(p.year, p.month, p.day)}T${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** <input type="datetime-local"> value interpreted in the workspace time zone → ISO instant. */
export function fromLocalInput(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, y, m, d, h, min] = match.map(Number);
  return new Date(zonedToUtc(y, m, d, h * 60 + min, timeZone)).toISOString();
}

/** Start of the next working day in the workspace time zone (used by "push to tomorrow"). */
export function nextWorkingDayStart(timeZone: string, days: number[], startMinute: number) {
  const today = todayKey(timeZone);
  for (let offset = 1; offset <= 7; offset += 1) {
    const key = shiftDay(today, offset);
    const [year, month, day] = key.split("-").map(Number);
    if (days.includes(new Date(Date.UTC(year, month - 1, day)).getUTCDay())) {
      return new Date(zonedToUtc(year, month, day, startMinute, timeZone)).toISOString();
    }
  }
  return null;
}

export function minutesLabel(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
