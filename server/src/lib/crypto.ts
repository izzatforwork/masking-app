import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "crypto";

export type EncryptedPayload = {
  version: 1;
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
};

const KEY_LEN = 32;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LEN, SCRYPT_PARAMS);
}

/** Encrypts a token->real-value mapping with AES-256-GCM under a passphrase-derived key. */
export function encryptMapping(
  mapping: Record<string, string>,
  passphrase: string
): EncryptedPayload {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(mapping), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    version: 1,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  };
}

/**
 * Decrypts a mapping payload. Throws if the passphrase is wrong or the file
 * is corrupted (GCM auth tag verification fails) — never silently returns
 * garbage.
 */
export function decryptMapping(
  payload: EncryptedPayload,
  passphrase: string
): Record<string, string> {
  const salt = Buffer.from(payload.salt, "hex");
  const iv = Buffer.from(payload.iv, "hex");
  const authTag = Buffer.from(payload.authTag, "hex");
  const ciphertext = Buffer.from(payload.ciphertext, "hex");
  const key = deriveKey(passphrase, salt);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  try {
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw new Error("Incorrect passphrase or corrupted mapping file.");
  }
}
