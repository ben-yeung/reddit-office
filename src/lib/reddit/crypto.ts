/**
 * Authenticated encryption for the session cookie (ADR-0008).
 *
 * AES-256-GCM via the Web Crypto API (available globally on the Node runtime),
 * so there is no third-party crypto dependency. The key is derived from
 * `SESSION_SECRET` with SHA-256. Output is URL-safe base64 of `iv || ciphertext`
 * (GCM appends its auth tag to the ciphertext), which tamper-detects on decrypt.
 */

const IV_BYTES = 12; // 96-bit nonce, the standard for AES-GCM.

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return Buffer.from(bin, "binary").toString("base64url");
}

function fromBase64Url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function requireSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return secret;
}

/** Encrypt an arbitrary JSON-serializable payload into an opaque cookie string. */
export async function seal(payload: unknown): Promise<string> {
  const key = await deriveKey(requireSecret());
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv, 0);
  packed.set(cipher, iv.length);
  return toBase64Url(packed);
}

/** Decrypt a cookie string, or return `null` if missing/tampered/undecryptable. */
export async function unseal<T>(value: string | undefined): Promise<T | null> {
  if (!value) return null;
  try {
    const key = await deriveKey(requireSecret());
    const packed = fromBase64Url(value);
    const iv = packed.slice(0, IV_BYTES);
    const cipher = packed.slice(IV_BYTES);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    return null;
  }
}

/** A random URL-safe token, used for the OAuth CSRF `state`. */
export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}
