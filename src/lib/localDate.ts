/**
 * Turn the value of an `<input type="date">` ("YYYY-MM-DD") into an ISO deadline
 * at 23:59 local time on that day, matching what capture and clarification save.
 * `new Date("YYYY-MM-DD")` would be read as UTC midnight, which lands on the
 * wrong day (or already overdue) for anyone not in UTC.
 * Returns undefined for an empty or invalid value.
 */
export function localEndOfDayIso(dateInput: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput);
  if (!match) return undefined;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day, 23, 59);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return date.toISOString();
}
