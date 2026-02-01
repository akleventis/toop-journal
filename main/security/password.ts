import { pbkdf2Sync, randomBytes } from 'crypto';

/**
 * Hashes a password using PBKDF2-SHA512.
 *
 * @param password - The password to hash
 * @param salt - Optional salt (hex string). If not provided, generates a new salt.
 * @returns Object containing the hash and salt as hex strings
 */
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const saltBuffer = salt ? Buffer.from(salt, 'hex') : randomBytes(32);
  const hashBuffer = pbkdf2Sync(password, saltBuffer, 100000, 64, 'sha512');
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
