// All schedule math happens in the school's timezone. Cloud Functions run in UTC
// and kiosks may have wrong clocks, so never use Date#getHours() directly.
export const SCHOOL_TIME_ZONE = 'America/New_York';

export interface SchoolClock {
  /** 0 = Sunday .. 6 = Saturday */
  day: number;
  /** Minutes since local midnight, fractional. */
  minutes: number;
  /** "2026-09-25" in school-local time. */
  dateKey: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function schoolClock(at: Date | number, timeZone = SCHOOL_TIME_ZONE): SchoolClock {
  const date = typeof at === 'number' ? new Date(at) : at;
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date).map((p) => [p.type, p.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute) + Number(parts.second) / 60 + date.getMilliseconds() / 60000;
  return { day: WEEKDAYS.indexOf(parts.weekday!), minutes, dateKey: `${parts.year}-${parts.month}-${parts.day}` };
}
