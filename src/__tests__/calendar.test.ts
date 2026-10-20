import {
  activeEvents,
  calendarFor,
  easterSunday,
  seasonOf,
  thanksgivingDay,
  weekId,
  weekStart,
} from '../calendar';

/** Local noon, so no test depends on the machine's time zone. */
const on = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe('easterSunday', () => {
  it.each([
    [2024, [2, 31]],
    [2025, [3, 20]],
    [2026, [3, 5]],
    [2027, [2, 28]],
    [2038, [3, 25]],
  ])('%i', (year, expected) => {
    expect(easterSunday(year)).toEqual(expected);
  });
});

describe('thanksgivingDay', () => {
  it.each([
    [2024, 28],
    [2025, 27],
    [2026, 26],
    [2027, 25],
  ])('%i is the fourth Thursday', (year, day) => {
    expect(thanksgivingDay(year)).toBe(day);
    expect(new Date(year, 10, day).getDay()).toBe(4);
  });
});

describe('activeEvents', () => {
  it.each([
    [on(2026, 10, 23), []],
    [on(2026, 10, 24, 0), ['halloween']],
    [on(2026, 10, 31, 23), ['halloween']],
    [on(2026, 11, 1), []],
    [on(2026, 11, 25), ['thanksgiving']],
    [on(2026, 11, 27), ['thanksgiving']],
    [on(2026, 11, 28), []],
    [on(2026, 12, 17), []],
    [on(2026, 12, 18), ['christmas']],
    [on(2026, 12, 26), ['christmas']],
    [on(2026, 12, 31), ['newyear']],
    [on(2027, 1, 2), ['newyear']],
    [on(2027, 1, 3), []],
    [on(2027, 2, 9), []],
    [on(2027, 2, 14), ['valentine']],
    [on(2027, 3, 26), ['easter']],
    [on(2027, 3, 29), ['easter']],
    [on(2027, 3, 30), []],
    [on(2026, 7, 4), []],
  ])('%s', (date, events) => {
    expect(activeEvents(date)).toEqual(events);
  });

  it('only ever names known events, every day for two years', () => {
    const seen = new Set<string>();
    for (let d = 0; d < 730; d++) {
      for (const e of activeEvents(on(2026, 1, 1 + d))) {
        seen.add(e);
      }
    }
    expect([...seen].sort()).toEqual(
      ['christmas', 'easter', 'halloween', 'newyear', 'thanksgiving', 'valentine'].sort(),
    );
  });
});

describe('seasonOf', () => {
  it.each([
    [1, 'winter', 'summer'],
    [3, 'spring', 'autumn'],
    [5, 'spring', 'autumn'],
    [6, 'summer', 'winter'],
    [9, 'autumn', 'spring'],
    [11, 'autumn', 'spring'],
    [12, 'winter', 'summer'],
  ])('month %i is %s up north and %s down south', (month, north, south) => {
    expect(seasonOf(on(2026, month, 15), 'north')).toBe(north);
    expect(seasonOf(on(2026, month, 15), 'south')).toBe(south);
  });
});

describe('weeks', () => {
  it('start on Monday at local midnight', () => {
    expect(new Date(weekStart(on(2026, 10, 19))).getDay()).toBe(1);
    expect(weekId(on(2026, 10, 19, 0))).toBe('2026-10-19');
    expect(weekId(on(2026, 10, 25, 23))).toBe('2026-10-19');
    expect(weekId(on(2026, 10, 26, 0))).toBe('2026-10-26');
    expect(weekId(on(2027, 1, 1))).toBe('2026-12-28');
    expect(new Date(weekStart(on(2026, 10, 21))).getHours()).toBe(0);
  });
});

describe('calendarFor', () => {
  it('bundles the day, events and season', () => {
    expect(calendarFor(on(2026, 10, 30), 'north')).toEqual({
      day: '2026-10-30',
      events: ['halloween'],
      season: 'autumn',
    });
  });
});
