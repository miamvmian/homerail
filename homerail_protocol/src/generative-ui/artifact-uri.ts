/**
 * Artifact references are passive identifiers or locations. They are never
 * executable URLs, data URLs, protocol-relative URLs, or network share paths.
 */

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const HTTP_URI = /^https?:\/\/[^\s\\]+$/i;
const ARTIFACT_URI = /^artifact:[A-Za-z0-9][A-Za-z0-9._~/%-]*$/i;
const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[\\/](?![\\/])[^\u0000-\u001f\u007f]*$/;

export function isSafeGenerativeUiArtifactUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 2_048) return false;
  if (value !== value.trim() || CONTROL_CHARACTER.test(value)) return false;

  // Browsers normalize every slash/backslash pair here into a network URL.
  if (/^[\\/]{2}/.test(value) || value.startsWith("\\")) return false;

  if (HTTP_URI.test(value)) {
    try {
      const parsed = new URL(value);
      return (parsed.protocol === "http:" || parsed.protocol === "https:")
        && Boolean(parsed.hostname)
        && !parsed.username
        && !parsed.password;
    } catch {
      return false;
    }
  }
  if (/^https?:/i.test(value)) return false;
  if (ARTIFACT_URI.test(value)) return true;
  if (/^artifact:/i.test(value)) return false;
  if (WINDOWS_DRIVE_PATH.test(value)) return true;

  // A colon would introduce an unrecognized scheme. A single leading slash is
  // a local absolute path; a leading backslash is rejected above.
  return !value.includes(":");
}
