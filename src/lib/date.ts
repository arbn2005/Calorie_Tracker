export const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

export function addDays(timestamp: number, days: number): number {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

export interface DayBucket {
  ts: number;
  key: string;
  label: string;
  isToday: boolean;
}

export function lastNDays(count: number, end = Date.now()): DayBucket[] {
  const today = startOfDay(end);
  const days: DayBucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const ts = addDays(today, -i);
    days.push({
      ts,
      key: dayKey(ts),
      label: new Date(ts).toLocaleDateString(undefined, {
        weekday: "short",
        day: count > 10 ? undefined : "numeric",
      }),
      isToday: i === 0,
    });
  }
  return days;
}

export function formatToday(timestamp = Date.now()): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function formatShortDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function mealForTime(timestamp = Date.now()): {
  mealType: "breakfast" | "lunch" | "dinner" | "snacks";
} {
  const hour = new Date(timestamp).getHours();
  if (hour >= 5 && hour < 11) return { mealType: "breakfast" };
  if (hour >= 11 && hour < 16) return { mealType: "lunch" };
  if (hour >= 16 && hour < 21) return { mealType: "dinner" };
  return { mealType: "snacks" };
}
