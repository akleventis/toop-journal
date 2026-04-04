import { pbkdf2Sync, randomBytes } from 'crypto';

const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 32;
const HASH_BYTES = 64;

/**
 * Hashes a password using PBKDF2-SHA512.
 *
 * @param password - The password to hash
 * @param salt - Optional salt (hex string). If not provided, generates a new salt.
 * @returns Object containing the hash and salt as hex strings
 */
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const saltBuffer = salt ? Buffer.from(salt, 'hex') : randomBytes(SALT_BYTES);
  const hashBuffer = pbkdf2Sync(password, saltBuffer, PBKDF2_ITERATIONS, HASH_BYTES, 'sha512');
  return {
    hash: hashBuffer.toString('hex'),
    salt: saltBuffer.toString('hex')
  };
}

/**
 * Verifies a password against a stored hash and salt.
 *
 * @param password - The password to verify
 * @param hash - The stored hash (hex string)
 * @param salt - The stored salt (hex string)
 * @returns True if password matches, false otherwise
 */
export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const result = hashPassword(password, salt);
  return result.hash === hash;
}
