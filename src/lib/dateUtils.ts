function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Subtract 2 hours from the provided date and return local YYYY-MM-DD
export function getLogicalDate(d: Date): string {
  const shifted = new Date(d.getTime() - 2 * 60 * 60 * 1000);
  const year = shifted.getFullYear();
  const month = pad(shifted.getMonth() + 1);
  const day = pad(shifted.getDate());
  return `${year}-${month}-${day}`;
}

export function getDayOfWeekString(d: Date): string {
  // determine the day-of-week based on the logical date (2-hour shift)
  const shifted = new Date(d.getTime() - 2 * 60 * 60 * 1000);
  const dow = shifted.getDay(); // 0 (Sun) .. 6 (Sat)
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return names[dow];
}

export function isNewWeeklyCycle(lastResetDateStr: string, currentLogicalDateStr: string): boolean {
  // return true if a Monday (logical) occurred strictly after lastResetDateStr and
  // less than or equal to currentLogicalDateStr
  const start = new Date(`${lastResetDateStr}T12:00:00`);
  const end = new Date(`${currentLogicalDateStr}T12:00:00`);

  // iterate days from start + 1 to end inclusive
  let cursor = addDays(start, 1);
  while (cursor <= end) {
    const dow = getDayOfWeekString(cursor);
    if (dow === 'Mon') return true;
    cursor = addDays(cursor, 1);
  }
  return false;
}
