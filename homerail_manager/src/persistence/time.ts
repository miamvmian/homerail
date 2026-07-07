export type IsoTimestamp = string & { readonly __isoTimestamp: unique symbol };
export type EpochMs = number & { readonly __epochMs: unique symbol };

export function nowIso(): IsoTimestamp {
  return new Date().toISOString() as IsoTimestamp;
}

export function nowEpochMs(): EpochMs {
  return Date.now() as EpochMs;
}

export function assertIsoTimestamp(value: string, label: string): IsoTimestamp {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${label} must be an ISO-8601 timestamp`);
  }
  return value as IsoTimestamp;
}

export function assertEpochMs(value: number, label: string): EpochMs {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`${label} must be a Unix epoch millisecond integer`);
  }
  return value as EpochMs;
}

export function epochMsFromUnknown(value: unknown, label: string): EpochMs {
  if (typeof value === "number") return assertEpochMs(value, label);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return assertEpochMs(Math.trunc(parsed), label);
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return assertEpochMs(timestamp, label);
  }
  throw new Error(`${label} must be a Unix epoch millisecond integer or ISO-8601 timestamp`);
}
