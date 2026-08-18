export interface CronFields {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
}

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") throw new Error(`Empty cron field segment in "${field}"`);
    const [rangePart, stepPart] = trimmed.split("/");
    if (rangePart === undefined) throw new Error(`Invalid cron segment "${trimmed}"`);
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`Invalid cron step "${stepPart}" in "${field}"`);
    }
    let lo: number;
    let hi: number;
    if (rangePart === "*") {
      lo = min;
      hi = max;
    } else if (rangePart.includes("-")) {
      const bounds = rangePart.split("-").map(Number);
      const a = bounds[0] ?? NaN;
      const b = bounds[1] ?? NaN;
      if (!Number.isInteger(a) || !Number.isInteger(b) || a > b) {
        throw new Error(`Invalid cron range "${rangePart}" in "${field}"`);
      }
      lo = a;
      hi = b;
    } else {
      const n = Number(rangePart);
      if (!Number.isInteger(n)) throw new Error(`Invalid cron value "${rangePart}" in "${field}"`);
      if (stepPart !== undefined) {
        lo = n;
        hi = max;
      } else {
        lo = n;
        hi = n;
      }
    }
    if (lo < min || hi > max) {
      throw new Error(`Cron value out of range [${min},${max}] in "${field}"`);
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return values;
}

export function parseCron(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Cron expression must have 5 fields, got ${parts.length}: "${expr}"`);
  }
  const [minute, hour, dom, month, dow] = parts as [string, string, string, string, string];
  return {
    minutes: parseField(minute, 0, 59),
    hours: parseField(hour, 0, 23),
    daysOfMonth: parseField(dom, 1, 31),
    months: parseField(month, 1, 12),
    daysOfWeek: parseField(dow, 0, 6),
    domRestricted: dom !== "*",
    dowRestricted: dow !== "*",
  };
}

const partCache = new Map<string, Intl.DateTimeFormat>();

function zonedParts(ts: number, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  let fmt = partCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    });
    partCache.set(timeZone, fmt);
  }
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(ts))) parts[p.type] = p.value;
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const hour = Number(parts.hour) % 24;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    weekday: weekdayMap[parts.weekday ?? "Sun"] ?? 0,
  };
}

function matches(fields: CronFields, ts: number, timeZone: string): boolean {
  const p = zonedParts(ts, timeZone);
  if (!fields.months.has(p.month)) return false;
  const domMatch = fields.daysOfMonth.has(p.day);
  const dowMatch = fields.daysOfWeek.has(p.weekday);
  if (fields.domRestricted && fields.dowRestricted) {
    if (!domMatch && !dowMatch) return false;
  } else if (fields.domRestricted) {
    if (!domMatch) return false;
  } else if (fields.dowRestricted) {
    if (!dowMatch) return false;
  }
  if (!fields.hours.has(p.hour)) return false;
  if (!fields.minutes.has(p.minute)) return false;
  return true;
}

export function nextRunAfter(
  expr: string,
  after: number,
  timeZone: string = "UTC",
): number {
  const fields = parseCron(expr);
  const start = Math.floor(after / 60_000) * 60_000 + 60_000;
  const horizon = start + 366 * 24 * 60 * 60_000;
  for (let ts = start; ts <= horizon; ts += 60_000) {
    if (matches(fields, ts, timeZone)) return ts;
  }
  throw new Error(`No cron match within a year for "${expr}"`);
}

export function describeCron(expr: string): string {
  parseCron(expr);
  return expr;
}
