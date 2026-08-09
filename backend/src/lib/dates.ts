// Africa/Accra is UTC+0 year-round, so UTC methods give studio-local time.

export function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-GH", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function fmtTime(d: Date): string {
  return d.toISOString().slice(11, 16);
}

export function fmtDateTime(d: Date): string {
  return `${fmtDay(d)} · ${fmtTime(d)}`;
}

export function startOfUTCDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
