function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function envelopeInputValueToTaskText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  try {
    return stableJson(value);
  } catch {
    return String(value);
  }
}

export function envelopeInputsToTaskText(inputs: unknown): string {
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) return "";
  const sections: string[] = [];
  for (const [port, rawValues] of Object.entries(inputs as Record<string, unknown>)) {
    const values = Array.isArray(rawValues) ? rawValues : [rawValues];
    for (const value of values) {
      const text = envelopeInputValueToTaskText(value).trim();
      if (!text) continue;
      sections.push(`## input:${port}\n${text}`);
    }
  }
  return sections.join("\n\n");
}
