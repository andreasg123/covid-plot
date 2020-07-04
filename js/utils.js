export function toDate(d) {
  // Converts a number in the format 20200321 into a Date object.
  // Don't turn d into an ISO string '2020-03-21' because that produces UTC,
  // causing data points not to line up with x-axis marks.
  const day = d % 100;
  d = (d - day) / 100;
  const month = d % 100;
  const year = (d - month) / 100;
  return new Date(year, month - 1, day);
}
