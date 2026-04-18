import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM encryption primitives for entry content.
// stored format: "enc:<iv_hex>:<ciphertext+tag_hex>"
//   iv      = random 12-byte nonce (24 hex chars), unique per write
//   payload = ciphertext followed by 16-byte GCM auth tag

export const ENC_PREFIX = 'enc:';

/**
 * Returns true if the string was produced by {@link encrypt}.
 *
 * @param {string} s - The string to check.
 * @returns {boolean}
 */
export function isEncryptedContent(s: string): boolean {
  return s.startsWith(ENC_PREFIX);
}

/**
 * Encrypts plaintext using AES-256-GCM with a random IV.
 *
 * @param {string} plaintext - The plaintext to encrypt.
 * @param {Buffer} key - 32-byte AES key.
 * @returns {string} Encoded as "enc:<iv_hex>:<ciphertext+tag_hex>".
 */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ENC_PREFIX + iv.toString('hex') + ':' + Buffer.concat([ciphertext, authTag]).toString('hex');
}

/**
 * Decrypts a string produced by {@link encrypt}. Returns the input unchanged if not encrypted.
 *
 * @param {string} stored - The stored ciphertext string.
 * @param {Buffer} key - 32-byte AES key.
 * @returns {string} Decrypted plaintext.
 */
export function decrypt(stored: string, key: Buffer): string {
  if (!isEncryptedContent(stored)) return stored;
  const withoutPrefix = stored.slice(ENC_PREFIX.length);
  const sepIdx = withoutPrefix.indexOf(':');
  const iv = Buffer.from(withoutPrefix.slice(0, sepIdx), 'hex');
  const payload = Buffer.from(withoutPrefix.slice(sepIdx + 1), 'hex');
  const authTag = payload.subarray(payload.length - 16); // last 16 bytes are the GCM auth tag
  const ciphertext = payload.subarray(0, payload.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}
