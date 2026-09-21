const siteDateFormatter = new Intl.DateTimeFormat("en", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date at the Korean project site, independent of the viewer's timezone. */
export function siteDate(now = new Date()) {
  const parts = Object.fromEntries(
    siteDateFormatter
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
