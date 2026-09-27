/** Minimum age for SOUL (spec: strictly 18+). The server enforces this independently. */
export const MINIMUM_AGE = 18;

export type DateParts = { day: number; month: number; year: number };

/** Keeps only digits and formats progressively as DD / MM / YYYY. */
export function formatDobInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join(' / ');
}

/** Parses a complete DD / MM / YYYY value into a real calendar date, or null. */
export function parseDob(formatted: string): DateParts | null {
  const digits = formatted.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real ? { day, month, year } : null;
}

/** Whole years between the date of birth and `today` (birthday counted on the day). */
export function ageOn(dob: DateParts, today: Date): number {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  let age = y - dob.year;
  if (m < dob.month || (m === dob.month && d < dob.day)) age -= 1;
  return age;
}

/** ISO date (YYYY-MM-DD) for the server. */
export function toIsoDate({ day, month, year }: DateParts): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}
