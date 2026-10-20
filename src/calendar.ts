/**
 * Local-date maths: holiday events, seasons and weeks. Everything uses the
 * machine's local calendar day, so events and weeks turn over at local
 * midnight. Pure functions of a Date, so tests can pin any day.
 */

export const EVENT_IDS = [
  'newyear',
  'valentine',
  'easter',
  'halloween',
  'thanksgiving',
  'christmas',
] as const;
export type EventId = (typeof EVENT_IDS)[number];

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export type Hemisphere = 'north' | 'south';

/** What the webview needs to dress the scene for today. */
export interface Calendar {
  /** Local date, YYYY-MM-DD. */
  day: string;
  events: EventId[];
  season: Season;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A day count for a local calendar date, safe to compare and subtract. */
function dayNumber(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month, day) / DAY_MS);
}

function today(date: Date): number {
  return dayNumber(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Easter Sunday (Gregorian) as [month (0-based), day]. Anonymous Gregorian algorithm. */
export function easterSunday(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month - 1, day];
}

/** US Thanksgiving: the fourth Thursday of November, as the day of the month. */
export function thanksgivingDay(year: number): number {
  const firstWeekday = new Date(year, 10, 1).getDay();
  const firstThursday = 1 + ((4 - firstWeekday + 7) % 7);
  return firstThursday + 21;
}

/** Holiday events running on `date`, in calendar order. */
export function activeEvents(date: Date): EventId[] {
  const y = date.getFullYear();
  const n = today(date);
  const within = (from: number, to: number) => n >= from && n <= to;
  const [em, ed] = easterSunday(y);
  const easter = dayNumber(y, em, ed);
  const thanks = dayNumber(y, 10, thanksgivingDay(y));
  const ranges: Array<[EventId, boolean]> = [
    ['newyear', within(dayNumber(y, 0, 1), dayNumber(y, 0, 2)) || n === dayNumber(y, 11, 31)],
    ['valentine', within(dayNumber(y, 1, 10), dayNumber(y, 1, 14))],
    ['easter', within(easter - 2, easter + 1)],
    ['halloween', within(dayNumber(y, 9, 24), dayNumber(y, 9, 31))],
    ['thanksgiving', within(thanks - 1, thanks + 1)],
    ['christmas', within(dayNumber(y, 11, 18), dayNumber(y, 11, 26))],
  ];
  return ranges.filter(([, on]) => on).map(([id]) => id);
}

/** Meteorological seasons: whole months, flipped for the southern hemisphere. */
export function seasonOf(date: Date, hemisphere: Hemisphere): Season {
  const north: Season[] = ['winter', 'spring', 'summer', 'autumn'];
  const index = Math.floor(((date.getMonth() + 1) % 12) / 3);
  return north[hemisphere === 'south' ? (index + 2) % 4 : index];
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function calendarFor(date: Date, hemisphere: Hemisphere): Calendar {
  return { day: localDay(date), events: activeEvents(date), season: seasonOf(date, hemisphere) };
}

/** Local midnight on the Monday that starts `date`'s week, in ms. */
export function weekStart(date: Date): number {
  const back = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - back).getTime();
}

/** The week's id: its Monday as YYYY-MM-DD. Every window agrees on it. */
export function weekId(date: Date): string {
  return localDay(new Date(weekStart(date)));
}
