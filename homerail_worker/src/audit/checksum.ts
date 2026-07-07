/**
 * SHA-256 checksums for transcript and tool-event files.
 * @version 0.1.0
 */

import { createHash } from "node:crypto";
import { readFileSync, existsSync, writeFileSync } from "node:fs";

export function computeLineChecksum(line: string): string {
  return createHash("sha256").update(line).digest("hex");
}

export function checksumTranscript(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, "utf-8");
  return createHash("sha256").update(content).digest("hex");
}

export function transcriptChecksumPath(filePath: string): string {
  return `${filePath}.sha256`;
}

export function writeTranscriptChecksum(filePath: string): string | null {
  const checksum = checksumTranscript(filePath);
  if (!checksum) return null;
  writeFileSync(transcriptChecksumPath(filePath), `${checksum}\n`, { mode: 0o600 });
  return checksum;
}

export function readTranscriptChecksum(filePath: string): string | null {
  const sidecarPath = transcriptChecksumPath(filePath);
  if (!existsSync(sidecarPath)) return null;
  const value = readFileSync(sidecarPath, "utf-8").trim();
  return /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null;
}

export function verifyTranscriptChecksum(filePath: string): boolean | null {
  const expected = readTranscriptChecksum(filePath);
  if (!expected) return null;
  return verifyTranscript(filePath, expected);
}

export function verifyTranscript(filePath: string, expected: string): boolean {
  const actual = checksumTranscript(filePath);
  if (!actual) return false;
  return actual === expected;
}
