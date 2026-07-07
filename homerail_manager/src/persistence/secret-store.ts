import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { getDataRoot } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;

export interface EncryptedSecret {
  v: 1;
  alg: "aes-256-gcm";
  kid: "local";
  iv: string;
  tag: string;
  ciphertext: string;
}

function _secretDir(): string {
  return path.join(getDataRoot(), "secrets");
}

export function masterKeyPath(): string {
  return path.join(_secretDir(), "master.key");
}

function _ensureSecretDir(): void {
  fs.mkdirSync(_secretDir(), { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(_secretDir(), 0o700);
  } catch {
    // Best effort on platforms that do not support POSIX modes.
  }
}

function _decodeEnvKey(value: string): Buffer | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^[A-Fa-f0-9]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  try {
    const decoded = Buffer.from(trimmed, "base64");
    return decoded.length === KEY_BYTES ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function _readOrCreateMasterKey(): Buffer {
  const envKey = process.env.HOMERAIL_MANAGER_SECRET_KEY ?? process.env.HOMERAIL_SECRET_KEY;
  if (envKey) {
    const decoded = _decodeEnvKey(envKey);
    if (!decoded) {
      throw new Error("HOMERAIL_MANAGER_SECRET_KEY must be 32 bytes encoded as base64 or 64 hex characters");
    }
    return decoded;
  }

  _ensureSecretDir();
  const filePath = masterKeyPath();
  if (fs.existsSync(filePath)) {
    const key = Buffer.from(fs.readFileSync(filePath, "utf-8").trim(), "base64");
    if (key.length !== KEY_BYTES) {
      throw new Error(`Invalid Manager secret key at ${filePath}`);
    }
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // Best effort on platforms that do not support POSIX modes.
    }
    return key;
  }

  const key = crypto.randomBytes(KEY_BYTES);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, `${key.toString("base64")}\n`, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best effort on platforms that do not support POSIX modes.
  }
  return key;
}

export function isEncryptedSecret(value: unknown): value is EncryptedSecret {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  return rec.v === 1 &&
    rec.alg === ALGORITHM &&
    rec.kid === "local" &&
    typeof rec.iv === "string" &&
    typeof rec.tag === "string" &&
    typeof rec.ciphertext === "string";
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = _readOrCreateMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    alg: ALGORITHM,
    kid: "local",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptSecret(secret: EncryptedSecret): string {
  const key = _readOrCreateMasterKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(secret.iv, "base64"));
  decipher.setAuthTag(Buffer.from(secret.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf-8");
}
